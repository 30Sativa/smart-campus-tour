import { Suspense } from 'react'
import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useLogout } from '../../auth/use-logout'
import { MOCK_MODE_LABEL } from '../../mocks/mock-mode'
import { useAuthStore } from '../../stores/auth-store'
import { currentRepresentativeProfile } from '../../mocks/representative-mock'
import { Loading } from './components/RepUi'
import '../landing/landing.css'
import './representative.css'

/** The landing page's mark, so every surface opens with the same brand. */
function BrandMark() {
  return <img className="rp-brand__mark" src="/images/logo.png" alt="" width={40} height={40} />
}

/**
 * The school representative's area (screen flow review §4): the Tours open
 * for registration and the representative's own registrations. Same visual
 * language as the public home page.
 */
export default function RepresentativeShell() {
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const profile = currentRepresentativeProfile()
  const displayName = profile.representativeName || user?.username || 'Đại diện'

  return (
    <div className="lp rp">
      <header className="rp-header">
        <div className="rp-ctn rp-header__inner">
          <NavLink to="/dai-dien" end className="rp-brand" aria-label="CampusTour, trang đại diện trường">
            <BrandMark />
            CampusTour
            <small>Đại diện</small>
          </NavLink>
          <nav className="rp-nav" aria-label="Khu vực đại diện">
            <NavLink to="/dai-dien" end>Buổi tham quan</NavLink>
            <NavLink to="/dai-dien/dang-ky">Đăng ký của tôi</NavLink>
          </nav>
          <div className="rp-account">
            <div className="rp-account__who">
              <b>{displayName}</b>
              <span>{profile.schoolName || 'Đại diện trường'}</span>
            </div>
            <span className="rp-avatar" aria-hidden="true">{displayName.replace(/^(Cô|Thầy)\s+/, '').trim().split(/\s+/).pop()?.charAt(0) ?? 'Đ'}</span>
            <button type="button" className="rp-chip-btn" onClick={() => void logout()}>
              <LogOut size={14} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>
      <div className="rp-mockbar"><b>●</b> {MOCK_MODE_LABEL}. Đăng ký, duyệt và email đều mô phỏng, không lưu sau khi tải lại trang.</div>
      <main className="rp-main">
        <Suspense fallback={<div className="rp-ctn"><Loading /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
