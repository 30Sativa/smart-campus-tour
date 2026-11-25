import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clipLength } from './talk-types'

type Props = {
  /** Loads the clip (the Staff call carries the JWT, the Student call the session cookie). */
  load: () => Promise<Blob>
  durationMs: number | null
  available: boolean
  /** Plays as soon as it loads, when the browser allows it; otherwise the button waits for a press. */
  autoPlay?: boolean
  /** Told once when the clip starts by itself, so it is not started by itself again. */
  onAutoPlay?: () => void
  className?: string
}

/**
 * Play/pause for one Tour talk voice clip. The clip is fetched as a blob, not by URL, because both readers
 * authenticate the request (ADR-0070).
 */
export function TalkAudioButton({ load, durationMs, available, autoPlay = false, onAutoPlay, className }: Props) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const url = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const loadRef = useRef(load)
  useEffect(() => { loadRef.current = load }, [load])

  useEffect(() => () => {
    audio.current?.pause()
    if (url.current) URL.revokeObjectURL(url.current)
  }, [])

  const ensure = async () => {
    if (audio.current) return audio.current
    const blob = await loadRef.current()
    url.current = URL.createObjectURL(blob)
    const element = new Audio(url.current)
    element.onended = () => setPlaying(false)
    element.onpause = () => setPlaying(false)
    element.onplay = () => setPlaying(true)
    audio.current = element
    return element
  }

  const play = (automatic: boolean) => ensure()
    .then(element => {
      element.currentTime = 0
      return element.play()
    })
    .then(() => { setBlocked(false); setFailed(false) })
    .catch((error: unknown) => {
      // A browser that has not seen a press on this page refuses to play by itself (NotAllowedError).
      if (automatic && error instanceof DOMException && error.name === 'NotAllowedError') setBlocked(true)
      else setFailed(true)
    })

  useEffect(() => {
    if (!autoPlay || !available) return
    onAutoPlay?.()
    void play(true)
    // Only once, for the clip this button was created for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!available) return <span className={className} data-state="gone">Đoạn ghi âm không còn lưu</span>
  return (
    <button type="button" className={className} data-state={playing ? 'playing' : blocked ? 'blocked' : 'idle'}
      onClick={() => playing ? audio.current?.pause() : void play(false)}
      aria-label={playing ? 'Dừng đoạn ghi âm' : `Nghe đoạn ghi âm ${clipLength(durationMs)}`}>
      {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      <span>{failed ? 'Không phát được, thử lại' : blocked ? 'Bấm để nghe' : playing ? 'Đang phát' : 'Nghe'}</span>
      <span className="tabular-nums" aria-hidden="true">{clipLength(durationMs)}</span>
    </button>
  )
}
