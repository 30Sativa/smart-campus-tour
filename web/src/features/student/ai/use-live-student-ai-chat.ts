import { useCallback, useRef, useState } from 'react'
import type { AiChatMessage } from '../student-types'
import {
  askStudentQuestion,
  describeAskError,
  MAX_QUESTION_LENGTH,
  MAX_RECENT_TURNS,
  MAX_TURN_ANSWER_LENGTH,
  type StudentAiTurn,
} from './student-ai-api'

const WELCOME: AiChatMessage = {
  id: 'welcome',
  sender: 'ai',
  text: 'Chào bạn! Mình là trợ lý AI của chuyến tham quan. Bạn có thể hỏi mình về chuyến tham quan, robot dẫn đường hoặc cách mình xử lý câu hỏi của bạn nhé.',
  timestamp: 'Vừa xong',
}

function newQuestionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // RFC 4122 v4 fallback for browsers without randomUUID.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The last answered question/answer pairs of this browser tab, oldest first. */
export function recentTurns(messages: AiChatMessage[]): StudentAiTurn[] {
  const turns: StudentAiTurn[] = []
  for (let i = 0; i < messages.length - 1; i++) {
    const question = messages[i]
    const answer = messages[i + 1]
    if (question.sender === 'student' && question.status === 'sent' && answer.sender === 'ai' && answer.id !== 'welcome')
      turns.push({ question: question.text, answer: answer.text.slice(0, MAX_TURN_ANSWER_LENGTH) })
  }
  return turns.slice(-MAX_RECENT_TURNS)
}

/**
 * Private Q&A against the backend. History lives only in this component's memory:
 * nothing is stored in the browser or on the server (ADR-0011).
 */
export function useLiveStudentAiChat(tourId: string) {
  const [messages, setMessages] = useState<AiChatMessage[]>([WELCOME])
  const [isTyping, setIsTyping] = useState(false)
  const inFlight = useRef(false)
  // Source of truth read by event handlers; state mirrors it for rendering.
  const history = useRef<AiChatMessage[]>([WELCOME])
  const update = useCallback((change: (prev: AiChatMessage[]) => AiChatMessage[]) => {
    history.current = change(history.current)
    setMessages(history.current)
  }, [])

  const send = useCallback(async (questionId: string, text: string, studentMessageId: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setIsTyping(true)
    const messageIndex = history.current.findIndex(m => m.id === studentMessageId)
    const turns = recentTurns(history.current.slice(0, messageIndex))
    update(prev => prev.map(m => m.id === studentMessageId
      ? { ...m, status: 'sending', errorText: undefined, retryable: undefined } : m))
    try {
      const result = await askStudentQuestion(tourId, { questionId, text, recentTurns: turns })
      update(prev => {
        const answer: AiChatMessage = {
          id: `ai_${questionId}`,
          sender: 'ai',
          text: result.answer,
          timestamp: 'Vừa xong',
          poiName: result.poi?.name,
        }
        return prev.flatMap(message => message.id === studentMessageId
          ? [{ ...message, status: 'sent' as const }, answer]
          : [message])
      })
    } catch (error) {
      const { text: errorText, retryable } = describeAskError(error)
      update(prev => prev.map(m => m.id === studentMessageId ? { ...m, status: 'error', errorText, retryable } : m))
    } finally {
      inFlight.current = false
      setIsTyping(false)
    }
  }, [tourId, update])

  const askAi = useCallback(async (raw: string) => {
    const text = raw.trim().slice(0, MAX_QUESTION_LENGTH)
    if (!text || inFlight.current) return
    const questionId = newQuestionId()
    const id = `st_${questionId}`
    update(prev => [...prev, { id, sender: 'student', text, timestamp: 'Vừa xong', status: 'sending', questionId }])
    await send(questionId, text, id)
  }, [send, update])

  /** Re-sends a failed question with the same questionId, so the backend never answers it twice. */
  const retry = useCallback(async (messageId: string) => {
    const message = history.current.find(m => m.id === messageId)
    if (!message?.questionId || message.status !== 'error') return
    await send(message.questionId, message.text, message.id)
  }, [send])

  return { messages, isTyping, askAi, retry }
}
