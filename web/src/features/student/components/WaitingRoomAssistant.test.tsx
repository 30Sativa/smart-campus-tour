import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useLiveStudentAiChat } from '../ai/use-live-student-ai-chat'
import { describeAskError } from '../ai/student-ai-api'
import { ApiError } from '../../../api/client'
import { WaitingRoomAssistant } from './WaitingRoomAssistant'
import { waitingRoomAiOpensAt } from '../ai/waiting-room-window'

const tourId = '11111111-1111-1111-1111-111111111111'
const NOW = Date.parse('2026-11-25T05:00:00Z')

function Harness({ start }: { start: string }) {
  const chat = useLiveStudentAiChat(tourId)
  return <WaitingRoomAssistant tourId={tourId} scheduledStartAt={start} shared={false} chat={chat} />
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('opens 15 minutes before the start', () => {
  expect(waitingRoomAiOpensAt('2026-11-25T05:15:00Z')).toBe(NOW)
  expect(waitingRoomAiOpensAt('not a date')).toBeNull()
})

it('says when it opens, then opens by itself at that minute', () => {
  render(<Harness start="2026-11-25T05:20:00Z" />)
  expect(screen.getByText(/Trợ lý AI mở lúc .*15 phút trước giờ bắt đầu/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Câu hỏi cho Trợ lý AI')).toBeNull()
  // The timer wakes at least once a minute (a sleeping laptop must still catch up), so step minute by minute.
  for (let minute = 0; minute < 6; minute++) act(() => { vi.advanceTimersByTime(60_000) })
  expect(screen.getByLabelText('Câu hỏi cho Trợ lý AI')).toBeInTheDocument()
  expect(screen.getByText('Trường có những ngành nào?')).toBeInTheDocument()
})

it('asks the server from the waiting room once open', async () => {
  vi.useRealTimers()
  const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { questionId: 'q', answer: 'Trường có nhiều ngành.', outOfScope: false, poi: null, answeredAt: '2026-11-25T05:00:00Z' } }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  render(<Harness start={new Date(Date.now() + 10 * 60_000).toISOString()} />)
  fireEvent.change(screen.getByLabelText('Câu hỏi cho Trợ lý AI'), { target: { value: 'Trường có những ngành nào?' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
  expect(await screen.findByText('Trường có nhiều ngành.')).toBeInTheDocument()
  expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`/api/student/tours/${tourId}/questions$`))
})

it('explains a question sent too early', () => {
  const error = new ApiError(409, JSON.stringify({ errors: { code: 'AI_OPENS_LATER' } }))
  expect(describeAskError(error)).toEqual({ text: 'Trợ lý AI mở từ 15 phút trước giờ bắt đầu buổi tham quan.', retryable: false })
})
