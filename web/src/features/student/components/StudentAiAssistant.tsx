import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Bot,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Users,
  Volume2,
} from 'lucide-react'
import { useStudentAiChat } from '../student-hooks'
import type { AiChatMessage } from '../student-types'

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  onstart: () => void
  onresult: (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void
  onerror: () => void
  onend: () => void
}

export interface AiChatPanelProps {
  messages: AiChatMessage[]
  isTyping: boolean
  askAi: (text: string) => Promise<void> | void
  retry?: (messageId: string) => Promise<void> | void
  contextLabel: string
  suggestions: string[]
  /** Browser speech recognition (demo only until server-side STT, plan step 22). */
  allowVoice?: boolean
  /** "Điểm xem chung": answers appear on the room's shared screen. */
  shared?: boolean
  maxLength?: number
}

/** Presentational chat panel shared by the demo Tour page and the invited live Tour page. */
export function AiChatPanel({
  messages,
  isTyping,
  askAi,
  retry,
  contextLabel,
  suggestions,
  allowVoice = false,
  shared = false,
  maxLength = 500,
}: AiChatPanelProps) {
  const [inputText, setInputText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
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

  const toggleSpeechRecognition = () => {
    setSpeechError(null)
    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SpeechRecognition = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechError('Trình duyệt này chưa hỗ trợ nhận giọng nói. Bạn gõ câu hỏi nhé!')
      return
    }
    try {
      const recognition = new SpeechRecognition()
      recognition.lang = 'vi-VN'
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      recognition.onstart = () => setIsListening(true)
      recognition.onresult = (event) => {
        setInputText(event.results[0][0].transcript)
        setIsListening(false)
      }
      recognition.onerror = () => {
        setIsListening(false)
        setSpeechError('Không nhận diện được giọng nói. Bạn có thể gõ văn bản nhé!')
      }
      recognition.onend = () => setIsListening(false)
      recognition.start()
    } catch {
      setIsListening(false)
      setSpeechError('Không thể khởi động micro. Vui lòng gõ tin nhắn.')
    }
  }

  return (
    <div className="st-ai">
      <div className="st-ai__head">
        <span className="st-narr__ic" aria-hidden="true"><Bot size={18} /></span>
        <div>
          <div className="st-ai__title">
            <span>Trợ lý AI Campus</span>
            {shared
              ? <span className="st-ai__private"><Users size={10} />Màn hình chung</span>
              : <span className="st-ai__private"><Sparkles size={10} />Riêng tư 1-1</span>}
          </div>
          <p className="st-ai__ctx">Đang gắn ngữ cảnh: {contextLabel}</p>
          {shared && <p className="st-ai__ctx">Câu trả lời hiện trên màn hình chung nên cả phòng cùng thấy.</p>}
        </div>
      </div>

      <div className="st-ai__msgs" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.sender === 'student' ? 'st-msg st-msg--me' : 'st-msg st-msg--ai'}>
            <div className="st-bubble">
              {msg.sender === 'ai' && (
                <div className="st-bubble__meta">
                  <span>Trợ lý AI</span>
                  {msg.poiName && <span>Trả lời về: {msg.poiName}</span>}
                  {msg.isAudioPlaying && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Volume2 size={12} />
                      Đang đọc câu trả lời
                    </span>
                  )}
                </div>
              )}
              <p>{msg.text}</p>
              {msg.sender === 'student' && msg.status === 'error' && (
                <div className="st-ai__err" role="alert">
                  <AlertCircle size={13} />
                  <span>{msg.errorText ?? 'Chưa gửi được câu hỏi.'}</span>
                  {msg.retryable && retry && (
                    <button type="button" onClick={() => void retry(msg.id)} disabled={isTyping}>
                      <RotateCcw size={12} /> Thử lại
                    </button>
                  )}
                </div>
              )}
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

      {suggestions.length > 0 && (
        <div className="st-ai__sugg">
          <span>Gợi ý:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => void askAi(s)} disabled={isTyping}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="st-ai__input">
        {allowVoice && (
          <button
            type="button"
            onClick={toggleSpeechRecognition}
            className={isListening ? 'st-round st-round--rec' : 'st-round'}
            title={isListening ? 'Đang nghe...' : 'Nói câu hỏi qua Micro'}
            aria-label={isListening ? 'Đang nghe...' : 'Nói câu hỏi qua Micro'}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}

        <input
          type="text"
          value={inputText}
          maxLength={maxLength}
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

interface StudentAiAssistantProps {
  poiContext?: string
}

/** Labelled demo Tour (fixture data, simulated answers). The invited live page uses LiveStudentAiAssistant. */
export function StudentAiAssistant({ poiContext }: StudentAiAssistantProps) {
  const { messages, isTyping, askAi } = useStudentAiChat(poiContext)
  return (
    <AiChatPanel
      messages={messages}
      isTyping={isTyping}
      askAi={askAi}
      contextLabel={poiContext || 'Khuôn viên'}
      suggestions={['Thư viện có mấy tầng?', 'Chính sách học bổng?', 'Robot AMR hoạt động thế nào?']}
      allowVoice
    />
  )
}
