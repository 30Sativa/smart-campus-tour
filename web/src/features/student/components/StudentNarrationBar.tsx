import { Info, Volume2 } from 'lucide-react'
import { useStudentStore } from '../student-store'

interface StudentNarrationBarProps {
  title?: string
  text?: string
  isPlaying?: boolean
  onReplay?: () => void
}

export function StudentNarrationBar({
  title = 'Điểm dừng tham quan',
  text,
  isPlaying = false,
  onReplay,
}: StudentNarrationBarProps) {
  const isAiSpeaking = useStudentStore((s) => s.isAiSpeaking)

  if (!text) {
    return (
      <div className="st-narr st-narr--idle">
        <Info size={18} />
        <span>Robot đang di chuyển giữa các điểm dừng. Thuyết minh tự động sẽ phát khi tới POI tiếp theo.</span>
      </div>
    )
  }

  return (
    <div className="st-narr">
      <div className="st-narr__body">
        <span className={isPlaying ? 'st-narr__ic is-playing' : 'st-narr__ic'} aria-hidden="true">
          <Volume2 size={18} />
        </span>
        <div>
          <div className="st-narr__label">
            <span>Thuyết minh điểm dừng</span>
            {isAiSpeaking && <span className="st-narr__duck">Âm lượng nền đang hạ thấp</span>}
          </div>
          <h4>{title}</h4>
          <p>{text}</p>
        </div>
      </div>

      {onReplay && (
        <button type="button" onClick={onReplay} className="st-chip-btn">
          Nghe lại
        </button>
      )}
    </div>
  )
}
