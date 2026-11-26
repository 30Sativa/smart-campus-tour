import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentGuideVoice } from '../student/components/StudentGuideVoice'
import { nextRetryMs, readVoiceAccess, useGuideVoice } from './guide-voice'

class Peer extends EventTarget {
  static peers: Peer[] = []
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription: RTCSessionDescriptionInit | null = null
  transceivers: unknown[] = []
  close = vi.fn()
  constructor() { super(); Peer.peers.push(this) }
  addTransceiver(kind: unknown, init: unknown) { this.transceivers.push({ kind, init }) }
  async createOffer() { return { type: 'offer', sdp: 'offer' } }
  async setLocalDescription(sdp: RTCSessionDescriptionInit) { this.localDescription = sdp }
  async setRemoteDescription() {}
  sendTrack() {
    const event = Object.assign(new Event('track'), { track: { kind: 'audio' } })
    this.dispatchEvent(event)
  }
}

const access = { url: 'https://relay.test/voice-abc/whep', token: 'listen-1', expiresAt: '2099-01-01T00:00:00Z' }
let relayStatus: number
let play: ReturnType<typeof vi.fn>

const relayPosts = () => vi.mocked(globalThis.fetch).mock.calls
  .filter(([url, init]) => String(url).startsWith('https://relay.test/') && init?.method === 'POST')

beforeEach(() => {
  Peer.peers = []
  relayStatus = 201
  play = vi.fn(() => Promise.resolve())
  vi.stubGlobal('RTCPeerConnection', Peer)
  vi.stubGlobal('MediaStream', class { tracks: unknown[]; constructor(tracks: unknown[]) { this.tracks = tracks } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/talk/voice-access')) return new Response(JSON.stringify({ success: true, data: access }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (init?.method === 'POST') return new Response(relayStatus === 201 ? 'answer' : '', { status: relayStatus, headers: { Location: '/voice-abc/whep/s1' } })
    return new Response(null, { status: 200 })
  }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>

describe('guide voice for Viewers (ADR-0072)', () => {
  it('reads only a complete access answer', () => {
    expect(readVoiceAccess(access)).toEqual(access)
    expect(readVoiceAccess({ ...access, token: '' })).toBeNull()
    expect(readVoiceAccess(null)).toBeNull()
  })

  it('backs off while nobody is on air, up to 10 s', () => {
    expect(nextRetryMs(0)).toBe(3000)
    expect(nextRetryMs(3000)).toBe(4500)
    expect(nextRetryMs(9000)).toBe(10000)
  })

  it('listens with the session token, receive-only, and plays the guide', async () => {
    const { result } = renderHook(() => useGuideVoice('tour-1', true, false), { wrapper })
    await waitFor(() => expect(relayPosts()).toHaveLength(1))
    const [url, init] = relayPosts()[0]
    expect(String(url)).toBe('https://relay.test/voice-abc/whep?token=listen-1')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/sdp' })
    const studentCall = vi.mocked(globalThis.fetch).mock.calls.find(([u]) => String(u).endsWith('/talk/voice-access'))!
    expect(String(studentCall[0])).toMatch(/\/api\/student\/tours\/tour-1\/talk\/voice-access$/)
    expect(studentCall[1]?.credentials).toBe('include')
    await waitFor(() => expect(Peer.peers[0].localDescription).not.toBeNull())
    expect(Peer.peers[0].transceivers).toEqual([{ kind: 'audio', init: { direction: 'recvonly' } }])

    act(() => Peer.peers[0].sendTrack())
    expect(play).toHaveBeenCalled()
    expect(result.current.blocked).toBe(false)
  })

  it('tries again while the guide has not opened the microphone (404)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    relayStatus = 404
    renderHook(() => useGuideVoice('tour-1', true, false), { wrapper })
    await waitFor(() => expect(relayPosts()).toHaveLength(1))
    relayStatus = 201
    await act(() => vi.advanceTimersByTimeAsync(3000))
    await waitFor(() => expect(relayPosts()).toHaveLength(2))
  })

  it('does not connect while the talk channel is closed', async () => {
    renderHook(() => useGuideVoice('tour-1', false, false), { wrapper })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('offers a button when the browser blocks the sound, and the button plays it', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('no', 'NotAllowedError')))
    const { result } = renderHook(() => useGuideVoice('tour-1', true, false), { wrapper })
    await waitFor(() => expect(Peer.peers).toHaveLength(1))
    await waitFor(() => expect(Peer.peers[0].localDescription).not.toBeNull())
    act(() => Peer.peers[0].sendTrack())
    await waitFor(() => expect(result.current.blocked).toBe(true))

    render(<StudentGuideVoice voice={result.current} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bật tiếng hướng dẫn viên' }))
    await waitFor(() => expect(result.current.blocked).toBe(false))
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('hangs up when the channel closes', async () => {
    const { rerender } = renderHook(({ on }) => useGuideVoice('tour-1', on, false), { wrapper, initialProps: { on: true } })
    await waitFor(() => expect(relayPosts()).toHaveLength(1))
    await waitFor(() => expect(Peer.peers[0].localDescription).not.toBeNull())
    rerender({ on: false })
    await waitFor(() => expect(Peer.peers[0].close).toHaveBeenCalled())
  })

  it('shows that the guide is speaking', () => {
    render(<StudentGuideVoice voice={{ speaking: true, blocked: false, enable: () => {} }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Hướng dẫn viên đang nói')
  })
})
