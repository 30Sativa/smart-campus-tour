import { LogOut, Moon, Sun } from 'lucide-react'
import { useThemeStore } from '../../../stores/theme-store'
import { USE_MOCK_API } from '../../../mocks/mock-mode'
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
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const themeButton = (
    <button type="button" className="st-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'} title={theme === 'dark' ? 'Nền sáng' : 'Nền tối'}>
      {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  )
  return (
    <header className="st-header">
      <div className="st-ctn st-header__inner">
        <div className="st-brand">
          <BrandMark />
          <div style={{ minWidth: 0 }}>
            <div className="st-brand__top">
              <span className="st-brand__name">CampusTour</span>
              {isLive && (
                <span className="st-live"><i />{USE_MOCK_API ? 'PHIÊN MẪU' : 'LIVE'}</span>
              )}
            </div>
            <h1 className="st-brand__title">{tourName}</h1>
          </div>
        </div>

        {session ? (
          <div className="st-user">
            {themeButton}
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
          <div className="st-user">
            {themeButton}
            <div className="st-portal"><i />Cổng tham quan học sinh</div>
          </div>
        )}
      </div>
    </header>
  )
}
