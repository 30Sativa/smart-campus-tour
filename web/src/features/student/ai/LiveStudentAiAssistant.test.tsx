import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LiveStudentAiAssistant } from '../components/LiveStudentAiAssistant'
import { StudentInvitationPage } from '../invitation/StudentInvitationPage'
import { recentTurns } from './use-live-student-ai-chat'
import { describeAskError } from './student-ai-api'
import { ApiError } from '../../../api/client'
import { useAuthStore } from '../../../stores/auth-store'
import type { AiChatMessage } from '../student-types'

const tourId = '11111111-1111-1111-1111-111111111111'

type Sent = { url: string; options: RequestInit; body: { questionId: string; text: string; recentTurns: { question: string; answer: string }[] } }

function answer(text: string, questionId = 'q', poi: { id: string; name: string } | null = null) {
  return new Response(JSON.stringify({ success: true, data: { questionId, answer: text, outOfScope: false, poi, answeredAt: '2026-10-13T08:00:00Z' } }), { status: 200 })
}
function failure(status: number, code?: string) {
  return new Response(JSON.stringify({ success: false, message: 'x', data: null, errors: code ? { code } : null }), { status })
}
function stubFetch(...responses: Response[]) {
  const sent: Sent[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    sent.push({ url, options, body: JSON.parse(String(options.body)) })
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  }))
  return sent
}
function ask(text: string) {
  fireEvent.change(screen.getByLabelText('Câu hỏi cho Trợ lý AI'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
}

beforeEach(() => {
  useAuthStore.getState().setAuth('account-token', { userId: 'rep', username: 'rep', role: 'Representative' })
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

it('asks with the Student cookie only, then sends earlier turns with follow-up questions', async () => {
  const sent = stubFetch(answer('Robot là AMR.'), answer('Robot dùng LiDAR.', 'q2', { id: 'p1', name: 'AI Lab' }))
  render(<LiveStudentAiAssistant tourId={tourId} />)

  ask('  Robot này là loại gì?  ')
  expect(await screen.findByText('Robot là AMR.')).toBeVisible()
  expect(sent[0].url).toMatch(new RegExp(`/api/student/tours/${tourId}/questions$`))
  expect(sent[0].options.method).toBe('POST')
  expect(sent[0].options.credentials).toBe('include')
  expect((sent[0].options.headers as Record<string, string>).Authorization).toBeUndefined()
  expect(sent[0].body.text).toBe('Robot này là loại gì?')
  expect(sent[0].body.recentTurns).toEqual([])
  expect(sent[0].body.questionId).toMatch(/^[0-9a-f-]{36}$/)

  ask('Nó dùng cảm biến gì?')
  expect(await screen.findByText('Robot dùng LiDAR.')).toBeVisible()
  expect(screen.getByText('Trả lời về: AI Lab')).toBeVisible()
  expect(sent[1].body.recentTurns).toEqual([{ question: 'Robot này là loại gì?', answer: 'Robot là AMR.' }])
  expect(sent[1].body.questionId).not.toBe(sent[0].body.questionId)
})

it('offers a retry with the same question id after a temporary failure', async () => {
  const sent = stubFetch(failure(503, 'AI_UNAVAILABLE'), answer('Đã trả lời.'))
  render(<LiveStudentAiAssistant tourId={tourId} />)

  ask('Chuyến tham quan kéo dài bao lâu?')
  expect(await screen.findByText(/Trợ lý AI đang bận/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
  expect(await screen.findByText('Đã trả lời.')).toBeVisible()
  expect(sent).toHaveLength(2)
  expect(sent[1].body.questionId).toBe(sent[0].body.questionId)
  expect(sent[1].body.text).toBe(sent[0].body.text)
  await waitFor(() => expect(screen.queryByRole('button', { name: /Thử lại/ })).not.toBeInTheDocument())
})

it('retries an earlier failed question in place with only its earlier context', async () => {
  const sent = stubFetch(failure(503, 'AI_UNAVAILABLE'), answer('Câu hai đã trả lời.'),
    answer('Câu một đã trả lời.'), answer('Câu ba đã trả lời.'))
  const view = render(<LiveStudentAiAssistant tourId={tourId} />)

  ask('Câu một?')
  expect(await screen.findByText(/Trợ lý AI đang bận/)).toBeVisible()
  ask('Câu hai?')
  expect(await screen.findByText('Câu hai đã trả lời.')).toBeVisible()

  fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
  expect(await screen.findByText('Câu một đã trả lời.')).toBeVisible()
  expect(sent[2].body.questionId).toBe(sent[0].body.questionId)
  expect(sent[2].body.recentTurns).toEqual([])
  expect(Array.from(view.container.querySelectorAll('.st-msg')).map(node => node.textContent)).toEqual([
    expect.stringContaining('Chào bạn!'),
    'Câu một?',
    expect.stringContaining('Câu một đã trả lời.'),
    'Câu hai?',
    expect.stringContaining('Câu hai đã trả lời.'),
  ])

  ask('Câu ba?')
  expect(await screen.findByText('Câu ba đã trả lời.')).toBeVisible()
  expect(sent[3].body.recentTurns).toEqual([
    { question: 'Câu một?', answer: 'Câu một đã trả lời.' },
    { question: 'Câu hai?', answer: 'Câu hai đã trả lời.' },
  ])
})

it('does not offer a retry when the session, Tour or question id no longer allows it', async () => {
  stubFetch(failure(401), failure(409, 'TOUR_NOT_RUNNING'), failure(409, 'QUESTION_ID_REUSED'))
  render(<LiveStudentAiAssistant tourId={tourId} />)

  ask('Câu một?')
  expect(await screen.findByText(/Phiên của bạn đã hết hạn/)).toBeVisible()
  ask('Câu hai?')
  expect(await screen.findByText(/chỉ dùng được khi buổi tham quan đang diễn ra/)).toBeVisible()
  ask('Câu ba?')
  expect(await screen.findByText(/trùng mã với câu khác/)).toBeVisible()
  expect(screen.queryByRole('button', { name: /Thử lại/ })).not.toBeInTheDocument()
})

it('labels the shared-screen session and hides voice input on the live page', () => {
  render(<LiveStudentAiAssistant tourId={tourId} shared />)
  expect(screen.getByText('Màn hình chung')).toBeVisible()
  expect(screen.getByText(/cả phòng cùng thấy/)).toBeVisible()
  expect(screen.queryByRole('button', { name: /Micro/ })).not.toBeInTheDocument()
})

it('shows the assistant on the invited page only while the Tour is RUNNING', async () => {
  const info = { tourId, tourName: 'Tour được mời', scheduledStartAt: '2026-10-20T02:00:00Z',
    invitationExpiresAt: '2026-10-21T02:00:00Z', rowType: 'INDIVIDUAL', fallbackVideoUrl: null }
  for (const [tourState, visible] of [['SCHEDULED', false], ['RUNNING', true]] as const) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { ...info, tourState } }), { status: 200 })))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={client}><StudentInvitationPage tourId={tourId} /></QueryClientProvider>)
    await screen.findByText('Tour được mời')
    expect(screen.queryByLabelText('Câu hỏi cho Trợ lý AI') !== null).toBe(visible)
    view.unmount()
    client.clear()
  }
})

