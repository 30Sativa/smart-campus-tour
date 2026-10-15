import { Info, Volume2 } from 'lucide-react'
import { useStudentStore } from '../student-store'

interface StudentNarrationBarProps {
  title?: string
  text?: string
  isPlaying?: boolean
  onReplay?: () => void
  /** Shown when there is no narration for the moment. */
  idleText?: string
}

export function StudentNarrationBar({
  title = 'Điểm dừng tham quan',
  text,
  isPlaying = false,
  onReplay,
  idleText = 'Robot đang di chuyển giữa các điểm dừng. Thuyết minh tự động sẽ phát khi tới POI tiếp theo.',
}: StudentNarrationBarProps) {
  const isAiSpeaking = useStudentStore((s) => s.isAiSpeaking)

  if (!text) {
    return (
      <div className="st-narr st-narr--idle">
        <Info size={18} />
        <span>{idleText}</span>
      </div>
    )
  }

  return (
    <div className="st-narr st-x-narr">
      <div className="st-narr__label">
        <span>Thuyết minh điểm dừng</span>
        {isAiSpeaking && <span className="st-narr__duck">Âm lượng nền đang hạ thấp</span>}
      </div>
      <h4>{title}</h4>

      <div className="st-x-player">
        <span className={isPlaying ? 'st-narr__ic is-playing' : 'st-narr__ic'} aria-hidden="true">
          <Volume2 size={18} />
        </span>
        <span className={isPlaying ? 'st-x-wave st-x-wave--long' : 'st-x-wave st-x-wave--long is-idle'} aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
        </span>
        <span className="st-x-player__state">{isPlaying ? 'Đang phát' : 'Đã phát'}</span>
      </div>

      {isPlaying ? (
        // Words light up one after another while the narration plays (decorative pacing, not audio sync).
        <p key={text} className="st-x-words">
          {text.split(' ').map((word, index) => (
            <span key={index} style={{ ['--i' as string]: index }}>{word} </span>
          ))}
        </p>
      ) : (
        <p>{text}</p>
      )}

      {onReplay && (
        <button type="button" onClick={onReplay} className="st-chip-btn">
          Nghe lại
        </button>
      )}
    </div>
  )
}
