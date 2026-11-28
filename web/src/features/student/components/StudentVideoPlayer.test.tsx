import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Status = 'idle' | 'live' | 'connecting' | 'offline' | 'error'
const whep = vi.hoisted(() => ({
  status: 'live' as Status,
  fallback: 'live' as Status,
  calls: [] as { url: string | null; enabled?: boolean; token?: string | null; audio?: boolean }[],
}))
vi.mock('../../quest-stream/use-whep-stream', () => ({
  useWhepStream: (_video: unknown, url: string | null, enabled?: boolean, token?: string | null, audio?: boolean) => {
    whep.calls.push({ url, enabled, token, audio })
    // The relay fallback path answers with its own status; idle while the player does not ask for it.
    const status = !url ? 'idle' : url.includes('/fallback-') ? whep.fallback : whep.status
    return { status, retry: () => undefined }
  },
}))

import { StudentVideoPlayer, FALLBACK_NOTICE_MS, LIVE_RESTORED_NOTICE_MS } from './StudentVideoPlayer'
import { useStudentStore } from '../student-store'

const QUEST = { whepUrl: 'http://nuc.test:8889/quest/whep', token: 't' }
const BADGE = 'Bản ghi hành trình – không phải trực tiếp'
const NOTICE = 'Hình trực tiếp tạm gián đoạn. Đang chuyển sang bản ghi hành trình…'

describe('StudentVideoPlayer without a switch', () => {
  it('shows the live stream while it is live', () => {
    whep.status = 'live'
    render(<StudentVideoPlayer streamUrl="/videos/home.mp4" quest={QUEST} />)
    expect(screen.getByText('Trực tiếp')).toBeInTheDocument()
    expect(screen.queryByLabelText('Bản ghi hành trình')).toBeNull()
  })

  // ADR-0075: no automatic switching; a lost picture only reconnects.
  it('keeps the reconnecting message when the live stream is lost, even with a sample video', () => {
    whep.status = 'offline'
    render(<StudentVideoPlayer streamUrl="/videos/home.mp4" quest={QUEST} />)
    expect(screen.queryByLabelText('Bản ghi hành trình')).toBeNull()
    expect(screen.queryByText(BADGE)).toBeNull()
    expect(screen.getByText(/Tạm mất hình ảnh trực tiếp/)).toBeInTheDocument()
  })
})

// ADR-0075: the page holds the fallback token only while the Operator switched the Tour to it.
describe('StudentVideoPlayer switched fallback', () => {
  const FALLBACK = { whepUrl: 'https://relay.test:8889/fallback-0123456789abcdef0123456789abcdef/whep', token: 'f' }
  const lastFallbackCall = () => whep.calls.at(-1)
  const lastLiveCall = () => whep.calls.at(-2)

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the notice first, then the muted recording with its label, and rests the live stream', () => {
    whep.status = 'offline'
    whep.fallback = 'live'
    whep.calls = []
    const { container } = render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.getByText(NOTICE)).toBeInTheDocument()
    expect(screen.queryByLabelText('Bản ghi hành trình')).toBeNull()
    expect(lastFallbackCall()?.url).toBeNull()
    expect(screen.queryByText(/Tạm mất hình ảnh trực tiếp/)).toBeNull()

    act(() => vi.advanceTimersByTime(FALLBACK_NOTICE_MS))
    const video = screen.getByLabelText('Bản ghi hành trình') as HTMLVideoElement
    expect(video.muted).toBe(true)
    expect(screen.getByText(BADGE)).toBeInTheDocument()
    expect(screen.queryByText(NOTICE)).toBeNull()
    expect(lastFallbackCall()).toEqual({ url: FALLBACK.whepUrl, enabled: true, token: 'f', audio: undefined })
    expect(lastLiveCall()?.enabled).toBe(false)
    expect(container.querySelectorAll('video')).toHaveLength(2)
  })

  it('stays on the recording even when the live picture comes back, until the switch is undone', () => {
    whep.status = 'offline'
    whep.fallback = 'live'
    const { rerender } = render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    act(() => vi.advanceTimersByTime(FALLBACK_NOTICE_MS))
    whep.status = 'live'
    rerender(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.getByLabelText('Bản ghi hành trình')).toBeInTheDocument()

    whep.calls = []
    rerender(<StudentVideoPlayer quest={QUEST} fallback={null} />)
    expect(screen.queryByLabelText('Bản ghi hành trình')).toBeNull()
    expect(lastFallbackCall()?.url).toBeNull()
    expect(lastLiveCall()?.enabled).toBe(true)
    expect(screen.getByText('Đã trở lại hình trực tiếp')).toBeInTheDocument()
    expect(screen.getByText('Trực tiếp')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(LIVE_RESTORED_NOTICE_MS))
    expect(screen.queryByText('Đã trở lại hình trực tiếp')).toBeNull()
  })

  it('plays the recording when the Tour has no live stream at all', () => {
    whep.fallback = 'live'
    render(<StudentVideoPlayer quest={null} fallback={FALLBACK} />)
    act(() => vi.advanceTimersByTime(FALLBACK_NOTICE_MS))
    expect(screen.getByLabelText('Bản ghi hành trình')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có hình')).toBeNull()
  })

  it('says so while the recording is opening or cannot be opened', () => {
    whep.status = 'offline'
    whep.fallback = 'connecting'
    const { rerender } = render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    act(() => vi.advanceTimersByTime(FALLBACK_NOTICE_MS))
    expect(screen.getByText('Đang mở bản ghi hành trình…')).toBeInTheDocument()
    whep.fallback = 'offline'
    rerender(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.getByText(/Chưa mở được bản ghi hành trình/)).toBeInTheDocument()
  })

  it('drops the switch during the notice without ever opening the recording', () => {
    whep.status = 'live'
    whep.calls = []
    const { rerender } = render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    rerender(<StudentVideoPlayer quest={QUEST} fallback={null} />)
    act(() => vi.advanceTimersByTime(FALLBACK_NOTICE_MS))
    expect(screen.queryByLabelText('Bản ghi hành trình')).toBeNull()
    expect(whep.calls.some(call => call.url === FALLBACK.whepUrl)).toBe(false)
  })
})

describe('StudentVideoPlayer subtitles', () => {
  it('shows the narration line over the video and the CC button turns it off and on', () => {
    whep.status = 'live'
    useStudentStore.getState().setCaptionsOn(true)
    render(<StudentVideoPlayer quest={QUEST} caption="Đây là thư viện." overlay={<p>Hướng dẫn viên đang nói</p>} />)
    expect(screen.getByText('Đây là thư viện.')).toBeInTheDocument()
    expect(screen.getByText('Hướng dẫn viên đang nói')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tắt phụ đề' }))
    expect(screen.queryByText('Đây là thư viện.')).toBeNull()
    expect(useStudentStore.getState().captionsOn).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Bật phụ đề' }))
    expect(screen.getByText('Đây là thư viện.')).toBeInTheDocument()
  })
})