it('keeps only the last three answered turns and skips failed questions', () => {
  const m = (id: string, sender: 'student' | 'ai', text: string, status?: AiChatMessage['status']): AiChatMessage =>
    ({ id, sender, text, timestamp: '', status })
  const messages: AiChatMessage[] = [
    m('welcome', 'ai', 'Chào'),
    m('s1', 'student', 'Q1', 'sent'), m('a1', 'ai', 'A1'),
    m('s2', 'student', 'Q2', 'error'),
    m('s3', 'student', 'Q3', 'sent'), m('a3', 'ai', 'A3'),
    m('s4', 'student', 'Q4', 'sent'), m('a4', 'ai', 'A4'),
    m('s5', 'student', 'Q5', 'sent'), m('a5', 'ai', 'A5'),
  ]
  expect(recentTurns(messages)).toEqual([
    { question: 'Q3', answer: 'A3' }, { question: 'Q4', answer: 'A4' }, { question: 'Q5', answer: 'A5' },
  ])
})

it('maps backend errors to student-facing messages', () => {
  expect(describeAskError(new ApiError(429, '{"errors":{"code":"RATE_LIMITED"}}')).retryable).toBe(true)
  expect(describeAskError(new ApiError(504, '')).text).toMatch(/quá lâu/)
  expect(describeAskError(new ApiError(400, '')).retryable).toBe(false)
  expect(describeAskError(new ApiError(409, '{"errors":{"code":"QUESTION_ID_REUSED"}}')).retryable).toBe(false)
  expect(describeAskError(new TypeError('Failed to fetch')).text).toMatch(/Kiểm tra mạng/)
})
