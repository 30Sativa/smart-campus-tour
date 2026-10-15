/** Audio-only WHIP publisher / WHEP reader. Credentials stay in session memory. */
export class AudioPeerError extends Error {
  readonly status?: number

  constructor(status?: number) {
    super('Audio connection failed')
    this.status = status
  }
}

export function audioPath(value: string | undefined): string | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(whip|whep)$/, '')
    if (!url.pathname || url.pathname === '/') return null
    return url.toString().replace(/\/$/, '')
  } catch { return null }
}

export type AudioPeer = { close(): void }
export type AudioPeerOptions = {
  url: string
  authorization: string
  signal: AbortSignal
  iceServers?: RTCIceServer[]
  stream?: MediaStream
  onTrack?: (track: MediaStreamTrack) => void
  onConnected: () => void
  onFailure: () => void
}

export async function openAudioPeer(options: AudioPeerOptions): Promise<AudioPeer> {
  const pc = new RTCPeerConnection({ iceServers: options.iceServers ?? [] })
  let resource: string | null = null
  let closed = false
  let connectTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  const removeResource = () => {
    if (!resource) return
    const url = resource
    resource = null
    void fetch(url, { method: 'DELETE', headers: { Authorization: options.authorization }, keepalive: true }).catch(() => {})
  }
  const close = () => {
    if (!closed) {
      closed = true
      clearTimeout(connectTimer)
      clearTimeout(graceTimer)
      options.signal.removeEventListener('abort', close)
      pc.close()
    }
    removeResource()
  }
  const fail = () => { if (!closed) { close(); options.onFailure() } }
  options.signal.addEventListener('abort', close, { once: true })
  const checkOpen = () => { if (closed || options.signal.aborted) throw new DOMException('Aborted', 'AbortError') }
  try {
    checkOpen()
    if (options.stream) {
      for (const track of options.stream.getAudioTracks()) pc.addTransceiver(track, { direction: 'sendonly', streams: [options.stream] })
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addEventListener('track', event => { if (!closed && event.track.kind === 'audio') options.onTrack?.(event.track) })
    }
    pc.addEventListener('connectionstatechange', () => {
      if (closed) return
      if (pc.connectionState === 'connected') {
        clearTimeout(connectTimer)
        clearTimeout(graceTimer)
        options.onConnected()
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') fail()
      else if (pc.connectionState === 'disconnected') {
        clearTimeout(graceTimer)
        graceTimer = setTimeout(fail, 4000)
      }
    })
    await pc.setLocalDescription(await pc.createOffer())
    checkOpen()
    if (pc.iceGatheringState !== 'complete') {
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', change); options.signal.removeEventListener('abort', done); resolve() }
        const change = () => { if (pc.iceGatheringState === 'complete') done() }
        const timer = setTimeout(done, 2000)
        pc.addEventListener('icegatheringstatechange', change)
        options.signal.addEventListener('abort', done, { once: true })
      })
    }
    checkOpen()
    const response = await fetch(options.url, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/sdp', Authorization: options.authorization },
      body: pc.localDescription?.sdp ?? '', signal: options.signal })
    if (response.status !== 201) throw new AudioPeerError(response.status)
    const location = response.headers.get('Location')
    if (!location) throw new AudioPeerError()
    const session = new URL(location, options.url)
    // Never forward a password to an origin supplied by a response header.
    if (session.origin !== new URL(options.url).origin || session.username || session.password) throw new AudioPeerError()
    resource = session.toString()
    checkOpen()
    const sdp = await response.text()
    checkOpen()
    await pc.setRemoteDescription({ type: 'answer', sdp })
    checkOpen()
    if (pc.connectionState !== 'connected') connectTimer = setTimeout(fail, 20000)
    return { close }
  } catch (error) { close(); throw error }
}
