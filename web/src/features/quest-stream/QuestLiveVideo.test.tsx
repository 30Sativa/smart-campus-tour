import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestLiveVideo } from './QuestLiveVideo'
import { retryDelayMs } from './use-whep-stream'

// A stand-in for RTCPeerConnection: records what the WHEP client does and
// lets the test drive the connection state.
class FakePeerConnection extends EventTarget {
  static instances: FakePeerConnection[] = []
  config: RTCConfiguration
  connectionState: RTCPeerConnectionState = 'new'
  iceGatheringState: RTCIceGatheringState = 'complete'
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  transceivers: Array<{ kind: string; init?: RTCRtpTransceiverInit }> = []
  frames = 0
  closed = false

  constructor(config: RTCConfiguration) {
    super()
    this.config = config
    FakePeerConnection.instances.push(this)
  }
  addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
    this.transceivers.push({ kind, init })
  }
  async createOffer() {
    return { type: 'offer' as const, sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description
  }
  async getStats() {
    return new Map([['in', { type: 'inbound-rtp', kind: 'video', framesDecoded: this.frames }]])
  }
  close() {
    this.closed = true
  }
  setState(state: RTCPeerConnectionState) {
    this.connectionState = state
    this.dispatchEvent(new Event('connectionstatechange'))
  }
}

const WHEP_URL = 'http://nuc.local:8889/quest/whep'
const pcs = FakePeerConnection.instances
let fetchMock: ReturnType<typeof vi.fn>

function answer(status = 201) {
  if (status !== 201) return new Response('no stream is available on path', { status })
  return new Response('v=0\r\nanswer\r\n', {
    status: 201,
    headers: { 'Content-Type': 'application/sdp', Location: '/quest/whep/7f1c' },
  })
}

/** Waits until connection `n` has its answer applied and the hook saw it. */
async function negotiated(n: number) {
  await waitFor(() => expect(pcs[n]?.remoteDescription).not.toBeNull())
  await act(async () => {})
}

beforeEach(() => {
  pcs.length = 0
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'DELETE' ? new Response(null, { status: 200 }) : answer()))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.load = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')

describe('QuestLiveVideo (WebRTC / WHEP)', () => {
  it('says the stream is not configured when there is no WHEP URL', () => {
    render(<QuestLiveVideo src={null} />)
    expect(screen.getByText('Chưa cấu hình nguồn hình Quest')).toBeInTheDocument()
    expect(pcs).toHaveLength(0)
  })

  it('offers receive-only video to the WHEP endpoint, then shows the live picture', async () => {
    const { container } = render(<QuestLiveVideo src={WHEP_URL} label="AMR-01" />)
    expect(screen.getByText('Đang kết nối nguồn hình…')).toBeInTheDocument()

    await negotiated(0)
    expect(pcs[0].transceivers).toEqual([{ kind: 'video', init: { direction: 'recvonly' } }])
    const [url, init] = posts()[0] as [string, RequestInit]
    expect(url).toBe(WHEP_URL)
    expect(init.headers).toEqual({ 'Content-Type': 'application/sdp' })
    expect(init.body).toContain('m=video')
    expect(pcs[0].remoteDescription).toEqual({ type: 'answer', sdp: 'v=0\r\nanswer\r\n' })
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

  it('reports offline when there is no stream yet (404) and reconnects by itself', async () => {
    fetchMock.mockImplementationOnce(async () => answer(404))
    render(<QuestLiveVideo src={WHEP_URL} />)
    await waitFor(() => expect(screen.getByText('Không có tín hiệu từ kính Quest')).toBeInTheDocument())
    expect(pcs[0].closed).toBe(true)

    vi.useFakeTimers()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(retryDelayMs(0))
    })
    expect(posts()).toHaveLength(2)
  })

  it('treats an unreachable server as offline', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch')
    })
    render(<QuestLiveVideo src={WHEP_URL} />)
    await waitFor(() => expect(screen.getByText('Không có tín hiệu từ kính Quest')).toBeInTheDocument())
  })

  it('reconnects when the connection fails after going live', async () => {
    const { container } = render(<QuestLiveVideo src={WHEP_URL} />)
    await negotiated(0)
    act(() => {
      container.querySelector('video')!.dispatchEvent(new Event('playing'))
    })
    expect(screen.getByText('Trực tiếp')).toBeInTheDocument()

    vi.useFakeTimers()
    act(() => pcs[0].setState('failed'))
    expect(screen.getByText('Không có tín hiệu từ kính Quest')).toBeInTheDocument()
    expect(pcs[0].closed).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(retryDelayMs(0))
    })
    expect(pcs).toHaveLength(2)
  })

  it('reconnects immediately when the user presses retry', async () => {
    fetchMock.mockImplementationOnce(async () => answer(404))
    render(<QuestLiveVideo src={WHEP_URL} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Thử lại ngay/ })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Thử lại ngay/ }))
    await negotiated(1)
    expect(screen.getByText('Đang kết nối nguồn hình…')).toBeInTheDocument()
  })

  it('closes the connection and frees the server session on unmount', async () => {
    const { unmount } = render(<QuestLiveVideo src={WHEP_URL} />)
    await negotiated(0)
    unmount()
    expect(pcs[0].closed).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('http://nuc.local:8889/quest/whep/7f1c', expect.objectContaining({ method: 'DELETE' }))
  })

  it('says so when the browser has no WebRTC', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    render(<QuestLiveVideo src={WHEP_URL} />)
    await waitFor(() => expect(screen.getByText('Trình duyệt không phát được hình trực tiếp (WebRTC)')).toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('backs off 2 s, 4 s, 8 s, then every 10 s', () => {
    expect([0, 1, 2, 3, 9].map(retryDelayMs)).toEqual([2000, 4000, 8000, 10000, 10000])
  })
})
