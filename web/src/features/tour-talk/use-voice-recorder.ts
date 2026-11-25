import { useCallback, useEffect, useRef, useState } from 'react'
import { TALK_MAX_AUDIO_MS } from './talk-types'

export type RecordedClip = { blob: Blob; durationMs: number; type: string }
export type RecorderState = 'idle' | 'starting' | 'recording' | 'unsupported' | 'denied'

/** The first type this browser records: Opus in WebM (Chrome, Firefox, Edge), MP4/AAC on Safari. */
function pickType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type))
}

/**
 * One voice clip at a time from the microphone, stopped by the caller or after {@link TALK_MAX_AUDIO_MS}. The
 * microphone is released as soon as the clip ends, so the browser's recording light goes out.
 */
export function useVoiceRecorder(onClip: (clip: RecordedClip) => void) {
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const [state, setState] = useState<RecorderState>(supported ? 'idle' : 'unsupported')
  const [elapsedMs, setElapsedMs] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const startedAt = useRef(0)
  const discard = useRef(false)
  const timers = useRef<{ tick?: number; limit?: number }>({})
  const latest = useRef(onClip)
  useEffect(() => { latest.current = onClip }, [onClip])

  const release = useCallback(() => {
    window.clearInterval(timers.current.tick)
    window.clearTimeout(timers.current.limit)
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    recorder.current = null
  }, [])

  useEffect(() => () => {
    discard.current = true
    if (recorder.current?.state === 'recording') recorder.current.stop()
    release()
  }, [release])

  const stop = useCallback((keep = true) => {
    discard.current = !keep
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [])

  const start = useCallback(async () => {
    if (!supported || recorder.current) return
    setState('starting')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = media
      const type = pickType()
      const next = type ? new MediaRecorder(media, { mimeType: type }) : new MediaRecorder(media)
      const chunks: Blob[] = []
      next.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data) }
      next.onstop = () => {
        const durationMs = Math.min(TALK_MAX_AUDIO_MS, Date.now() - startedAt.current)
        const blobType = (next.mimeType || type || 'audio/webm').split(';')[0]
        release()
        setState('idle')
        setElapsedMs(0)
        if (!discard.current && chunks.length > 0 && durationMs >= 300)
          latest.current({ blob: new Blob(chunks, { type: blobType }), durationMs, type: blobType })
      }
      recorder.current = next
      discard.current = false
      startedAt.current = Date.now()
      next.start()
      setState('recording')
      timers.current.tick = window.setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250)
      timers.current.limit = window.setTimeout(() => stop(true), TALK_MAX_AUDIO_MS)
    } catch {
      release()
      setState('denied')
    }
  }, [release, stop, supported])

  return { state, elapsedMs, start, stop: () => stop(true), cancel: () => stop(false) }
}
