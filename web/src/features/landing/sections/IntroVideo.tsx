import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import { STORY_CHAPTERS, chapterStart, introChapter } from '../robot-explode/story'

const VIDEO = `${import.meta.env.BASE_URL}videos/robot-intro`

/** Seconds played after which the video counts as flowing, even if the browser never said it could play through. */
const FLOWING = 4

/**
 * Section 04's intro: a short video of the robot (`web/public/videos/`), its
 * five chapters' text laid over it as it plays, the chapters down the right
 * side to jump to, a progress line and a way to skip. It plays while `active`
 * (in view, and still the intro) and calls `onDone` at its end, on a skip or
 * if the video cannot play at all; `leaving` fades it out. A browser that
 * refuses to start it on its own gets a play button. `onFlowing` says once
 * that enough of it has arrived to play to the end, so heavier downloads can
 * start without making it stall.
 */
export function IntroVideo({ active, leaving, replay, chapter: renderChapter, onDone, onFlowing }: {
  active: boolean
  leaving: boolean
  /** Changes when the visitor asks to watch again: back to the start. */
  replay: number
  chapter: (index: number) => ReactNode
  onDone: () => void
  onFlowing: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const replayRef = useRef(replay)
  const [chapter, setChapter] = useState(0)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (replayRef.current !== replay) {
      replayRef.current = replay
      video.currentTime = 0
    }
    if (!active) {
      if (!video.paused) video.pause()
      return
    }
    // Muted and inline, so browsers let it start by itself; some (power saving) still refuse.
    const attempt = video.play() as Promise<void> | undefined
    attempt?.then(() => setBlocked(false), () => setBlocked(true))
  }, [active, replay])

  // The progress line follows the video every frame while it plays.
  useEffect(() => {
    if (!active) return
    let frame = 0
    const draw = () => {
      const video = videoRef.current
      if (video && barRef.current && video.duration > 0) barRef.current.style.transform = `scaleX(${video.currentTime / video.duration})`
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [active])

  const seek = (index: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = chapterStart(index)
    setChapter(index)
  }

  const play = () => {
    const attempt = videoRef.current?.play() as Promise<void> | undefined
    attempt?.then(() => setBlocked(false), () => setBlocked(true))
  }

  return (
    <div className="lp3-td lp3-intro" data-story="on" data-leaving={leaving} aria-hidden={leaving || undefined} inert={leaving}>
      <video
        ref={videoRef}
        className="lp3-intro__video"
        muted
        playsInline
        preload="auto"
        poster={`${VIDEO}.jpg`}
        aria-hidden="true"
        onTimeUpdate={event => {
          const time = event.currentTarget.currentTime
          setChapter(introChapter(time))
          if (time > FLOWING) onFlowing()
        }}
        onCanPlayThrough={onFlowing}
        onEnded={onDone}
        onError={onDone}
      >
        <source src={`${VIDEO}-720.mp4`} type='video/mp4; codecs="avc1.64001f"' media="(max-width: 720px)" />
        <source src={`${VIDEO}.mp4`} type='video/mp4; codecs="avc1.640028"' />
        {/* For browsers without H.264 (some Linux builds). */}
        <source src={`${VIDEO}.webm`} type='video/webm; codecs="vp9"' />
      </video>
      <div className="lp3-td__scrim" aria-hidden="true" />
      <p className="lp3-td__where" aria-hidden="true"><i />CampusTour AMR · video giới thiệu</p>
      <div className="lp3-td__intro">{renderChapter(chapter)}</div>
      <div className="lp3-story-steps lp3-intro__steps" role="group" aria-label="Các chương của video">
        <ol>
          {STORY_CHAPTERS.map((item, index) => (
            <li key={item.kicker} data-state={index === chapter ? 'on' : index < chapter ? 'done' : 'next'}>
              <button type="button" onClick={() => seek(index)} aria-current={index === chapter ? 'step' : undefined}>{item.kicker}</button>
            </li>
          ))}
        </ol>
      </div>
      {blocked && (
        <button type="button" className="lp3-intro__play" onClick={play}><Play size={22} aria-hidden="true" />Phát video</button>
      )}
      <button type="button" className="lp3-intro__skip" onClick={onDone}>Bỏ qua, xem linh kiện<ChevronRight size={16} aria-hidden="true" /></button>
      <div className="lp3-intro__progress" aria-hidden="true"><span ref={barRef} /></div>
    </div>
  )
}
