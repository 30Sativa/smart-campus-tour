import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const whep = vi.hoisted(() => ({ status: 'live' as 'live' | 'connecting' | 'offline' | 'error' }))
vi.mock('../../quest-stream/use-whep-stream', () => ({ useWhepStream: () => ({ status: whep.status, retry: () => undefined }) }))

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
