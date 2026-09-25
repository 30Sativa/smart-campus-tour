import { useCallback, useEffect, useState, type RefObject } from 'react'
import type Hls from 'hls.js'

/**
 * - `idle`: no stream configured (or not enabled)
 * - `connecting`: loading the playlist or waiting for the first frame
 * - `live`: frames are playing
 * - `offline`: the stream server has no stream (Quest unplugged or asleep,
 *   pipeline restarting) or cannot be reached; a reconnect is scheduled
 * - `error`: this browser cannot play HLS at all
 */
export type HlsStreamStatus = 'idle' | 'connecting' | 'live' | 'offline' | 'error'

/** Wait before reconnecting after a failure: 2 s, 4 s, 8 s, then every 10 s. */
export function retryDelayMs(attempt: number) {
  return Math.min(10_000, 2_000 * 2 ** Math.max(0, attempt))
}

/** No new frame for this long while playing = the stream stopped; reconnect. */
const STALL_MS = 8_000

/**
 * Plays a live HLS stream in `videoRef` and keeps it playing: reconnects with
 * back-off after errors or stalls, and tears everything down on unmount or
 * when `src` changes. Safari/iOS play HLS natively; elsewhere hls.js is
 * loaded on demand, so a page without a stream never downloads it.
 */
export function useHlsStream(videoRef: RefObject<HTMLVideoElement | null>, src: string | null, enabled = true) {
  const [session, setSession] = useState(0) // bump = reconnect now
  const key = src && enabled ? `${src}#${session}` : null
  const [reported, setReported] = useState<{ key: string | null; status: HlsStreamStatus }>({ key: null, status: 'idle' })

  // Until this connection reports something, it is connecting.
  const status: HlsStreamStatus = key === null ? 'idle' : reported.key === key ? reported.status : 'connecting'

  const retry = useCallback(() => setSession((n) => n + 1), [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src || !key) return

    let disposed = false
    let hls: Hls | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let lastTime = -1
    let lastProgressAt = Date.now()

    const report = (next: HlsStreamStatus) => {
      if (!disposed) setReported({ key, status: next })
    }

    const teardownMedia = () => {
      hls?.destroy()
      hls = null
      video.removeAttribute('src')
      video.load()
    }

    const scheduleReconnect = (next: HlsStreamStatus) => {
      if (disposed) return
      report(next)
      teardownMedia()
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => {
        attempt += 1
        void connect()
      }, retryDelayMs(attempt))
    }

    const onPlaying = () => {
      attempt = 0
      lastProgressAt = Date.now()
      report('live')
    }
    const onTimeUpdate = () => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime
        lastProgressAt = Date.now()
      }
    }
    const onNativeError = () => scheduleReconnect('offline')
    video.addEventListener('playing', onPlaying)
    video.addEventListener('timeupdate', onTimeUpdate)

    const hasSource = () => hls !== null || video.hasAttribute('src')
    const watchdog = setInterval(() => {
      if (!disposed && hasSource() && !video.paused && Date.now() - lastProgressAt > STALL_MS) {
        scheduleReconnect('connecting')
      }
    }, 2_000)

    const play = () => {
      video.play()?.catch(() => {
        // Autoplay with sound refused: retry muted (browsers allow that).
        video.muted = true
        video.play()?.catch(() => {})
      })
    }

    async function connect() {
      if (disposed || !video || !src) return
      lastProgressAt = Date.now()

      // Safari / iOS: native HLS.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.addEventListener('error', onNativeError, { once: true })
        video.src = src
        play()
        return
      }

      const { default: HlsLib } = await import('hls.js')
      if (disposed) return
      if (!HlsLib.isSupported()) {
        report('error')
        return
      }
      const instance = new HlsLib({
        // Stay ~2 segments (~2 s) behind the live edge, never more than 5.
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 5,
        maxLiveSyncPlaybackRate: 1.2,
        backBufferLength: 10,
      })
      hls = instance
      instance.on(HlsLib.Events.MANIFEST_PARSED, play)
      instance.on(HlsLib.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        // Playlist 503/404 or server unreachable = no stream right now.
        scheduleReconnect(data.type === HlsLib.ErrorTypes.NETWORK_ERROR ? 'offline' : 'connecting')
      })
      instance.attachMedia(video)
      instance.loadSource(src)
    }

    void connect()

    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearInterval(watchdog)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('error', onNativeError)
      teardownMedia()
    }
  }, [videoRef, src, key])

  return { status, retry }
}
