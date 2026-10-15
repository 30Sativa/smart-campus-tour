import { expect, it, vi } from 'vitest'
import { DEMO_ANSWER_PREFIX, mockAskAiResponse } from './student-mock'

it('labels every simulated answer and does not mistake "chính sách" for a library question', async () => {
  vi.useFakeTimers()
  try {
    const ask = async (q: string) => {
      const answer = mockAskAiResponse(q, 'Thư viện Thông minh')
      await vi.advanceTimersByTimeAsync(1000)
      return answer
    }
    const scholarship = await ask('Chính sách học bổng?')
    expect(scholarship.startsWith(DEMO_ANSWER_PREFIX)).toBe(true)
    expect(scholarship).toMatch(/học bổng/)
    expect(scholarship).not.toMatch(/Thư viện/)
    expect(await ask('Thư viện có mấy tầng?')).toMatch(/Thư viện Thông minh/)
    expect(await ask('Robot dùng cảm biến gì?')).toMatch(/LiDAR/)
    expect((await ask('Căng tin ở đâu?')).startsWith(DEMO_ANSWER_PREFIX)).toBe(true)
  } finally {
    vi.useRealTimers()
  }
})
