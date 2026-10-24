/**
 * Student private Q&A endpoint (docs/architecture.md §7.1).
 * Authenticated only by the per-Tour HttpOnly Student cookie: never an account JWT.
 */
import { apiClient, ApiError } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'

export type StudentAiTurn = { question: string; answer: string }

export type StudentAiAnswer = {
  questionId: string
  answer: string
  outOfScope: boolean
  /** The POI snapshot taken when the question was accepted; null means general campus context. */
  poi: { id: string; name: string } | null
  answeredAt: string
}

export type AskStudentQuestionBody = {
  questionId: string
  text: string
  recentTurns: StudentAiTurn[]
}

/** Limits from the contract; the backend enforces them too. */
export const MAX_QUESTION_LENGTH = 500
export const MAX_RECENT_TURNS = 3
export const MAX_TURN_ANSWER_LENGTH = 1200

export async function askStudentQuestion(tourId: string, body: AskStudentQuestionBody, signal?: AbortSignal) {
  const response = await apiClient<ApiResponse<StudentAiAnswer>>(
    `/api/student/tours/${encodeURIComponent(tourId)}/questions`,
    { method: 'POST', credentials: 'include', auth: false, json: body, signal },
  )
  if (!response?.data) throw new Error('Empty assistant response')
  return response.data
}

function errorCode(error: ApiError): string | undefined {
  try {
    const parsed = JSON.parse(error.body) as { errors?: { code?: unknown } }
    return typeof parsed.errors?.code === 'string' ? parsed.errors.code : undefined
  } catch {
    return undefined
  }
}

/** What the student reads when a question fails, and whether trying again can help. */
export function describeAskError(error: unknown): { text: string; retryable: boolean } {
  if (error instanceof ApiError) {
    const code = errorCode(error)
    if (error.status === 400) return { text: `Câu hỏi chưa hợp lệ. Câu hỏi cần có nội dung và tối đa ${MAX_QUESTION_LENGTH} ký tự.`, retryable: false }
    if (error.status === 401) return { text: 'Phiên của bạn đã hết hạn hoặc mã truy cập đã bị thu hồi. Tải lại trang để nhập lại mã truy cập.', retryable: false }
    if (error.status === 403) return { text: 'Nguồn truy cập không được phép. Liên hệ đại diện đoàn để được hỗ trợ.', retryable: false }
    if (error.status === 409 && code === 'TOUR_NOT_RUNNING') return { text: 'Trợ lý AI chỉ dùng được khi buổi tham quan đang diễn ra.', retryable: false }
    if (error.status === 409 && code === 'QUESTION_ID_REUSED') return { text: 'Câu hỏi này bị trùng mã với câu khác. Hãy gửi lại thành câu hỏi mới.', retryable: false }
    if (error.status === 429) return { text: 'Bạn hỏi hơi nhanh. Đợi một chút rồi hỏi tiếp nhé.', retryable: true }
    if (error.status === 503) return { text: 'Trợ lý AI đang bận hoặc tạm thời không dùng được. Bạn thử lại sau ít phút nhé.', retryable: true }
    if (error.status === 504) return { text: 'Trợ lý AI trả lời quá lâu. Bạn thử lại nhé.', retryable: true }
  }
  return { text: 'Không kết nối được tới Trợ lý AI. Kiểm tra mạng rồi thử lại nhé.', retryable: true }
}
