import { AiChatPanel } from './StudentAiAssistant'
import { useLiveStudentAiChat } from '../ai/use-live-student-ai-chat'
import { MAX_QUESTION_LENGTH } from '../ai/student-ai-api'

/** Questions the approved content pack can answer (ai-assistant/content/campus). */
const SUGGESTIONS = ['Robot dùng cảm biến gì?', 'Chuyến tham quan kéo dài bao lâu?', 'Câu hỏi của mình có riêng tư không?']
/** While waiting there is no stop yet: questions about the school, from the same content pack. */
const WAITING_SUGGESTIONS = ['Trường có những ngành nào?', 'OJT là gì?', 'Robot dẫn đường hoạt động thế nào?']

export type LiveStudentAiChat = ReturnType<typeof useLiveStudentAiChat>

type Props = {
  tourId: string
  shared?: boolean
  /** The stop the robot is at, for the context label only: the backend snapshots the POI itself (§7.1). */
  poiName?: string
  /** The page's own conversation, so what was asked in the waiting room is still there once the Tour runs. */
  chat?: LiveStudentAiChat
  /** In the waiting room: school questions are suggested and the label says there is no stop yet. */
  waiting?: boolean
}

/**
 * Private Q&A for an invited Student session while the Tour is RUNNING, and in the waiting room from 15 minutes
 * before the start (docs/architecture.md §7.1). Voice input stays off until server-side STT exists: browser speech
 * recognition may send audio to a third party, which the privacy rules do not allow by default.
 */
export function LiveStudentAiAssistant(props: Props) {
  return props.chat ? <ChatView {...props} chat={props.chat} /> : <OwnChat {...props} />
}

function OwnChat(props: Props) {
  const chat = useLiveStudentAiChat(props.tourId)
  return <ChatView {...props} chat={chat} />
}

function ChatView({ shared = false, poiName, chat, waiting = false }: Props & { chat: LiveStudentAiChat }) {
  const { messages, isTyping, askAi, retry } = chat
  return (
    <AiChatPanel
      messages={messages}
      isTyping={isTyping}
      askAi={askAi}
      retry={retry}
      contextLabel={waiting ? 'Thông tin về trường và chuyến tham quan' : poiName ? `Điểm ${poiName} và thông tin chung` : 'Thông tin chung của chuyến tham quan'}
      suggestions={waiting ? WAITING_SUGGESTIONS : SUGGESTIONS}
      shared={shared}
      maxLength={MAX_QUESTION_LENGTH}
    />
  )
}
