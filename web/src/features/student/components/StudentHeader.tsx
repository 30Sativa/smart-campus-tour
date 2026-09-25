import { LogOut } from 'lucide-react'
import type { StudentSession } from '../student-types'

interface StudentHeaderProps {
  session: StudentSession | null
  tourName?: string
  isLive?: boolean
  onLeave?: () => void
}

/** The landing page's mark, so every surface opens with the same brand. */
function BrandMark() {
  return <img className="st-brand__mark" src="/images/logo.png" alt="" width={40} height={40} />
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
