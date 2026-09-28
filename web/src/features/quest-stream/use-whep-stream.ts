import { useCallback, useEffect, useState, type RefObject } from 'react'
import { QUEST_ICE_SERVERS } from './quest-stream-config'
import { startWhep, WhepError, type WhepSession } from './whep'

/**
 * - `idle`: no stream configured (or not enabled)
 * - `connecting`: negotiating WebRTC or waiting for the first frame
 * - `live`: frames are playing
 * - `offline`: the media server has no stream (Quest unplugged or asleep,
 *   pipeline restarting) or cannot be reached; a reconnect is scheduled
 * - `error`: this browser cannot play the stream (no WebRTC / no H.264)
 */
export type LiveStreamStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'error'

/** Wait before reconnecting after a failure: 2 s, 4 s, 8 s, then every 10 s. */
export function retryDelayMs(attempt: number) {
  return Math.min(10_000, 2_000 * 2 ** Math.max(0, attempt))
}

/** No newly decoded frame for this long while live = frozen; reconnect. */
const STALL_MS = 6_000
/** Server accepted but no picture within this long (e.g. UDP 8189 blocked). */
const FIRST_FRAME_MS = 12_000
const WATCHDOG_MS = 2_000

/**
 * Plays a WebRTC (WHEP) live stream in `videoRef` and keeps it playing:
 * reconnects with back-off when the server has no stream, the connection
 * drops or the picture freezes, and tears everything down on unmount or when
 * `whepUrl` changes.
 */
export function useWhepStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  whepUrl: string | null,
  enabled = true,
) {
  const [session, setSession] = useState(0) // bump = reconnect now
  const key = whepUrl && enabled ? `${whepUrl}#${session}` : null
  const [reported, setReported] = useState<{ key: string | null; status: LiveStreamStatus }>({ key: null, status: 'idle' })

  // Until this connection reports something, it is connecting.
  const status: LiveStreamStatus = key === null ? 'idle' : reported.key === key ? reported.status : 'connecting'

  const retry = useCallback(() => setSession((n) => n + 1), [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !whepUrl || !key) return

    let disposed = false
    let current: WhepSession | null = null
    let abort: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let live = false
    let startedAt = Date.now()
    let lastFrames = -1
    let lastProgressAt = Date.now()

    const report = (next: LiveStreamStatus) => {
      if (!disposed) setReported({ key, status: next })
    }

    const teardown = () => {
      abort?.abort()
      abort = null
      current?.close()
      current = null
      live = false
    }

    const scheduleReconnect = (next: LiveStreamStatus) => {
      if (disposed) return
      report(next)
      teardown()
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => {
        attempt += 1
        void connect()
      }, retryDelayMs(attempt))
    }

    const onPlaying = () => {
      if (!current) return
      attempt = 0
      live = true
      lastProgressAt = Date.now()
      report('live')
    }
    video.addEventListener('playing', onPlaying)

    const watchdog = setInterval(() => {
      const s = current
      if (disposed || !s) return
      if (!live) {
        if (Date.now() - startedAt > FIRST_FRAME_MS) {
          if (!s.isConnected()) {
            console.warn('[quest-stream] WebRTC did not connect: is UDP 8189 open on the NUC firewall?')
          }
          scheduleReconnect('offline')
        }
        return
      }
      void s.framesDecoded().then((frames) => {
        if (disposed || s !== current) return
        if (frames !== lastFrames) {
          lastFrames = frames
          lastProgressAt = Date.now()
        } else if (Date.now() - lastProgressAt > STALL_MS) {
          scheduleReconnect('connecting')
        }
      }, () => {})
    }, WATCHDOG_MS)

    const play = () => {
      video.muted = true // autoplay needs muted; the Quest stream has no audio
      video.play()?.catch(() => {})
    }

    async function connect() {
      if (disposed || !video || !whepUrl) return
      teardown()
      startedAt = Date.now()
      lastFrames = -1
      const controller = new AbortController()
      abort = controller
      try {
        const s = await startWhep(whepUrl, video, {
          iceServers: QUEST_ICE_SERVERS,
          signal: controller.signal,
          onDisconnect: () => {
            if (current === s) scheduleReconnect('offline')
          },
        })
        if (disposed || controller.signal.aborted) {
          s.close()
          return
        }
        current = s
        abort = null
        play()
        // The first frame may already be playing if it beat this line.
        if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onPlaying()
      } catch (error) {
        if (disposed || controller.signal.aborted) return
        if (error instanceof WhepError && error.kind === 'unsupported') {
          report('error')
          return
        }
        scheduleReconnect('offline')
      }
    }

    void connect()

    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearInterval(watchdog)
      video.removeEventListener('playing', onPlaying)
      teardown()
    }
  }, [videoRef, whepUrl, key])

  return { status, retry }
}
