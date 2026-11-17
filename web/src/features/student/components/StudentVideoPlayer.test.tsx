import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

type Status = 'idle' | 'live' | 'connecting' | 'offline' | 'error'
const whep = vi.hoisted(() => ({
  status: 'live' as Status,
  fallback: 'live' as Status,
  calls: [] as { url: string | null; token?: string | null; audio?: boolean }[],
}))
vi.mock('../../quest-stream/use-whep-stream', () => ({
  useWhepStream: (_video: unknown, url: string | null, _enabled?: boolean, token?: string | null, audio?: boolean) => {
    whep.calls.push({ url, token, audio })
    // The relay fallback path answers with its own status; idle while the player does not ask for it.
    const status = audio ? (url ? whep.fallback : 'idle') : url ? whep.status : 'idle'
    return { status, retry: () => undefined }
  },
}))

import { StudentVideoPlayer } from './StudentVideoPlayer'

const QUEST = { whepUrl: 'http://nuc.test:8889/quest/whep', token: 't' }

describe('StudentVideoPlayer fallback', () => {
  it('shows the live stream while it is live', () => {
    whep.status = 'live'
    render(<StudentVideoPlayer streamUrl="/videos/home.mp4" quest={QUEST} />)
    expect(screen.getByText('Trực tiếp')).toBeInTheDocument()
    expect(screen.queryByLabelText('Video dự phòng')).toBeNull()
  })

  it('switches to the labelled fallback video when the live stream is lost', () => {
    whep.status = 'offline'
    render(<StudentVideoPlayer streamUrl="/videos/home.mp4" quest={QUEST} />)
    expect(screen.getByLabelText('Video dự phòng')).toHaveAttribute('src', '/videos/home.mp4')
    expect(screen.getByText('Video dự phòng · chế độ suy giảm')).toBeInTheDocument()
    expect(screen.queryByText(/Tạm mất hình ảnh trực tiếp/)).toBeNull()
  })

  it('mutes the live audio while the fallback plays', () => {
    whep.status = 'offline'
    const { container } = render(<StudentVideoPlayer streamUrl="/videos/home.mp4" quest={QUEST} />)
    const [live] = Array.from(container.querySelectorAll('video'))
    expect(live.muted).toBe(true)
  })

  it('keeps the reconnecting message when there is no fallback video', () => {
    whep.status = 'offline'
    render(<StudentVideoPlayer quest={QUEST} />)
    expect(screen.queryByLabelText('Video dự phòng')).toBeNull()
    expect(screen.getByText(/Tạm mất hình ảnh trực tiếp/)).toBeInTheDocument()
  })
})

// ADR-0063: the Tour's fallback video comes from the relay with its own token, never from a stored URL.
describe('StudentVideoPlayer relay fallback', () => {
  const FALLBACK = { whepUrl: 'https://relay.test:8889/fallback-0123456789abcdef0123456789abcdef/whep', token: 'f' }
  const lastFallbackCall = () => whep.calls.filter(call => call.audio).at(-1)

  it('does not open the fallback while the live picture plays', () => {
    whep.status = 'live'
    whep.calls = []
    render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.queryByLabelText('Video dự phòng')).toBeNull()
    expect(lastFallbackCall()?.url).toBeNull()
  })

  it('plays the relay fallback with sound, labelled, when the live picture is lost', () => {
    whep.status = 'offline'
    whep.fallback = 'live'
    whep.calls = []
    render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    const video = screen.getByLabelText('Video dự phòng')
    expect(video).not.toHaveAttribute('src')
    expect(screen.getByText('Video dự phòng · chế độ suy giảm')).toBeInTheDocument()
    expect(lastFallbackCall()).toEqual({ url: FALLBACK.whepUrl, token: 'f', audio: true })
    expect(screen.queryByText(/Tạm mất hình ảnh trực tiếp/)).toBeNull()
  })

  it('stays on the fallback while the live stream reconnects, and returns to live once it plays', () => {
    whep.status = 'offline'
    whep.fallback = 'live'
    const { rerender } = render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    whep.status = 'connecting'
    rerender(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.getByLabelText('Video dự phòng')).toBeInTheDocument()

    whep.status = 'live'
    whep.calls = []
    rerender(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.queryByLabelText('Video dự phòng')).toBeNull()
    expect(lastFallbackCall()?.url).toBeNull()
    expect(screen.getByText('Trực tiếp')).toBeInTheDocument()
  })

  it('plays the fallback when the Tour has no live stream at all', () => {
    whep.fallback = 'live'
    render(<StudentVideoPlayer quest={null} fallback={FALLBACK} />)
    expect(screen.getByLabelText('Video dự phòng')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có hình')).toBeNull()
  })

  it('says so while the fallback is opening or cannot be opened', () => {
    whep.status = 'offline'
    whep.fallback = 'connecting'
    const { rerender } = render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.getByText('Mất hình trực tiếp. Đang mở video dự phòng…')).toBeInTheDocument()
    whep.fallback = 'offline'
    rerender(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    expect(screen.getByText(/chưa mở được video dự phòng/)).toBeInTheDocument()
  })

  it('closes the fallback when its token is refused (End Early, revoked session)', () => {
    whep.status = 'offline'
    whep.fallback = 'live'
    const { rerender } = render(<StudentVideoPlayer quest={QUEST} fallback={FALLBACK} />)
    rerender(<StudentVideoPlayer quest={QUEST} fallback={null} />)
    expect(screen.queryByLabelText('Video dự phòng')).toBeNull()
  })
})
