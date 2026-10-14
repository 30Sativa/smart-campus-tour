import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { audioPath, AudioPeerError, openAudioPeer } from './audio-peer'

class Peer extends EventTarget {
  static peers: Peer[] = []
  connectionState = 'new'
  iceGatheringState = 'complete'
  localDescription: RTCSessionDescriptionInit | null = null
  transceivers: unknown[] = []
  close = vi.fn()
  constructor() { super(); Peer.peers.push(this) }
  addTransceiver(track: unknown, init: unknown) { this.transceivers.push({ track, init }) }
  async createOffer() { return { type: 'offer', sdp: 'audio offer' } }
  async setLocalDescription(sdp: RTCSessionDescriptionInit) { this.localDescription = sdp }
  async setRemoteDescription() {}
}
const options = () => ({ url: 'https://media.test/quest-mic/whep', authorization: 'Basic test-credential',
  signal: new AbortController().signal, onConnected: vi.fn(), onFailure: vi.fn() })
const answer = (location = '/quest-mic/session/123') => new Response('answer', { status: 201, headers: { Location: location } })
beforeEach(() => { Peer.peers = []; vi.stubGlobal('RTCPeerConnection', Peer) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('audio endpoint validation', () => {
  it('accepts HTTPS stream paths and strips protocol suffixes', () => {
    expect(audioPath('https://media.test/proxy/quest-mic/whep/')).toBe('https://media.test/proxy/quest-mic')
    for (const value of ['http://nuc/quest-mic', 'https://user:pass@media.test/mic', 'https://media.test/mic?token=secret', 'https://media.test', undefined]) expect(audioPath(value)).toBeNull()
  })
})
describe('audio transport ownership', () => {
  it('receives only audio and frees authenticated server sessions on close', async () => {
    const fetch = vi.fn().mockResolvedValue(answer())
    vi.stubGlobal('fetch', fetch)
    const session = await openAudioPeer(options())
    expect(Peer.peers[0].transceivers).toEqual([{ track: 'audio', init: { direction: 'recvonly' } }])
    session.close(); session.close()
    expect(Peer.peers[0].close).toHaveBeenCalledOnce()
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1)
    expect(fetch).toHaveBeenLastCalledWith('https://media.test/quest-mic/session/123', expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Basic test-credential' } }))
  })
  it('never forwards credentials to an off-origin session URL', async () => {
    const fetch = vi.fn().mockResolvedValue(answer('https://other.test/session'))
    vi.stubGlobal('fetch', fetch)
    await expect(openAudioPeer(options())).rejects.toBeInstanceOf(AudioPeerError)
    expect(fetch).toHaveBeenCalledOnce()
    expect(Peer.peers[0].close).toHaveBeenCalledOnce()
  })
  it('frees a session returned after an in-flight request was cancelled', async () => {
    const abort = new AbortController()
    let respond!: (response: Response) => void
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve })).mockResolvedValue(new Response(null))
    vi.stubGlobal('fetch', fetch)
    const opening = openAudioPeer({ ...options(), signal: abort.signal })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    abort.abort(); respond(answer())
    await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1)
  })
  it('reports ICE failure after acceptance and closes the session', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer()))
    const settings = options()
    await openAudioPeer(settings)
    await vi.advanceTimersByTimeAsync(20000)
    expect(settings.onFailure).toHaveBeenCalledOnce()
    expect(Peer.peers[0].close).toHaveBeenCalledOnce()
  })
})
