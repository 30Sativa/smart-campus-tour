import { LogOut } from 'lucide-react'
import type { StudentSession } from '../student-types'

interface StudentHeaderProps {
  session: StudentSession | null
  tourName?: string
  isLive?: boolean
  onLeave?: () => void
}

/** Same lime robot mark as the public home page header. */
function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#bde74e" />
      <rect x="7" y="10" width="18" height="12" rx="4" fill="#1c1c1c" />
      <circle cx="12.5" cy="16" r="2" fill="#bde74e" />
      <circle cx="19.5" cy="16" r="2" fill="#bde74e" />
      <path d="M16 10V6.5" stroke="#1c1c1c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5.5" r="1.8" fill="#1c1c1c" />
    </svg>
  )
}

export function StudentHeader({
  session,
  tourName = 'Tham quan Campus từ xa',
  isLive = false,
  onLeave,
}: StudentHeaderProps) {
  return (
    <header className="st-header">
      <div className="st-ctn st-header__inner">
        <div className="st-brand">
          <BrandMark />
          <div style={{ minWidth: 0 }}>
            <div className="st-brand__top">
              <span className="st-brand__name">CampusTour</span>
              {isLive && (
                <span className="st-live"><i />LIVE</span>
              )}
            </div>
            <h1 className="st-brand__title">{tourName}</h1>
          </div>
        </div>

        {session ? (
          <div className="st-user">
            <div className="st-user__text">
              <p className="st-user__name">{session.studentName}</p>
              <p className="st-user__meta">
                {session.studentClass ? `Lớp ${session.studentClass} • ` : ''}Đoàn {session.groupCode}
              </p>
            </div>
            <div className="st-avatar" aria-hidden="true">{session.studentName.trim().charAt(0)}</div>
            {onLeave && (
              <button type="button" onClick={onLeave} title="Thoát phiên tham quan" className="st-leave">
                <LogOut size={14} />
                <span>Thoát</span>
              </button>
            )}
          </div>
        ) : (
          <div className="st-portal"><i />Cổng tham quan học sinh</div>
        )}
      </div>
    </header>
  )
}
