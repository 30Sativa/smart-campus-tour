import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuthStore } from '../../../../stores/auth-store'
import { useLogout } from '../../../../auth/use-logout'
import { homePathForRole, isAdminRole, isRepresentativeRole, isStaffRole } from '../../../../auth/roles'
import { homeNavLinks } from '../home-content'

type Props = {
  /** Pauses smooth scrolling while the mobile sheet is open. */
  onLockScroll: (locked: boolean) => void
}

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

/**
 * Transparent over the hero, frosted white once the hero has scrolled away,
 * tucked up while scrolling down and back on the way up. The account actions
 * are role-aware: a signed-in staff member or admin gets the door to their own
 * area instead of "Đăng nhập".
 */
export function HomeNav({ onLockScroll }: Props) {
  const [solid, setSolid] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const isStaff = isStaffRole(user?.role) || isRepresentativeRole(user?.role)
  const areaLabel = isAdminRole(user?.role) ? 'Quản trị' : isRepresentativeRole(user?.role) ? 'Đại diện' : 'Điều hành'

  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const hero = document.getElementById('hero')
      setSolid(y > (hero ? hero.offsetHeight - 80 : 200))
      setHidden(y > lastY && y > 600)
      lastY = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    onLockScroll(menuOpen)
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, onLockScroll])

  const closeMenu = () => setMenuOpen(false)

  const accountActions = (inSheet: boolean) =>
    isAuthenticated ? (
      <>
        {isStaff && (
          <Link to={homePathForRole(user?.role)} className="hm-nav__btn hm-nav__btn--solid" onClick={closeMenu}>
            {areaLabel}
          </Link>
        )}
        <button type="button" className="hm-nav__btn" onClick={() => { closeMenu(); logout() }}>
          Đăng xuất
        </button>
      </>
    ) : (
      <Link to="/login" className={inSheet ? 'hm-nav__btn hm-nav__btn--solid' : 'hm-nav__btn'} onClick={closeMenu}>
        Đăng nhập
      </Link>
    )

  return (
    <>
      <header
        className="hm-nav"
        data-solid={solid && !menuOpen}
        data-hidden={hidden && !menuOpen}
        data-open={menuOpen}
      >
        <div className="hm-ctn hm-nav__inner">
          <a href="#top" className="hm-logo" onClick={closeMenu}>
            <BrandMark />
            CampusTour<small>DT-AMR</small>
          </a>

          <nav className="hm-nav__links" aria-label="Điều hướng chính">
            {homeNavLinks.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </nav>

          <div className="hm-nav__actions">
            {isAuthenticated && <span className="hm-nav__user">{user?.username}</span>}
            {accountActions(false)}
          </div>

          <button
            type="button"
            className="hm-burger"
            aria-expanded={menuOpen}
            aria-controls="hm-mobile-menu"
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i /><i />
          </button>
        </div>
      </header>

      <div className="hm-sheet" id="hm-mobile-menu" data-open={menuOpen} aria-hidden={!menuOpen} inert={!menuOpen}>
        <nav aria-label="Menu di động">
          {homeNavLinks.map((item) => (
            <a key={item.href} href={item.href} onClick={closeMenu}>{item.label}</a>
          ))}
        </nav>
        <div className="hm-sheet__actions">{accountActions(true)}</div>
      </div>
    </>
  )
}
