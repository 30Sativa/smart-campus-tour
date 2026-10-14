import { AiChatPanel } from './StudentAiAssistant'
import { useLiveStudentAiChat } from '../ai/use-live-student-ai-chat'
import { MAX_QUESTION_LENGTH } from '../ai/student-ai-api'

/** Questions the approved content pack can answer (ai-assistant/content/campus). */
const SUGGESTIONS = ['Robot dùng cảm biến gì?', 'Chuyến tham quan kéo dài bao lâu?', 'Câu hỏi của mình có riêng tư không?']

/**
 * Private Q&A for an invited Student session while the Tour is RUNNING (docs/architecture.md §7.1).
 * Voice input stays off until server-side STT exists: browser speech recognition may send audio to a
 * third party, which the privacy rules do not allow by default.
 */
export function LiveStudentAiAssistant({ tourId, shared = false }: { tourId: string; shared?: boolean }) {
  const { messages, isTyping, askAi, retry } = useLiveStudentAiChat(tourId)
  return (
    <AiChatPanel
      messages={messages}
      isTyping={isTyping}
      askAi={askAi}
      retry={retry}
      contextLabel="Thông tin chung của chuyến tham quan"
      suggestions={SUGGESTIONS}
      shared={shared}
      maxLength={MAX_QUESTION_LENGTH}
    />
  )
}
