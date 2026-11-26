import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../../stores/auth-store'
import type { TalkFeed, TalkMessage } from '../../../tour-talk/talk-types'
import { TourTalkPanel } from './TourTalkPanel'

const message = (patch: Partial<TalkMessage>): TalkMessage => ({
  id: crypto.randomUUID(), seq: 1, from: 'STAFF', text: null, hasAudio: false, audioAvailable: false, audioDurationMs: null,
  staffName: 'Lan Staff', viewerName: null, viewerClass: null, viewerRowType: null, mine: false, sentAt: '2026-11-25T08:00:00Z', ...patch,
})

let feed: TalkFeed
let posts: FormData[]

beforeEach(() => {
  posts = []
  feed = { epoch: 'e1', lastSeq: 3, open: true, canSend: true, messages: [
    message({ seq: 1, text: 'Các bạn muốn đi điểm nào tiếp theo?' }),
    message({ seq: 2, from: 'VIEWER', text: 'Thư viện ạ', staffName: null, viewerName: 'Nguyễn An', viewerClass: '12A1', viewerRowType: 'INDIVIDUAL' }),
    message({ seq: 3, from: 'STAFF', hasAudio: true, audioAvailable: false, audioDurationMs: 4000 }),
  ] }
  useAuthStore.getState().setAuth('t', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(init.body as FormData)
    const data = init?.method === 'POST' ? feed.messages[0] : feed
    return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <TourTalkPanel tourId="tour-1" operatorName="Lan Staff" />
</QueryClientProvider>)

describe('Tour talk on the live console (ADR-0070)', () => {
  it('shows the Operator messages and who replied, and sends text to every Viewer', async () => {
    mount()
    const list = within(await screen.findByRole('list', { name: 'Tin nhắn' }))
    expect(await list.findByText('Thư viện ạ')).toBeInTheDocument()
    expect(list.getByText('Nguyễn An')).toBeInTheDocument()
    expect(list.getByText('· 12A1')).toBeInTheDocument()
    expect(list.getByText('Đoạn ghi âm không còn lưu')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tin nhắn cho người xem'), { target: { value: '  Chúng ta sắp tới thư viện  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].get('text')).toBe('Chúng ta sắp tới thư viện')
    expect(posts[0].get('audio')).toBeNull()
    const [url] = vi.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(String(url)).toMatch(/\/api\/staff\/manage\/tours\/tour-1\/talk$/)
  })

  it('sends a quick prompt in one press', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Các bạn có câu hỏi gì về điểm này không?' }))
    await waitFor(() => expect(posts[0]?.get('text')).toBe('Các bạn có câu hỏi gì về điểm này không?'))
  })

  it('lets another Staff read without sending', async () => {
    feed = { ...feed, canSend: false }
    mount()
    expect(await screen.findByText(/Chỉ Lan Staff mới nói chuyện/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Tin nhắn cho người xem')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nhấn giữ để nói/ })).not.toBeInTheDocument()
  })
})

class Peer extends EventTarget {
  static peers: Peer[] = []
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription: RTCSessionDescriptionInit | null = null
  close = vi.fn()
  constructor() { super(); Peer.peers.push(this) }
  addTransceiver() {}
  async createOffer() { return { type: 'offer', sdp: 'offer' } }
  async setLocalDescription(sdp: RTCSessionDescriptionInit) { this.localDescription = sdp }
  async setRemoteDescription() {}
  connect() { this.connectionState = 'connected'; this.dispatchEvent(new Event('connectionstatechange')) }
}

describe('Live push-to-talk (ADR-0072)', () => {
  let track: { enabled: boolean; stop: ReturnType<typeof vi.fn> }
  let getUserMedia: ReturnType<typeof vi.fn>
  let now: number
  const access = { url: 'https://relay.test/voice-abc/whip', token: 'tok-1', expiresAt: '2026-11-25T08:02:00Z' }

  beforeEach(() => {
    Peer.peers = []
    now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    track = { enabled: true, stop: vi.fn() }
    getUserMedia = vi.fn(async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }))
    vi.stubGlobal('RTCPeerConnection', Peer)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    const base = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/talk/voice-access')) return new Response(JSON.stringify({ success: true, data: access }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.startsWith('https://relay.test/')) return new Response(init?.method === 'POST' ? 'answer' : null, { status: init?.method === 'POST' ? 201 : 200, headers: { Location: '/voice-abc/whip/s1' } })
      return base(input, init)
    }))
  })
  afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'mediaDevices') })

  const relayPosts = () => vi.mocked(globalThis.fetch).mock.calls.filter(([url, init]) => String(url).startsWith('https://relay.test/') && init?.method === 'POST')

  it('publishes the microphone with the token while held, and keeps the connection for the next press', async () => {
    mount()
    const button = await screen.findByRole('button', { name: 'Nhấn giữ để nói' })
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 })
    await waitFor(() => expect(relayPosts()).toHaveLength(1))
    expect(String(relayPosts()[0][0])).toBe('https://relay.test/voice-abc/whip?token=tok-1')
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    expect(track.enabled).toBe(true)
    act(() => Peer.peers[0].connect())
    expect(await screen.findByRole('button', { name: 'Đang nói với người xem…' })).toHaveAttribute('aria-pressed', 'true')

    now += 2000
    fireEvent.pointerUp(button, { pointerId: 1 })
    expect(track.enabled).toBe(false)
    expect(await screen.findByText(/Micro đã sẵn sàng/)).toBeInTheDocument()

    fireEvent.pointerDown(button, { button: 0, pointerId: 1 })
    expect(track.enabled).toBe(true)
    now += 2000
    fireEvent.pointerUp(button, { pointerId: 1 })
    expect(track.enabled).toBe(false)
    expect(relayPosts()).toHaveLength(1)
    expect(getUserMedia).toHaveBeenCalledOnce()
  })

  it('a quick tap keeps the microphone on until the next tap; the keyboard works too', async () => {
    mount()
    const button = await screen.findByRole('button', { name: 'Nhấn giữ để nói' })
    fireEvent.keyDown(button, { key: ' ' })
    await waitFor(() => expect(relayPosts()).toHaveLength(1))
    act(() => Peer.peers[0].connect())
    now += 100
    fireEvent.keyUp(button, { key: ' ' })
    expect(track.enabled).toBe(true)
    expect(await screen.findByRole('button', { name: /Nhấn để tắt micro/ })).toBeInTheDocument()

    fireEvent.pointerDown(button, { button: 0, pointerId: 1 })
    expect(track.enabled).toBe(false)
    fireEvent.pointerUp(button, { pointerId: 1 })
    expect(track.enabled).toBe(false)
    expect(await screen.findByRole('button', { name: 'Nhấn giữ để nói' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tells the Operator when the microphone is refused', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
    mount()
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Nhấn giữ để nói' }), { button: 0, pointerId: 1 })
    expect(await screen.findByText(/Trình duyệt chưa cho dùng micro/)).toBeInTheDocument()
    expect(relayPosts()).toHaveLength(0)
  })

  it('hangs up and frees the microphone when the page closes', async () => {
    const view = mount()
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Nhấn giữ để nói' }), { button: 0, pointerId: 1 })
    await waitFor(() => expect(relayPosts()).toHaveLength(1))
    await waitFor(() => expect(Peer.peers[0].close).not.toHaveBeenCalled())
    view.unmount()
    expect(track.stop).toHaveBeenCalled()
    expect(Peer.peers[0].close).toHaveBeenCalled()
  })
})
