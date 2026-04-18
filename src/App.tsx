import React, { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import html2pdf from 'html2pdf.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  ExternalLink, 
  Sparkles, 
  Globe, 
  MessageSquare, 
  Menu,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Paperclip,
  FileText,
  ListChecks,
  Check,
  Copy,
  Lock,
  Unlock,
  Upload,
  BookOpen,
  Package,
  Briefcase,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  Image as ImageIcon,
  FileType,
  Layers,
  Search,
  FileCode,
  Eye,
  Mic,
  Square,
  AudioLines,
  RefreshCw,
  Download,
  ThumbsUp,
  ThumbsDown,
  Share2
} from 'lucide-react';

// --- Types (Các kiểu dữ liệu) ---

interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: number;
  sources?: Source[];
  images?: string[];
  isError?: boolean;
}

interface Source {
  title: string;
  uri: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

interface AttachedFile {
  id: string;
  name: string;
  content: string; // Nội dung Text hoặc chuỗi Base64
  type: string;    // Loại MIME
  isBinary: boolean; // Cờ đánh dấu file nhị phân (Ảnh/PDF)
  dataUrl?: string; // URL để xem trước ảnh
  size?: number;
}

// --- Cấu hình API & Dữ liệu ---

const getEnvApiKey = () => process.env.GEMINI_API_KEY || '';

const MODEL_NAME = "gemini-2.0-flash";
const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 10; 

const CONSTRUCTION_DATA = {
  materials: [
    "Bê tông thương phẩm",
    "Thép cốt bê tông",
    "Xi măng",
    "Cát xây dựng",
    "Đá dăm (Cốt liệu lớn)",
    "Gạch đất sét nung",
    "Gạch không nung",
    "Vữa xây dựng",
    "Gạch ốp lát",
    "Sơn tường",
    "Kính xây dựng",
    "Ống nhựa & Phụ kiện"
  ],
  tasks: [
    "Trắc đạc công trình",
    "Đào đất hố móng",
    "Gia cố nền móng",
    "Gia công lắp dựng Cốt thép",
    "Gia công lắp dựng Ván khuôn",
    "Đổ bê tông",
    "Xây tường gạch",
    "Trát tường",
    "Lát nền",
    "Ốp tường",
    "Sơn bả tường",
    "Thi công điện",
    "Thi công cấp thoát nước",
    "Công tác chống thấm"
  ]
};

// --- Hàm hỗ trợ ---

const generateId = () => Math.random().toString(36).substring(2, 11);

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// --- Các Component hiển thị ---

// Xử lý in đậm (**text**)
const parseBold = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

// Component hiển thị bảng
const SimpleTable: React.FC<{ lines: string[] }> = ({ lines }) => {
  // Loại bỏ dòng separator (ví dụ: |---|---|)
  const headers = lines[0].split('|').filter(c => c.trim() !== '').map(c => c.trim());
  
  // Lọc các dòng dữ liệu, bỏ qua dòng phân cách (thường chứa ---)
  const rows = lines.slice(1).filter(line => !line.includes('---')).map(line => 
    line.split('|').filter(c => c.trim() !== '').map(c => c.trim())
  );

  return (
    <div className="overflow-x-auto my-3 border border-gray-200 rounded-lg shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h, idx) => (
              <th key={idx} className="px-4 py-3 text-left font-semibold text-gray-700 uppercase tracking-wider text-xs border-r last:border-r-0 border-gray-200">
                {parseBold(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-gray-50 transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-4 py-2.5 text-gray-700 whitespace-pre-wrap border-r last:border-r-0 border-gray-200 align-top leading-relaxed">
                  {parseBold(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Hiển thị nội dung Markdown đơn giản (Checklist, Gạch đầu dòng, Tiêu đề, Bảng, Input)
const FormattedContent: React.FC<{ content: string; onInputSubmit?: (values: Record<string, string>) => void }> = ({ content, onInputSubmit }) => {
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const lines = content.split('\n');
  const elements = [];
  let i = 0;

  const toggleCheck = (index: number) => {
    setCheckedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleInputChange = (key: string, value: string) => {
    setInputValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmitInputs = () => {
    if (onInputSubmit) {
      onInputSubmit(inputValues);
    }
  };

  // Kiểm tra xem có bất kỳ input nào trong nội dung không
  const hasInputs = content.includes('{{input:');

  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Phát hiện Bảng Markdown
    if (line.startsWith('|') && i + 1 < lines.length && lines[i+1].trim().startsWith('|') && lines[i+1].includes('-')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      elements.push(<SimpleTable key={`table-${i}`} lines={tableLines} />);
    } else {
      const currentIndex = i;
      const renderLine = () => {
        if (!line) return <div key={currentIndex} className="h-2" />;

        // Tiêu đề
        if (line.startsWith('## ')) {
          return <h3 key={currentIndex} className="text-lg font-bold text-indigo-700 mt-4 mb-2">{line.replace('## ', '')}</h3>
        }
        if (line.startsWith('### ')) {
          return <h4 key={currentIndex} className="text-base font-bold text-gray-800 mt-3 mb-1">{line.replace('### ', '')}</h4>
        }

        // Checklist
        const checklistMatch = line.match(/^[\*\-]\s\[([ xX])\]\s(.*)/);
        if (checklistMatch) {
          const initialChecked = checklistMatch[1].toLowerCase() === 'x';
          const isChecked = checkedItems[currentIndex] !== undefined ? checkedItems[currentIndex] : initialChecked;
          const text = checklistMatch[2];
          return (
            <div 
              key={currentIndex} 
              className="flex items-start gap-3 my-1.5 group cursor-pointer"
              onClick={() => toggleCheck(currentIndex)}
            >
              <div className={`mt-1 w-4.5 h-4.5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all duration-200
                ${isChecked 
                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' 
                  : 'bg-white border-gray-300 group-hover:border-indigo-400'}`}>
                {isChecked && <Check size={12} strokeWidth={4} />}
              </div>
              <span className={`leading-relaxed transition-colors duration-200 ${isChecked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {parseBold(text)}
              </span>
            </div>
          );
        }

        // Bullet points
        const bulletMatch = line.match(/^[\*\-]\s(.*)/);
        if (bulletMatch) {
          return (
            <div key={currentIndex} className="flex items-start gap-3 my-1 ml-1">
              <span className="mt-2.5 w-1.5 h-1.5 bg-indigo-400 rounded-full flex-shrink-0" />
              <span className="leading-relaxed text-gray-700">{parseBold(bulletMatch[1])}</span>
            </div>
          );
        }

        // Văn bản thường & Input fields
        return (
          <div key={currentIndex} className="leading-relaxed min-h-[1.5em] text-gray-700 mb-1">
            {line.includes('{{input:') ? (
              <div className="flex flex-wrap items-center gap-2 py-1">
                {line.split(/(\{\{input:.*?\}\})/g).map((part, pIdx) => {
                  const inputMatch = part.match(/\{\{input:(.*?)\}\}/);
                  if (inputMatch) {
                    const label = inputMatch[1];
                    return (
                      <input
                        key={pIdx}
                        type="text"
                        placeholder={label}
                        value={inputValues[label] || ''}
                        onChange={(e) => handleInputChange(label, e.target.value)}
                        className="px-2 py-1 text-sm border-b-2 border-indigo-300 focus:border-indigo-600 outline-none bg-indigo-50/30 rounded-t-md min-w-[120px] transition-all"
                      />
                    );
                  }
                  return <span key={pIdx}>{parseBold(part)}</span>;
                })}
              </div>
            ) : (
              parseBold(line)
            )}
          </div>
        );
      };
      
      elements.push(renderLine());
      i++;
    }
  }

  return (
    <div className="flex flex-col space-y-0.5">
      {elements}
      {hasInputs && (
        <div className="mt-4 pt-3 border-t border-dashed border-indigo-200 flex justify-end">
          <button
            onClick={handleSubmitInputs}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all"
          >
            <Send size={14} />
            Gửi thông tin bổ sung
          </button>
        </div>
      )}
    </div>
  );
};

// --- Logic gọi Gemini API ---

// --- Logic gọi Gemini API ---

async function callGemini(
  prompt: string, 
  history: Message[], 
  useSearch: boolean,
  attachedFiles: AttachedFile[],
  isChecklistMode: boolean,
  useInternalOnly: boolean,
  activeApiKey: string
): Promise<{ text: string; sources: Source[] }> {
  try {
    if (!activeApiKey) {
      throw new Error("Vui lòng cung cấp API Key để sử dụng tính năng này.");
    }
    const genAI = new GoogleGenerativeAI(activeApiKey);

    const isDocMode = attachedFiles.length > 0;
    const isStrictInternal = isDocMode && useInternalOnly;

    // Khởi tạo model với system instruction
    let systemInstructionText = `BẠN LÀ CHUYÊN GIA QA/QC XÂY DỰNG CAO CẤP TẠI VIỆT NAM.
    Nhiệm vụ của bạn là hỗ trợ kỹ sư kiểm soát chất lượng, lập hồ sơ nghiệm thu, tra cứu tiêu chuẩn (TCVN) và giải quyết các vấn đề kỹ thuật tại hiện trường.

    QUY TẮC PHẢN HỒI:
    1. NGÔN NGỮ: Luôn trả lời bằng tiếng Việt chuyên ngành xây dựng.
    2. ĐỘ CHÍNH XÁC: Ưu tiên trích dẫn các TCVN hiện hành (ví dụ: TCVN 4453:1995, TCVN 9346:2012...). Nếu không chắc chắn, hãy yêu cầu người dùng kiểm tra lại.
    3. CẤU TRÚC: Sử dụng Markdown (bảng, danh sách, in đậm) để thông tin dễ đọc.
    4. TÍNH CHUYÊN NGHIỆP: Trả lời ngắn gọn, đi thẳng vào vấn đề kỹ thuật, không lan man.
    `;

    if (isDocMode) {
      const fileNames = attachedFiles.map(f => `"${f.name}"`).join(', ');
      const confirmationInstruction = `
      QUAN TRỌNG: Người dùng đã tải lên các tệp sau: ${fileNames}.
      1. BẮT BUỘC: Xác nhận đã nhận các tệp này ở đầu câu trả lời.
      2. Đối với file PDF, hãy ghi rõ "Tổng số trang: [Số lượng]" nếu có thể xác định.
      `;

      if (isStrictInternal) {
          systemInstructionText += `\nCHẾ ĐỘ NỘI BỘ NGHIÊM NGẶT:
          ${confirmationInstruction}
          1. Trả lời câu hỏi CHỈ dựa trên nội dung/hình ảnh của tài liệu được cung cấp.
          2. Nếu câu trả lời không có trong tài liệu, hãy trả lời: "Xin lỗi, thông tin này không có trong tài liệu được cung cấp."
          3. KHÔNG sử dụng kiến thức bên ngoài hoặc tìm kiếm internet.`;
      } else {
          systemInstructionText += `\nCHẾ ĐỘ KẾT HỢP:
          ${confirmationInstruction}
          1. Sử dụng tài liệu làm nguồn sự thật CHÍNH.
          2. Có thể bổ sung kiến thức TCVN và quy trình xây dựng phổ biến để làm rõ vấn đề.`;
      }
    }

    if (isChecklistMode) {
      systemInstructionText += `\nCHỈ DẪN LẬP CHECKLIST:
      - Trình bày dưới dạng danh sách kiểm tra: "- [ ] Nội dung kiểm tra".
      - Phân chia các mục: I. Công tác chuẩn bị, II. Quá trình thi công, III. Nghiệm thu hoàn thành.
      - Mỗi mục kiểm tra phải kèm theo tiêu chuẩn đối chiếu hoặc thông số kỹ thuật cụ thể (In đậm **).`;
    }

    systemInstructionText += `\nQUY ĐỊNH VỀ BIÊN BẢN (NGHỊ ĐỊNH 30/2020/NĐ-CP & NGHỊ ĐỊNH 06/2021/NĐ-CP):
    Khi người dùng yêu cầu "Lập biên bản":
    1. TRƯỚC KHI LẬP: Bạn phải liệt kê các thông tin còn thiếu và yêu cầu người dùng bổ sung. 
       SỬ DỤNG ĐỊNH DẠNG TƯƠNG TÁC: Để người dùng điền trực tiếp, hãy sử dụng cú pháp: {{input:Tên trường thông tin}}.
       Ví dụ: "- Tên dự án: {{input:Nhập tên dự án}}"
    2. NỘI DUNG THEO NGHỊ ĐỊNH 06/2021/NĐ-CP (Phụ lục VI):
       - Tên biên bản (Ví dụ: BIÊN BẢN NGHIỆM THU CÔNG VIỆC XÂY DỰNG).
       - Đối tượng nghiệm thu (Ghi rõ tên công việc được nghiệm thu).
       - Thành phần trực tiếp nghiệm thu (Đại diện các bên).
       - Thời gian nghiệm thu (Bắt đầu, kết thúc).
       - Đánh giá công việc đã thực hiện (So sánh với thiết kế, tiêu chuẩn).
       - Kết luận (Chấp nhận hay không chấp nhận nghiệm thu).
    3. ĐỊNH DẠNG XUẤT BẢN THEO NGHỊ ĐỊNH 30/2020/NĐ-CP:
       - Quốc hiệu, Tiêu ngữ (Căn giữa).
       - Tên cơ quan chủ quản (Góc trái trên).
       - Số, ký hiệu văn bản.
       - Địa danh, ngày tháng năm (Góc phải trên).
       - Tên biên bản (In hoa, đậm, căn giữa).
       - Nội dung chi tiết.
       - Chữ ký và đóng dấu các bên (Cuối văn bản).`;
    
    systemInstructionText += `\nĐỊNH DẠNG BẢNG (MANDATORY FOR DATA):
    - Sử dụng bảng Markdown cho các thông số kỹ thuật, kết quả thí nghiệm hoặc so sánh.
    - Ví dụ: | Hạng mục | Yêu cầu kỹ thuật | TCVN đối chiếu |`;

    const model = genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      systemInstruction: systemInstructionText,
      tools: (useSearch && !isStrictInternal) ? [{ googleSearch: {} } as any] : []
    });

    // Chuẩn bị nội dung file
    const fileParts = attachedFiles.map(f => {
      if (f.isBinary) {
        let mimeType = f.type;
        const lowerName = f.name.toLowerCase();
        if (!mimeType) {
          if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
          else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
          else if (lowerName.endsWith('.png')) mimeType = 'image/png';
          else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
          else if (lowerName.endsWith('.heic')) mimeType = 'image/heic';
        }
        return {
          inlineData: {
            mimeType: mimeType || 'application/pdf',
            data: f.content
          }
        };
      } else {
        // File text được gộp vào prompt
        return null;
      }
    }).filter(p => p !== null) as any[];

    // Xử lý nội dung văn bản từ file đính kèm
    const textFiles = attachedFiles.filter(f => !f.isBinary);
    let documentsContent = "";
    if (textFiles.length > 0) {
      documentsContent = "NỘI DUNG TÀI LIỆU VĂN BẢN ĐÍNH KÈM:\n";
      textFiles.forEach((f, index) => {
          documentsContent += `\n--- Tài liệu ${index + 1}: ${f.name} ---\n${f.content}\n`;
      });
      documentsContent += "\nKẾT THÚC NỘI DUNG TÀI LIỆU.\n";
    }

    const finalPrompt = documentsContent ? `${documentsContent}\nCÂU HỎI CỦA NGƯỜI DÙNG:\n${prompt}` : prompt;

    // Chuyển đổi lịch sử
    // LƯU Ý: Lịch sử phải bắt đầu bằng role 'user'. Nếu tin nhắn đầu tiên là 'model', ta sẽ bỏ qua nó.
    let chatHistory = history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    if (chatHistory.length > 0 && chatHistory[0].role === 'model') {
      chatHistory = chatHistory.slice(1);
    }

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 0.95,
      }
    });

    const result = await chat.sendMessage([...fileParts, { text: finalPrompt }]);
    const response = await result.response;
    const text = response.text();

    // Trích xuất nguồn tham khảo từ grounding metadata
    let sources: Source[] = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata as any;
    if (groundingMetadata && groundingMetadata.groundingAttributions) {
      sources = (groundingMetadata.groundingAttributions as any[])
        .flatMap((attr: any) => {
          if (attr && attr.content && attr.content.uri && attr.content.title) {
            return [{
              title: attr.content.title,
              uri: attr.content.uri
            }];
          }
          return [];
        });
      // Remove duplicates
      sources = Array.from(new Map(sources.map(s => [s.uri, s])).values());
    }

    return { text, sources };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

// --- Components Giao diện ---

const SourceChip: React.FC<{ source: Source }> = ({ source }) => (
  <a 
    href={source.uri} 
    target="_blank" 
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full transition-colors max-w-full truncate"
  >
    <Globe className="w-3 h-3 flex-shrink-0" />
    <span className="truncate max-w-[150px]">{source.title}</span>
    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />
  </a>
);

const MessageBubble = memo(({ 
  message, 
  onRegenerate, 
  onQuickAction,
  onInputSubmit
}: { 
  message: Message; 
  onRegenerate?: () => void;
  onQuickAction?: (action: string) => void;
  onInputSubmit?: (values: Record<string, string>) => void;
}) => {
  const isUser = message.role === 'user';
  const isError = message.isError;
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    const textArea = document.createElement("textarea");
    textArea.value = message.content;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
    document.body.removeChild(textArea);
  };

  const handleDownloadPDF = () => {
    // Tạo một phần tử ẩn để chứa nội dung HTML của văn bản
    const element = document.createElement('div');
    element.style.width = '210mm'; // Khổ A4
    element.style.padding = '20mm 15mm 20mm 25mm'; // Lề chuẩn: Trên 20, Dưới 20, Phải 15, Trái 25
    element.style.backgroundColor = 'white';
    element.style.color = 'black';
    element.style.fontFamily = '"Times New Roman", Times, serif';
    element.style.lineHeight = '1.6';
    element.style.fontSize = '13pt';

    // Phân tách nội dung
    const lines = message.content.split('\n');
    let title = "BIÊN BẢN NGHIỆM THU CÔNG VIỆC XÂY DỰNG";
    
    // Tìm tiêu đề
    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('#') || (l.toUpperCase().includes('BIÊN BẢN') && l.length < 100)) {
        title = l.replace(/#+\s/g, '').toUpperCase().trim();
        break;
      }
    }

    // Xử lý nội dung (chuyển đổi markdown đơn giản sang HTML)
    const processedLines = lines.map(line => {
      let l = line.trim();
      
      // Loại bỏ các câu chào hỏi xã giao của AI
      if (l.toLowerCase().startsWith('chào bạn') || 
          l.toLowerCase().startsWith('tôi xin gửi') || 
          l.toLowerCase().startsWith('dưới đây là') ||
          l.toLowerCase().startsWith('tôi sẽ giúp')) {
        return '';
      }

      if (l.startsWith('#')) return ''; // Bỏ tiêu đề đã lấy
      
      // Xử lý bảng
      if (l.startsWith('|')) return l; 

      // Xử lý in đậm
      l = l.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      // Xử lý checklist/bullet
      if (l.startsWith('- [ ]') || l.startsWith('- [x]')) {
        const isChecked = l.startsWith('- [x]');
        return `<div style="margin-left: 20px; display: flex; gap: 10px; page-break-inside: avoid;">
                  <span>${isChecked ? '☑' : '☐'}</span>
                  <span>${l.substring(5).replace(/\*\*/g, '')}</span>
                </div>`;
      }
      
      if (l.startsWith('- ') || l.startsWith('* ')) {
        return `<div style="margin-left: 20px; display: flex; gap: 10px; page-break-inside: avoid;">
                  <span>•</span>
                  <span>${l.substring(2).replace(/\*\*/g, '')}</span>
                </div>`;
      }

      // Xử lý input fields (thay bằng dấu chấm)
      l = l.replace(/\{\{input:(.*?)\}\}/g, '................................');

      if (!l) return '<div style="height: 10px;"></div>';

      return `<p style="margin: 8px 0; text-align: justify; page-break-inside: avoid;">${l}</p>`;
    });

    // Gom nhóm các dòng bảng để xử lý riêng
    let finalHtmlContent = "";
    let inTable = false;
    let tableRows: string[] = [];

    processedLines.forEach(line => {
      if (line.startsWith('|')) {
        inTable = true;
        tableRows.push(line);
      } else {
        if (inTable && tableRows.length > 0) {
          // Kết thúc bảng, render HTML table
          const headers = tableRows[0].split('|').filter(c => c.trim() !== '');
          const dataRows = tableRows.slice(2).map(r => r.split('|').filter(c => c.trim() !== ''));
          
          let tableHtml = `<table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 12pt; page-break-inside: auto;">
            <thead><tr style="background-color: #f8f9fa; page-break-inside: avoid;">`;
          headers.forEach(h => {
            tableHtml += `<th style="border: 1px solid black; padding: 10px; text-align: center; font-weight: bold;">${h.trim().replace(/\*\*/g, '')}</th>`;
          });
          tableHtml += `</tr></thead><tbody>`;
          dataRows.forEach(row => {
            tableHtml += `<tr style="page-break-inside: avoid;">`;
            row.forEach(cell => {
              const cleanCell = cell.trim().replace(/\*\*/g, '<strong>').replace(/\*\*/g, '</strong>');
              tableHtml += `<td style="border: 1px solid black; padding: 10px; vertical-align: top;">${cleanCell}</td>`;
            });
            tableHtml += `</tr>`;
          });
          tableHtml += `</tbody></table>`;
          finalHtmlContent += tableHtml;
          inTable = false;
          tableRows = [];
        }
        finalHtmlContent += line;
      }
    });

    element.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px;">
        <div style="text-align: center; width: 45%;">
          <div style="font-size: 11pt; text-transform: uppercase;">Tên đơn vị chủ quản</div>
          <div style="font-weight: bold; font-size: 11pt; text-transform: uppercase;">Tên đơn vị lập biên bản</div>
          <div style="margin-top: 5px; border-top: 1px solid black; width: 80px; margin-left: auto; margin-right: auto;"></div>
        </div>
        <div style="text-align: center; width: 50%;">
          <div style="font-weight: bold; font-size: 12pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style="font-weight: bold; font-size: 13pt;">Độc lập - Tự do - Hạnh phúc</div>
          <div style="margin-top: 5px; border-top: 1.5px solid black; width: 140px; margin-left: auto; margin-right: auto;"></div>
          <div style="margin-top: 15px; font-style: italic; font-size: 11pt;">..., ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</div>
        </div>
      </div>

      <div style="text-align: center; font-weight: bold; font-size: 15pt; margin: 40px 0 30px 0; text-transform: uppercase; line-height: 1.3;">
        ${title}
      </div>

      <div style="margin-bottom: 50px;">
        ${finalHtmlContent}
      </div>

      <div style="display: flex; justify-content: space-between; margin-top: 60px; page-break-inside: avoid;">
        <div style="text-align: center; width: 45%;">
          <div style="font-weight: bold; text-transform: uppercase;">Đại diện nhà thầu</div>
          <div style="font-style: italic; font-size: 10pt;">(Ký, ghi rõ họ tên)</div>
          <div style="margin-top: 100px;"></div>
        </div>
        <div style="text-align: center; width: 45%;">
          <div style="font-weight: bold; text-transform: uppercase;">Đại diện giám sát</div>
          <div style="font-style: italic; font-size: 10pt;">(Ký, ghi rõ họ tên)</div>
          <div style="margin-top: 100px;"></div>
        </div>
      </div>
    `;

    const opt = {
      margin: 0,
      filename: `Bien_ban_Nghi_dinh_06_${new Date().getTime()}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4' as const, orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Thực hiện xuất PDF
    html2pdf().set(opt).from(element).save();
  };


  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([message.content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `QC_Assistant_Response_${new Date().getTime()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const quickActions = [
    { label: "Giải thích thêm", icon: <Sparkles size={12} /> },
    { label: "Trích dẫn TCVN", icon: <BookOpen size={12} /> },
    { label: "Lập biên bản", icon: <FileText size={12} /> }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex max-w-[95%] md:max-w-[85%] gap-2 md:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        {!isUser && (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-auto mb-8 shadow-sm
            ${isError ? 'bg-red-100 text-red-600' : 'bg-emerald-600 text-white'}`}>
            {isError ? <AlertCircle size={16} /> : <Bot size={16} />}
          </div>
        )}

        {/* Nội dung tin nhắn */}
        <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'} w-full min-w-0`}>
          <div className={`relative px-4 py-3 shadow-sm text-[15px] group/bubble overflow-hidden transition-all
            ${isUser 
              ? 'bg-indigo-600 text-white rounded-2xl rounded-br-sm' 
              : isError
                ? 'bg-red-50 text-red-800 border border-red-100 rounded-2xl rounded-bl-sm'
                : 'bg-white text-gray-800 border border-gray-100 rounded-2xl rounded-bl-sm'
            }`}>
            
            {isUser ? (
                <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
            ) : (
                <FormattedContent 
                  content={message.content} 
                  onInputSubmit={onInputSubmit}
                />
            )}

            {/* Toolbar cho Bot response */}
            {!isUser && !isError && (
              <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-50 opacity-0 group-hover/bubble:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Sao chép"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Tải PDF chuẩn"
                >
                  <FileText size={14} className="text-red-500" />
                </button>
                <button
                  onClick={handleDownload}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Tải về (TXT)"
                >
                  <Download size={14} />
                </button>
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Thử lại"
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
                <div className="w-px h-3 bg-gray-200 mx-1" />
                <button
                  onClick={() => setFeedback('up')}
                  className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${feedback === 'up' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400'}`}
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  onClick={() => setFeedback('down')}
                  className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${feedback === 'down' ? 'text-red-600 bg-red-50' : 'text-gray-400'}`}
                >
                  <ThumbsDown size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Quick Follow-up Actions */}
          {!isUser && !isError && onQuickAction && (
            <div className="flex flex-wrap gap-2 mt-1">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => onQuickAction(action.label)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Nguồn tham khảo */}
          {!isUser && message.sources && message.sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {message.sources.map((source, idx) => (
                <SourceChip key={`${source.uri}-${idx}`} source={source} />
              ))}
            </div>
          )}

          {/* Thời gian */}
          <span className="text-[10px] text-gray-400 px-1 mt-0.5">
            {formatDate(message.timestamp)}
          </span>
        </div>
      </div>
    </motion.div>
  );
});

const Sidebar = ({ 
  sessions, 
  currentId, 
  onSelect, 
  onDelete, 
  onNew,
  isOpen, 
  onClose
}: {
  sessions: ChatSession[];
  currentId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onNew: () => void;
  isOpen: boolean;
  onClose: () => void;
}) => (
  <>
    {/* Overlay */}
    {isOpen && (
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40"
        onClick={onClose}
      />
    )}
    
    {/* Sidebar Container */}
    <div className={`absolute inset-y-0 left-0 w-[85%] max-w-[300px] bg-gray-50 border-r border-gray-200 transform transition-transform duration-300 ease-in-out z-50 flex flex-col
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2 font-semibold text-gray-700">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span>QC Assistant</span>
        </div>
        <button onClick={onNew} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors" title="Cuộc trò chuyện mới">
          <Plus size={18} />
        </button>
      </div>

      {/* Danh sách phiên chat */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {sessions.map(session => (
          <div
            key={session.id}
            onClick={() => {
              onSelect(session.id);
              if (window.innerWidth < 768) onClose();
            }}
            className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border
              ${session.id === currentId 
                ? 'bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-50' 
                : 'bg-transparent border-transparent hover:bg-gray-100 hover:border-gray-200 text-gray-600'
              }`}
          >
            <MessageSquare size={16} className={session.id === currentId ? 'text-indigo-600' : 'text-gray-400'} />
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-medium truncate ${session.id === currentId ? 'text-gray-900' : 'text-gray-600'}`}>
                {session.title}
              </h3>
              <p className="text-[10px] text-gray-400 truncate">
                {formatDate(session.updatedAt)}
              </p>
            </div>
            <button
              onClick={(e) => onDelete(session.id, e)}
              className={`opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 hover:text-red-600 rounded transition-all
                ${session.id === currentId ? 'opacity-100' : ''}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        
        {sessions.length === 0 && (
          <div className="text-center py-10 px-4">
            <p className="text-sm text-gray-400">Chưa có lịch sử trò chuyện</p>
            <button 
              onClick={onNew}
              className="mt-3 text-xs text-indigo-600 font-medium hover:underline"
            >
              Bắt đầu ngay
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-white text-xs text-gray-400 text-center">
        Powered by Google Gemini
      </div>
    </div>
  </>
);

// --- Right Sidebar Component (Danh mục nghiệm thu) ---

const RightSidebar = ({ 
  isOpen, 
  onClose,
  onItemClick 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onItemClick: (item: string, type: 'material' | 'task') => void;
}) => {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      <div className={`absolute inset-y-0 right-0 w-[85%] max-w-[300px] border-l border-gray-200 bg-gray-50 flex flex-col h-full z-50 shadow-2xl transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between h-14 flex-shrink-0">
          <div className="flex items-center gap-2 font-semibold text-gray-700">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Danh mục nghiệm thu</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Vật liệu */}
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-bold text-gray-800 uppercase tracking-wider">
            <Package size={14} className="text-blue-500" />
            Vật liệu đầu vào
          </div>
          <div className="space-y-1">
            {CONSTRUCTION_DATA.materials.map((item, idx) => (
              <button
                key={`mat-${idx}`}
                onClick={() => onItemClick(item, 'material')}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all border border-transparent hover:border-gray-200 flex items-center justify-between group"
              >
                <span>{item}</span>
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Công tác xây dựng */}
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-bold text-gray-800 uppercase tracking-wider">
            <Briefcase size={14} className="text-emerald-500" />
            Công tác xây dựng
          </div>
          <div className="space-y-1">
            {CONSTRUCTION_DATA.tasks.map((item, idx) => (
              <button
                key={`task-${idx}`}
                onClick={() => onItemClick(item, 'task')}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all border border-transparent hover:border-gray-200 flex items-center justify-between group"
              >
                <span>{item}</span>
                <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

// --- App Component Chính ---

export default function GeminiSearchApp() {
  // State
  const [userApiKey, setUserApiKey] = useState(localStorage.getItem('user_gemini_api_key') || '');
  const [showLoginModal, setShowLoginModal] = useState(!localStorage.getItem('user_gemini_api_key'));
  const activeApiKey = userApiKey || getEnvApiKey();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(true);
  
  // Sidebars
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // File & Mode States
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isChecklistMode, setIsChecklistMode] = useState(false);
  const [useInternalOnly, setUseInternalOnly] = useState(false);
  
  // Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Responsive default for right sidebar
  useEffect(() => {
    // Luôn đóng sidebar phải mặc định để giống app mobile
    setIsRightSidebarOpen(false);
  }, []);

  // Derived State
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  // Khởi tạo
  useEffect(() => {
    const saved = localStorage.getItem('gemini_chat_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
        if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
      } catch (e) {
        createNewSession();
      }
    } else {
      createNewSession();
    }
  }, []);

  // Lưu vào LocalStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('gemini_chat_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = (reader.result as string).split(',')[1];
          
          let ext = 'webm';
          if (mediaRecorder.mimeType.includes('mp4')) ext = 'mp4';
          else if (mediaRecorder.mimeType.includes('ogg')) ext = 'ogg';

          setAttachedFiles(prev => [...prev, {
            id: generateId(),
            name: `Audio_Record_${formatTime(recordingTime).replace(':','_')}.${ext}`,
            content: base64data,
            type: mediaRecorder.mimeType || 'audio/webm',
            isBinary: true,
            size: audioBlob.size / (1024 * 1024)
          }]);
          setUseInternalOnly(true);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Không thể truy cập micro. Vui lòng cấp quyền trong trình duyệt.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // Cuộn xuống cuối
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: generateId(),
      title: 'Hội thoại mới',
      messages: [],
      updatedAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setIsSidebarOpen(false);
    setAttachedFiles([]);
    setIsChecklistMode(false);
    setUseInternalOnly(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    if (currentSessionId === id) {
      setCurrentSessionId(newSessions[0]?.id || null);
    }
    if (newSessions.length === 0) {
      const fresh = {
        id: generateId(),
        title: 'Hội thoại mới',
        messages: [],
        updatedAt: Date.now()
      };
      setSessions([fresh]);
      setCurrentSessionId(fresh.id);
    }
  };

  const updateSessionMessages = (sessionId: string, newMessages: Message[], newTitle?: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        return {
          ...session,
          messages: newMessages,
          title: newTitle || session.title,
          updatedAt: Date.now()
        };
      }
      return session;
    }));
  };

  // Xử lý tải file lên (Đã sửa lỗi)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Tính toán số lượng file còn lại có thể tải
    const remainingSlots = MAX_FILES - attachedFiles.length;
    if (remainingSlots <= 0) {
        alert(`Bạn đã đạt giới hạn tối đa ${MAX_FILES} tài liệu.`);
        // Reset input để người dùng có thể chọn lại file khác
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    const filesToProcess = Array.from(files as FileList).slice(0, remainingSlots) as File[];
    
    if (files.length > remainingSlots) {
        alert(`Chỉ có thể thêm ${remainingSlots} file nữa. Các file thừa sẽ bị bỏ qua.`);
    }

    filesToProcess.forEach(file => {
        // Kiểm tra dung lượng
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
            alert(`File "${file.name}" quá lớn (${fileSizeMB.toFixed(1)}MB). Vui lòng tải file dưới ${MAX_FILE_SIZE_MB}MB.`);
            return;
        }

        // Kiểm tra loại file chi tiết hơn
        const fileName = file.name.toLowerCase();
        
        // Danh sách đuôi file text/code hỗ trợ
        const textExtensions = [
            '.md', '.json', '.js', '.jsx', '.ts', '.tsx', 
            '.csv', '.txt', '.html', '.css', '.xml', '.sql', 
            '.yaml', '.yml', '.py', '.java', '.c', '.cpp', 
            '.h', '.hpp', '.log', '.ini', '.env'
        ];

        const isText = file.type.startsWith('text/') || textExtensions.some(ext => fileName.endsWith(ext));
        const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
        const isImage = file.type.startsWith('image/') || 
                        fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || 
                        fileName.endsWith('.png') || fileName.endsWith('.webp') || 
                        fileName.endsWith('.heic');

        const reader = new FileReader();
        
        // Xử lý lỗi đọc file
        reader.onerror = () => {
            alert(`Không thể đọc file "${file.name}". Vui lòng thử lại.`);
        };

        if (isText) {
          reader.onload = (event) => {
            const content = event.target?.result;
            if (typeof content === 'string') {
                setAttachedFiles(prev => [...prev, {
                  id: generateId(),
                  name: file.name,
                  content: content,
                  type: file.type || 'text/plain',
                  isBinary: false,
                  size: fileSizeMB
                }]);
                setUseInternalOnly(true);
            }
          };
          reader.readAsText(file);
        } 
        else if (isImage || isPdf) {
          reader.onload = (event) => {
            const result = event.target?.result;
            if (typeof result === 'string') {
                // Tách header data:image/xyz;base64, ra khỏi nội dung
                const base64Data = result.includes(',') ? result.split(',')[1] : result;
                
                // Xác định type nếu file.type bị rỗng
                let determinedType = file.type;
                if (!determinedType) {
                    if (fileName.endsWith('.pdf')) determinedType = 'application/pdf';
                    else if (fileName.endsWith('.png')) determinedType = 'image/png';
                    else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) determinedType = 'image/jpeg';
                    else determinedType = 'application/octet-stream';
                }

                setAttachedFiles(prev => [...prev, {
                  id: generateId(),
                  name: file.name,
                  content: base64Data,
                  type: determinedType, 
                  isBinary: true,
                  dataUrl: result, // Dùng để preview
                  size: fileSizeMB
                }]);
                setUseInternalOnly(true);
            }
          };
          reader.readAsDataURL(file);
        } else {
          alert(`Định dạng file "${file.name}" không được hỗ trợ.\nHệ thống hỗ trợ: PDF, Ảnh, Text, và các file Code/Config (.js, .json, .sql, v.v.).`);
        }
    });
    
    // Reset input value để cho phép chọn lại cùng 1 file nếu cần
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setAttachedFiles(prev => {
        const newState = prev.filter(f => f.id !== id);
        if (newState.length === 0) setUseInternalOnly(false);
        return newState;
    });
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || !currentSessionId || isLoading) return;

    let contextNote = "";
    if (attachedFiles.length > 0 && !textOverride) {
        const count = attachedFiles.length;
        contextNote = `\n[Đính kèm ${count} file: ${attachedFiles.map(f => f.name).join(', ')}]`;
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: textToSend.trim() + contextNote,
      timestamp: Date.now()
    };

    const updatedMessages = [...messages, userMessage];
    
    const shouldUpdateTitle = messages.length === 0;
    const newTitle = shouldUpdateTitle ? textToSend.trim().slice(0, 30) + (textToSend.length > 30 ? '...' : '') : undefined;

    updateSessionMessages(currentSessionId, updatedMessages, newTitle);
    
    setInput('');
    setIsLoading(true);

    try {
      const historyContext = updatedMessages.slice(-6); 
      const isQuickAction = !!textOverride;
      
      const response = await callGemini(
        userMessage.content, 
        historyContext, 
        useSearch, 
        attachedFiles,
        isChecklistMode || isQuickAction,
        useInternalOnly,
        activeApiKey
      );

      const botMessage: Message = {
        id: generateId(),
        role: 'model',
        content: response.text,
        timestamp: Date.now(),
        sources: response.sources
      };

      updateSessionMessages(currentSessionId, [...updatedMessages, botMessage]);
    } catch (error: any) {
      if (error.message?.includes("API Key") || error.message?.includes("API_KEY")) {
        setShowLoginModal(true);
      }
      const errorMessage: Message = {
        id: generateId(),
        role: 'model',
        content: `Đã xảy ra lỗi: ${error.message || "Vui lòng kiểm tra kết nối."}`,
        timestamp: Date.now(),
        isError: true
      };
      updateSessionMessages(currentSessionId, [...updatedMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Callback chọn nhanh từ Sidebar phải
  const handleQuickSelect = (item: string, type: 'material' | 'task') => {
      const prompt = `Lập danh mục hồ sơ nghiệm thu, tiêu chuẩn kỹ thuật áp dụng (TCVN) và quy trình kiểm tra chi tiết cho: "${item}". Trình bày kết quả dưới dạng checklist chuyên nghiệp.`;
      setIsChecklistMode(true);
      handleSend(prompt);
      if (window.innerWidth < 1024) {
          setIsRightSidebarOpen(false);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 flex justify-center bg-gray-100 font-sans overflow-hidden">
      {/* Mobile App Frame */}
      <div className="w-full sm:max-w-[420px] h-full bg-white flex flex-col relative shadow-2xl sm:border-x sm:border-gray-300 overflow-hidden">
        
        {/* Sidebar Trái */}
        <Sidebar 
          sessions={sessions}
          currentId={currentSessionId || ''}
          onSelect={setCurrentSessionId}
          onDelete={deleteSession}
          onNew={createNewSession}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Vùng nội dung chính */}
        <div className="flex-1 flex flex-col h-full relative min-w-0">
          
          {/* Navbar */}
          <header className="h-14 border-b border-gray-100 flex items-center justify-between px-3 bg-white/90 backdrop-blur-md z-10 flex-shrink-0 sticky top-0">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-1 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                title="Danh sách phiên hỏi đáp"
              >
                <Menu size={22} />
              </button>
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-sm">
                    <Bot size={20} />
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></span>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-[15px] font-bold text-gray-800 leading-tight">
                    {currentSession?.title || 'Trợ lý QC Xây Dựng'}
                  </h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-emerald-600 font-medium">
                      {isLoading ? 'Đang gõ...' : 'Trực tuyến'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowLoginModal(true)}
                className="p-2 rounded-full transition-colors hover:bg-gray-100 text-gray-600 relative group"
                title="Đăng nhập / Đổi API Key"
              >
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-indigo-500 border-2 border-white 
                  transition-all group-hover:scale-125" style={{ display: userApiKey ? 'block' : 'none' }}></div>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </button>
              <button 
                onClick={() => setIsRightSidebarOpen(true)}
                className="p-2 rounded-full transition-colors hover:bg-gray-100 text-gray-600"
                title="Danh mục nghiệm thu"
              >
                <PanelRightOpen size={22} />
              </button>
            </div>
          </header>

          {/* Khu vực Chat */}
          <div className="flex-1 overflow-y-auto p-3 bg-[#f4f4f5] scroll-smooth">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto opacity-80 px-2">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100 relative">
                  <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-20"></div>
                  <Bot className="w-10 h-10 text-indigo-600 relative z-10" />
                </div>
                <h2 className="text-lg font-bold text-gray-800 mb-2">Xin chào! Tôi là Bot QA/QC</h2>
                <p className="text-sm text-gray-500 leading-relaxed mb-8">
                  Tôi có thể giúp bạn lập checklist nghiệm thu, tra cứu TCVN, hoặc phân tích tài liệu bản vẽ.
                </p>
                
                <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
                  <button 
                    onClick={() => {
                        setInput("Lập checklist nghiệm thu công tác đổ bê tông móng");
                        handleSend("Lập checklist nghiệm thu công tác đổ bê tông móng");
                    }}
                    className="p-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-700 hover:border-indigo-300 hover:shadow-sm hover:text-indigo-600 transition-all text-left flex items-center gap-3"
                  >
                    <span className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 text-indigo-600">📝</span>
                    Checklist đổ bê tông móng
                  </button>
                  <button 
                    onClick={() => {
                      setInput("Các tiêu chuẩn TCVN áp dụng cho công tác xây tường gạch");
                      handleSend("Các tiêu chuẩn TCVN áp dụng cho công tác xây tường gạch");
                    }}
                    className="p-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-700 hover:border-indigo-300 hover:shadow-sm hover:text-indigo-600 transition-all text-left flex items-center gap-3"
                  >
                    <span className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 text-emerald-600">📚</span>
                    TCVN xây tường gạch
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                <AnimatePresence initial={false}>
                  {messages.map((msg, idx) => (
                    <MessageBubble 
                      key={msg.id} 
                      message={msg} 
                      onRegenerate={idx === messages.length - 1 && msg.role === 'model' ? () => {
                        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                        if (lastUserMsg) handleSend(lastUserMsg.content);
                      } : undefined}
                      onQuickAction={(action) => {
                        handleSend(`${action} cho nội dung trên`);
                      }}
                      onInputSubmit={(values) => {
                        const formattedValues = Object.entries(values)
                          .map(([key, val]) => `- ${key}: ${val}`)
                          .join('\n');
                        handleSend(`Tôi xin bổ sung các thông tin sau để lập biên bản:\n${formattedValues}`);
                      }}
                    />
                  ))}
                </AnimatePresence>
                {isLoading && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start mb-6"
                  >
                    <div className="flex flex-row gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center mt-auto mb-1">
                          <Loader2 size={16} className="text-white animate-spin" />
                      </div>
                      <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-sm border border-gray-100 shadow-sm text-[15px] text-gray-500 flex items-center gap-2">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            )}
          </div>

          {/* Khu vực Nhập liệu */}
          <div className="p-2 bg-white border-t border-gray-100 z-10 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="max-w-3xl mx-auto w-full">
            
            {/* Thanh công cụ file & chế độ */}
            <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar pb-1">
                {/* Nút Upload */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                    ${attachedFiles.length > 0 
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    <Paperclip size={14} />
                    {attachedFiles.length > 0 ? `${attachedFiles.length} File` : 'Đính kèm'}
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                    multiple 
                    // Mở rộng danh sách accept để hiển thị nhiều loại file hơn trong cửa sổ chọn file
                    accept=".pdf,image/*,.txt,.md,.json,.csv,.js,.jsx,.ts,.tsx,.html,.css,.xml,.sql,.yaml,.yml,.log,.ini,.env,text/*"
                />

                {/* Toggle Search */}
                <button
                    onClick={() => setUseSearch(!useSearch)}
                    disabled={useInternalOnly}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                    ${useSearch && !useInternalOnly
                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                        : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600'
                    } ${useInternalOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={useInternalOnly ? "Tắt khi dùng chế độ nội bộ" : "Tìm kiếm Google"}
                >
                    <Search size={14} />
                    Google Search
                </button>

                {/* Toggle Checklist Mode */}
                <button
                    onClick={() => setIsChecklistMode(!isChecklistMode)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                    ${isChecklistMode 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                    <ListChecks size={14} />
                    Chế độ Checklist
                </button>
                
                {/* File Only Mode (Khi có file) */}
                {attachedFiles.length > 0 && (
                    <button
                        onClick={() => setUseInternalOnly(!useInternalOnly)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                        ${useInternalOnly
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600'}`}
                        title="Chỉ trả lời dựa trên tài liệu tải lên"
                    >
                        {useInternalOnly ? <Lock size={14} /> : <Unlock size={14} />}
                        {useInternalOnly ? 'Chỉ dùng tài liệu' : 'Kiến thức mở'}
                    </button>
                )}
            </div>

            {/* Danh sách File Preview */}
            {attachedFiles.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-3 mb-2 no-scrollbar px-1">
                    {attachedFiles.map((file) => {
                        const isImage = file.type.startsWith('image/');
                        const isPdf = file.type === 'application/pdf';
                        const isAudio = file.type.startsWith('audio/');

                        return (
                            <div key={file.id} className="relative group flex-shrink-0 w-20 h-20 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col items-center justify-center">
                                {isImage && file.dataUrl ? (
                                    <img 
                                        src={file.dataUrl} 
                                        alt={file.name} 
                                        className="w-full h-full object-cover" 
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-2 w-full h-full bg-gray-50">
                                        {isAudio ? (
                                            <AudioLines className="text-indigo-500 mb-1" size={24} />
                                        ) : isPdf ? (
                                            <FileType className="text-red-500 mb-1" size={24} />
                                        ) : (
                                            <FileCode className="text-indigo-400 mb-1" size={24} />
                                        )}
                                        <span className="text-[9px] text-gray-500 font-medium truncate w-full text-center px-1">
                                            {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                                        </span>
                                    </div>
                                )}
                                
                                {/* Overlay info on hover */}
                                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-1 opacity-0 group-hover:opacity-100 transition-opacity text-white pointer-events-none">
                                    <span className="text-[8px] font-bold truncate w-full text-center px-1">{file.name}</span>
                                    <span className="text-[8px] opacity-80">{(file.size || 0).toFixed(1)} MB</span>
                                </div>
                                
                                <button 
                                    onClick={() => removeFile(file.id)}
                                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-lg transform scale-0 group-hover:scale-100 transition-transform z-20 hover:bg-red-600"
                                    title="Xóa file"
                                >
                                    <X size={10} strokeWidth={3} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Input Box */}
            <div className="relative flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all p-1.5">
              {isRecording ? (
                <div className="flex items-center justify-between w-full bg-red-50 rounded-xl px-3 py-2 h-[44px]">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-red-600 font-medium text-sm">{formatTime(recordingTime)}</span>
                    <span className="text-red-400 text-xs hidden sm:inline">Đang thu âm...</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={cancelRecording} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Hủy">
                      <Trash2 size={18} />
                    </button>
                    <button onClick={stopRecording} className="p-2 bg-red-500 text-white hover:bg-red-600 rounded-lg transition-colors shadow-sm" title="Hoàn tất">
                      <Square size={16} className="fill-current" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isChecklistMode ? "Nhập hạng mục cần lập checklist..." : "Nhập câu hỏi hoặc yêu cầu..."}
                    className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-2.5 px-3 text-base text-gray-800 placeholder-gray-400"
                    rows={1}
                    style={{ height: 'auto', minHeight: '44px' }}
                    onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = `${Math.min(target.scrollHeight, 150)}px`;
                    }}
                  />
                  <div className="flex items-center gap-1 mb-0.5">
                    {(!input.trim() && attachedFiles.length === 0) ? (
                      <button
                        onClick={startRecording}
                        className="p-2.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                        title="Thu âm"
                      >
                        <Mic size={20} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSend()}
                        disabled={isLoading}
                        className={`p-2.5 rounded-xl flex-shrink-0 transition-all
                          ${!isLoading
                            ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:shadow-lg transform hover:-translate-y-0.5' 
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                      >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            
            <div className="text-center mt-2">
                <p className="text-[10px] text-gray-400">
                    AI có thể mắc lỗi. Vui lòng kiểm chứng lại thông tin quan trọng (TCVN, Thông số).
                </p>
            </div>
          </div>
        </div>

      </div>

      {/* Sidebar Phải */}
      <RightSidebar 
          isOpen={isRightSidebarOpen}
          onClose={() => setIsRightSidebarOpen(false)}
          onItemClick={handleQuickSelect}
      />

      {/* Thay vì div lg:hidden từ right sidebar ở đây, RightSidebar component đã tự xử lý overlay nếu dùng AnimatePresence bên trong, tuy nhiên ta cần modal đăng nhập */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                  Đăng nhập API Key
                </h3>
                {userApiKey && (
                  <button 
                    onClick={() => setShowLoginModal(false)}
                    className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  Trợ lý QA/QC Xây dựng có thể sử dụng sức mạnh của Google Gemini. Nhập Google Gemini API Key cá nhân của bạn để mở khóa toàn bộ tính năng và giới hạn sử dụng.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5 ml-1">
                      Gemini API Key
                    </label>
                    <input 
                      type="password"
                      placeholder="AIzaSy..."
                      defaultValue={userApiKey}
                      id="api-key-input"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all font-mono text-sm"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => {
                        const val = (document.getElementById('api-key-input') as HTMLInputElement).value.trim();
                        setUserApiKey(val);
                        if (val) {
                          localStorage.setItem('user_gemini_api_key', val);
                          setShowLoginModal(false);
                        } else {
                          localStorage.removeItem('user_gemini_api_key');
                          alert('Vui lòng nhập API Key để tiếp tục.');
                        }
                      }}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all active:scale-95 shadow-sm"
                    >
                      Xác nhận lưu
                    </button>
                    {userApiKey && (
                      <button 
                        onClick={() => {
                          setUserApiKey('');
                          localStorage.removeItem('user_gemini_api_key');
                          // Dòng này đã cố ý không ẩn modal để buộc người dùng nhập lại key mới có thể dùng app
                        }}
                        className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-semibold transition-all active:scale-95 flex items-center justify-center"
                        title="Đăng xuất / Xóa Key"
                      >
                        Đăng xuất
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
}