import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestLiveVideo } from './QuestLiveVideo'
import { retryDelayMs } from './use-hls-stream'

type Handler = (event: string, data: { fatal: boolean; type: string }) => void

// A stand-in for hls.js: records what the hook does and lets the test fire events.
const fakeHls = vi.hoisted(() => {
  const instances: Array<{
    handlers: Record<string, Handler>
    source?: string
    destroyed: boolean
    fire: (event: string, data?: { fatal: boolean; type: string }) => void
  }> = []

  class FakeHls {
    static Events = { MANIFEST_PARSED: 'manifestParsed', ERROR: 'error' }
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' }
    static isSupported = () => true
    handlers: Record<string, Handler> = {}
    source?: string
    destroyed = false
    constructor() {
      instances.push(this)
    }
    on(event: string, handler: Handler) {
      this.handlers[event] = handler
    }
    attachMedia() {}
    loadSource(url: string) {
      this.source = url
    }
    destroy() {
      this.destroyed = true
    }
    fire(event: string, data = { fatal: false, type: '' }) {
      this.handlers[event]?.(event, data)
    }
  }
  return { FakeHls, instances }
})

vi.mock('hls.js', () => ({ default: fakeHls.FakeHls }))

const STREAM_URL = 'http://nuc.local:8080/hls/quest.m3u8'

beforeEach(() => {
  fakeHls.instances.length = 0
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.load = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('QuestLiveVideo', () => {
  it('says the stream is not configured when there is no STREAM_URL', () => {
    render(<QuestLiveVideo src={null} />)
    expect(screen.getByText('Chưa cấu hình nguồn hình Quest')).toBeInTheDocument()
    expect(fakeHls.instances).toHaveLength(0)
  })

  it('connects, then shows the live picture once frames play', async () => {
    const { container } = render(<QuestLiveVideo src={STREAM_URL} label="AMR-01" />)
    expect(screen.getByText('Đang kết nối nguồn hình…')).toBeInTheDocument()

    await waitFor(() => expect(fakeHls.instances).toHaveLength(1))
    expect(fakeHls.instances[0].source).toBe(STREAM_URL)

    act(() => fakeHls.instances[0].fire('manifestParsed'))
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled()

    const video = container.querySelector('video')!
    expect(video.muted).toBe(true)
    expect(video.autoplay).toBe(true)
    expect(video.hasAttribute('playsinline')).toBe(true)
    act(() => {
      video.dispatchEvent(new Event('playing'))
    })
    expect(screen.getByText('Trực tiếp')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('AMR-01')).toBeInTheDocument()
  })

  it('reports offline on a network failure and reconnects by itself', async () => {
    render(<QuestLiveVideo src={STREAM_URL} />)
    await waitFor(() => expect(fakeHls.instances).toHaveLength(1))

    vi.useFakeTimers()
    act(() => fakeHls.instances[0].fire('error', { fatal: true, type: 'networkError' }))
    expect(screen.getByText('Không có tín hiệu từ kính Quest')).toBeInTheDocument()
    expect(fakeHls.instances[0].destroyed).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(retryDelayMs(0))
    })
    expect(fakeHls.instances).toHaveLength(2)
  })

  it('ignores non-fatal errors', async () => {
    render(<QuestLiveVideo src={STREAM_URL} />)
    await waitFor(() => expect(fakeHls.instances).toHaveLength(1))
    act(() => fakeHls.instances[0].fire('error', { fatal: false, type: 'networkError' }))
    expect(screen.getByText('Đang kết nối nguồn hình…')).toBeInTheDocument()
    expect(fakeHls.instances[0].destroyed).toBe(false)
  })

  it('reconnects immediately when the user presses retry', async () => {
    render(<QuestLiveVideo src={STREAM_URL} />)
    await waitFor(() => expect(fakeHls.instances).toHaveLength(1))
    act(() => fakeHls.instances[0].fire('error', { fatal: true, type: 'networkError' }))

    fireEvent.click(screen.getByRole('button', { name: /Thử lại ngay/ }))
    await waitFor(() => expect(fakeHls.instances).toHaveLength(2))
    expect(screen.getByText('Đang kết nối nguồn hình…')).toBeInTheDocument()
  })

  it('destroys the player on unmount', async () => {
    const { unmount } = render(<QuestLiveVideo src={STREAM_URL} />)
    await waitFor(() => expect(fakeHls.instances).toHaveLength(1))
    unmount()
    expect(fakeHls.instances[0].destroyed).toBe(true)
  })

  it('backs off 2 s, 4 s, 8 s, then every 10 s', () => {
    expect([0, 1, 2, 3, 9].map(retryDelayMs)).toEqual([2000, 4000, 8000, 10000, 10000])
  })
})
