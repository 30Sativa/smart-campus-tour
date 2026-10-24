import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioPeerOptions } from './audio-peer'
import { AudioPeerError, openAudioPeer } from './audio-peer'
import { useQuestIntercom } from './use-quest-intercom'

vi.mock('./audio-peer', async importOriginal => ({ ...await importOriginal<typeof import('./audio-peer')>(), openAudioPeer: vi.fn() }))
vi.mock('./quest-stream-config', () => ({ QUEST_ICE_SERVERS: [] }))
const open = vi.mocked(openAudioPeer)
const track = () => Object.assign(new EventTarget(), { enabled: true, stop: vi.fn() })
let micTrack: ReturnType<typeof track>
let getUserMedia: ReturnType<typeof vi.fn>
let connections: AudioPeerOptions[]
let closes: ReturnType<typeof vi.fn>[]
beforeEach(() => {
  micTrack = track()
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [micTrack], getAudioTracks: () => [micTrack] })
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('RTCPeerConnection', function () {})
  connections = []; closes = []
  open.mockReset().mockImplementation(async settings => { connections.push(settings); const close = vi.fn(); closes.push(close); return { close } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('intercom user controls and cleanup', () => {
  it('does not capture on mount; starts muted and requires both directions before reporting connected', async () => {
    const { result, unmount } = renderHook(() => useQuestIntercom('https://media.test/staff', 'https://media.test/quest'))
    expect(getUserMedia).not.toHaveBeenCalled()
    await act(() => result.current.start('staff', 'password'))
    expect(result.current.state).toBe('waiting')
    expect(micTrack.enabled).toBe(false)
    expect(connections.map(c => c.url)).toEqual(['https://media.test/staff/whip', 'https://media.test/quest/whep'])
    act(() => connections[1].onConnected())
    expect(result.current.state).toBe('waiting')
    act(() => connections[0].onConnected())
    expect(result.current.state).toBe('connected')
    act(() => result.current.toggleMic())
    expect(micTrack.enabled).toBe(true)
    act(() => result.current.stop())
    expect(micTrack.stop).toHaveBeenCalledOnce()
    expect(connections[0].signal.aborted).toBe(true)
    for (const close of closes) expect(close).toHaveBeenCalledOnce()
    unmount()
    expect(micTrack.stop).toHaveBeenCalledOnce()
  })
  it('stops a late microphone permission response after unmount without publishing it', async () => {
    let grant!: (stream: unknown) => void
    getUserMedia.mockImplementation(() => new Promise(resolve => { grant = resolve }))
    const { result, unmount } = renderHook(() => useQuestIntercom('https://media.test/staff', 'https://media.test/quest'))
    let starting!: Promise<void>
    act(() => { starting = result.current.start('staff', 'password') })
    unmount()
    grant({ getTracks: () => [micTrack], getAudioTracks: () => [micTrack] })
    await starting
    expect(micTrack.stop).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
  })
  it('retries a missing peer and cancels the wait when the user disconnects', async () => {
    vi.useFakeTimers()
    open.mockImplementation(async settings => { connections.push(settings); if (settings.url.endsWith('/whep')) throw new AudioPeerError(404); return { close: vi.fn() } })
    const { result } = renderHook(() => useQuestIntercom('https://media.test/staff', 'https://media.test/quest'))
    act(() => { void result.current.start('staff', 'password') })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(result.current.state).toBe('waiting')
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(connections.filter(c => c.url.endsWith('/whep'))).toHaveLength(2)
    act(() => result.current.stop())
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(connections).toHaveLength(3)
    expect(micTrack.stop).toHaveBeenCalledOnce()
  })
  it('refuses denied credentials and stops the captured microphone', async () => {
    open.mockRejectedValue(new AudioPeerError(401))
    const { result } = renderHook(() => useQuestIntercom('https://media.test/staff', 'https://media.test/quest'))
    await act(() => result.current.start('staff', 'password'))
    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.error).toContain('Tài khoản âm thanh')
    expect(micTrack.stop).toHaveBeenCalledOnce()
  })
})
