/**
 * A minimal WHEP client (WebRTC-HTTP Egress Protocol, RFC 9725): receive one
 * live video from a media server such as MediaMTX
 * (`http://<NUC>:8889/<path>/whep`). No library: one RTCPeerConnection, one
 * HTTP POST with the SDP offer, one DELETE when done.
 */

export type WhepFailure =
  /** No stream on that path yet (404) or the server cannot be reached. */
  | 'offline'
  /** This browser has no WebRTC, or cannot decode what the server sends. */
  | 'unsupported'
  /** Anything else the server refused (auth, bad request, server error). */
  | 'failed'

export class WhepError extends Error {
  readonly kind: WhepFailure
  readonly httpStatus?: number

  constructor(kind: WhepFailure, message: string, httpStatus?: number) {
    super(message)
    this.name = 'WhepError'
    this.kind = kind
    this.httpStatus = httpStatus
  }
}

export type WhepSession = {
  /** Frames decoded so far (from getStats); used to notice a frozen stream. */
  framesDecoded(): Promise<number>
  /** True once ICE/DTLS is up. */
  isConnected(): boolean
  close(): void
}

export type WhepOptions = {
  iceServers?: RTCIceServer[]
  /** Aborts the HTTP request (e.g. the component unmounted mid-connect). */
  signal?: AbortSignal
  /** Called once when the connection drops after it was set up. */
  onDisconnect?: () => void
  /** How long to wait for local ICE candidates before sending the offer. */
  iceGatheringTimeoutMs?: number
  /** A 'disconnected' connection gets this long to recover by itself. */
  disconnectGraceMs?: number
}

/**
 * `http://nuc:8889/quest` (the MediaMTX page) and `.../quest/whep` both give
 * the WHEP endpoint. Anything that is not an http(s) URL gives null.
 */
export function resolveWhepUrl(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (/\.m3u8$/i.test(url.pathname)) return null // an old HLS address, not WHEP
  url.pathname = url.pathname.replace(/\/+$/, '')
  if (!/\/whep$/i.test(url.pathname)) url.pathname += '/whep'
  return url.toString()
}

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      pc.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    // On a LAN host candidates arrive at once; never hold the offer for long.
    const timer = setTimeout(done, timeoutMs)
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

/**
 * Starts receiving `whepUrl` into `video`. Resolves once the server accepted
 * the offer (the picture follows when the first frame is decoded: listen for
 * the video's `playing` event). Rejects with a `WhepError`.
 */
export async function startWhep(whepUrl: string, video: HTMLVideoElement, options: WhepOptions = {}): Promise<WhepSession> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new WhepError('unsupported', 'WebRTC is not available in this browser')
  }

  const pc = new RTCPeerConnection({ iceServers: options.iceServers ?? [] })
  let resourceUrl: string | null = null
  let closed = false
  let connected = false
  let graceTimer: ReturnType<typeof setTimeout> | undefined

  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(graceTimer)
    pc.close()
    if (video.srcObject) video.srcObject = null
    // Frees the session on the server at once instead of after its timeout.
    if (resourceUrl) void fetch(resourceUrl, { method: 'DELETE', keepalive: true }).catch(() => {})
  }

  const dropped = () => {
    if (closed) return
    close()
    options.onDisconnect?.()
  }

  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addEventListener('track', (event) => {
    video.srcObject = event.streams[0] ?? new MediaStream([event.track])
  })
  pc.addEventListener('connectionstatechange', () => {
    const state = pc.connectionState
    if (state === 'connected') {
      connected = true
      clearTimeout(graceTimer)
    } else if (state === 'failed' || state === 'closed') {
      dropped()
    } else if (state === 'disconnected') {
      clearTimeout(graceTimer)
      graceTimer = setTimeout(() => {
        if (pc.connectionState !== 'connected') dropped()
      }, options.disconnectGraceMs ?? 4_000)
    }
  })

  try {
    await pc.setLocalDescription(await pc.createOffer())
    await waitForIceGathering(pc, options.iceGatheringTimeoutMs ?? 1_500)

    let response: Response
    try {
      response = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription?.sdp ?? '',
        signal: options.signal,
      })
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error
      throw new WhepError('offline', `cannot reach ${whepUrl}`)
    }

    if (response.status === 404) {
      throw new WhepError('offline', 'no stream on this path yet', 404)
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200)
      // MediaMTX answers 400 when the browser offered no codec it can send.
      const kind: WhepFailure = response.status === 400 && /codec/i.test(detail) ? 'unsupported' : 'failed'
      throw new WhepError(kind, `WHEP ${response.status}${detail ? `: ${detail}` : ''}`, response.status)
    }

    const location = response.headers.get('Location')
    if (location) resourceUrl = new URL(location, whepUrl).toString()
    const answer = await response.text()
    if (closed) throw new DOMException('closed', 'AbortError')
    await pc.setRemoteDescription({ type: 'answer', sdp: answer })
  } catch (error) {
    close()
    throw error
  }

  return {
    async framesDecoded() {
      if (closed) return 0
      let frames = 0
      const stats = await pc.getStats()
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          frames = Math.max(frames, Number(report.framesDecoded ?? 0))
        }
      })
      return frames
    },
    isConnected: () => connected && !closed,
    close,
  }
}
