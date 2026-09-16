import { useState, useRef, useEffect } from 'react';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router';

type Message = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
};

type AIState = 'ready' | 'listening' | 'processing' | 'speaking';

export default function AIGuide() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'ai', text: 'Đây là bản mô phỏng, chưa kết nối dịch vụ AI. Xin chào! Tôi là trợ lý AI CampusTour. Bạn có muốn biết thêm thông tin về địa điểm hiện tại hoặc lộ trình tiếp theo không?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [aiState, setAiState] = useState<AIState>('ready');
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextMessageId = useRef(2);

  const createMessage = (sender: Message['sender'], text: string): Message => ({
    id: String(nextMessageId.current++),
    sender,
    text,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, aiState]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const newMsg = createMessage('user', inputText);
    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    
    simulateAIResponse();
  };

  const handleVoicePush = () => {
    if (aiState === 'ready' || aiState === 'speaking') {
      setAiState('listening');
      // In real implementation, start STT here
      setTimeout(() => {
        setAiState('processing');
        const simulatedVoiceText = 'Thư viện mở cửa đến mấy giờ?';
        setMessages(prev => [...prev, createMessage('user', simulatedVoiceText)]);
        simulateAIResponse();
      }, 3000);
    }
  };

  const simulateAIResponse = () => {
    setAiState('processing');
    setTimeout(() => {
      setAiState('speaking');
      setMessages(prev => [...prev, createMessage(
        'ai',
        'Thư viện FPT mở cửa từ 8:00 sáng đến 21:00 tối các ngày trong tuần. Bạn có muốn ghé qua đó không?',
      )]);
      // Simulate speaking duration
      setTimeout(() => setAiState('ready'), 4000);
    }, 2000);
  };

  return (
    <VisitorLayout>
      <div className="flex flex-col h-[calc(100dvh-152px-env(safe-area-inset-bottom))] md:h-[calc(100dvh-72px)] bg-[var(--bg-primary)]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-[var(--border-color)] bg-[var(--bg-primary)]/80 backdrop-blur-xl shrink-0">
           <div className="flex items-center gap-3">
             <Link to="/my-bookings" className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center hover:bg-[var(--bg-secondary)] transition-colors">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                 <path d="M15 18l-6-6 6-6" />
               </svg>
             </Link>
             <div>
               <h1 className="text-base font-bold">CampusTour AI</h1>
               <div className="text-[10px] text-emerald-400 font-bold tracking-wider flex items-center gap-1.5">
                 <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                 BẢN MÔ PHỎNG
               </div>
             </div>
           </div>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-[20px] text-sm leading-relaxed ${msg.sender === 'user' ? 'bg-[var(--accent)]/20 text-[var(--text-primary)] rounded-br-none border border-[var(--accent)]/30' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] rounded-bl-none border border-[var(--border-color)]'}`}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
            
            {aiState === 'processing' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex justify-start"
              >
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] p-4 rounded-[20px] rounded-bl-none flex gap-2 items-center">
                  <motion.div className="w-1.5 h-1.5 bg-white/40 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                  <motion.div className="w-1.5 h-1.5 bg-white/40 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
                  <motion.div className="w-1.5 h-1.5 bg-white/40 rounded-full" animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="shrink-0 p-4 pb-safe bg-[var(--bg-primary)] border-t border-[var(--border-color)]">
          {/* Status Label */}
          <div className="text-center mb-4">
             <AnimatePresence mode="wait">
               <motion.span 
                 key={aiState}
                 initial={{ opacity: 0, y: 5 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -5 }}
                 className="text-xs font-bold tracking-widest uppercase text-[var(--text-secondary)]"
               >
                 {aiState === 'ready' && 'Nhấn giữ để nói'}
                 {aiState === 'listening' && <span className="text-[var(--accent)]">Đang nghe...</span>}
                 {aiState === 'processing' && 'Đang tìm câu trả lời...'}
                 {aiState === 'speaking' && <span className="text-[var(--accent)]">Đang phát câu trả lời</span>}
               </motion.span>
             </AnimatePresence>
          </div>

          <div className="flex items-center gap-3 max-w-[800px] mx-auto relative">
            <form onSubmit={handleSendText} className="flex-1">
              <input 
                type="text" 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Nhập câu hỏi..."
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-full px-5 py-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                disabled={aiState === 'listening' || aiState === 'processing'}
              />
            </form>
            
            <button 
              className={`relative shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all ${inputText.trim() ? 'bg-[var(--accent)] text-black' : 'bg-transparent border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'}`}
              onClick={inputText.trim() ? handleSendText : undefined}
              onPointerDown={!inputText.trim() ? handleVoicePush : undefined}
            >
              {inputText.trim() ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
              ) : (
                <>
                  {aiState === 'listening' && (
                    <motion.div 
                      className="absolute inset-0 rounded-full bg-[var(--accent)]/30 border border-[var(--accent)]"
                      animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                  <svg className={`w-5 h-5 ${aiState === 'listening' ? 'text-[var(--accent)]' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </VisitorLayout>
  );
}

