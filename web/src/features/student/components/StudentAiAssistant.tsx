import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bot,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { useStudentAiChat } from '../student-hooks'

interface StudentAiAssistantProps {
  poiContext?: string
}

export function StudentAiAssistant({ poiContext }: StudentAiAssistantProps) {
  const { messages, isTyping, askAi } = useStudentAiChat(poiContext)
  const [inputText, setInputText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSend = () => {
    if (!inputText.trim() || isTyping) return
    const text = inputText
    setInputText('')
    void askAi(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  // Xử lý Voice Input (Web Speech Recognition với fallback)
  const toggleSpeechRecognition = () => {
    setSpeechError(null)

    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string
        interimResults: boolean
        maxAlternatives: number
        start: () => void
        onstart: () => void
        onresult: (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void
        onerror: () => void
        onend: () => void
      }
      webkitSpeechRecognition?: new () => {
        lang: string
        interimResults: boolean
        maxAlternatives: number
        start: () => void
        onstart: () => void
        onresult: (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void
        onerror: () => void
        onend: () => void
      }
    }
    const SpeechRecognition = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition

    if (!SpeechRecognition) {
      // Fallback mô phỏng nếu trình duyệt không hỗ trợ Web Speech API
      setIsListening(true)
      setTimeout(() => {
        setIsListening(false)
        setInputText('Thư viện có bao nhiêu đầu sách và máy tính?')
      }, 2000)
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'vi-VN'
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setInputText(transcript)
        setIsListening(false)
      }

      recognition.onerror = () => {
        setIsListening(false)
        setSpeechError('Không nhận diện được giọng nói. Bạn có thể gõ văn bản nhé!')
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.start()
    } catch {
      setIsListening(false)
      setSpeechError('Không thể khởi động micro. Vui lòng gõ tin nhắn.')
    }
  }

  const suggestions = [
    'Thư viện có mấy tầng?',
    'Chính sách học bổng?',
    'Robot AMR hoạt động thế nào?',
  ]

  return (
    <div className="st-ai">
      <div className="st-ai__head">
        <span className="st-narr__ic" aria-hidden="true"><Bot size={18} /></span>
        <div>
          <div className="st-ai__title">
            <span>Trợ lý AI Campus</span>
            <span className="st-ai__private"><Sparkles size={10} />Riêng tư 1-1</span>
          </div>
          <p className="st-ai__ctx">Đang gắn ngữ cảnh: {poiContext || 'Khuôn viên'}</p>
        </div>
      </div>

      <div className="st-ai__msgs" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.sender === 'student' ? 'st-msg st-msg--me' : 'st-msg st-msg--ai'}>
            <div className="st-bubble">
              {msg.sender === 'ai' && (
                <div className="st-bubble__meta">
                  <span>Trợ lý AI</span>
                  {msg.isAudioPlaying && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Volume2 size={12} />
                      Đang đọc câu trả lời
                    </span>
                  )}
                </div>
              )}
              <p>{msg.text}</p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="st-msg st-msg--ai">
            <div className="st-bubble">
              <span className="st-typing"><i /><i /><i /><span>AI đang tra cứu...</span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {speechError && (
        <div className="st-ai__err">
          <AlertCircle size={13} />
          <span>{speechError}</span>
        </div>
      )}

      <div className="st-ai__sugg">
        <span>Gợi ý:</span>
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => void askAi(s)} disabled={isTyping}>
            {s}
          </button>
        ))}
      </div>

      <div className="st-ai__input">
        <button
          type="button"
          onClick={toggleSpeechRecognition}
          className={isListening ? 'st-round st-round--rec' : 'st-round'}
          title={isListening ? 'Đang nghe...' : 'Nói câu hỏi qua Micro'}
          aria-label={isListening ? 'Đang nghe...' : 'Nói câu hỏi qua Micro'}
        >
          {isListening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? 'Đang lắng nghe giọng nói...' : 'Đặt câu hỏi cho Trợ lý AI...'}
          disabled={isTyping || isListening}
          aria-label="Câu hỏi cho Trợ lý AI"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!inputText.trim() || isTyping}
          className="st-round st-round--send"
          title="Gửi câu hỏi"
          aria-label="Gửi câu hỏi"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
