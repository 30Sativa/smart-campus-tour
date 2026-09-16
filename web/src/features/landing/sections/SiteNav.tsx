import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Menu, Moon, Sun, X } from 'lucide-react'
import { useAuthStore } from '../../../stores/auth-store'
import { useThemeStore } from '../../../stores/theme-store'
import { useLogout } from '../../../auth/use-logout'
import { isStaffRole } from '../../../auth/roles'
import { navLinks } from '../landing-content'

type Props = {
  /** Pauses smooth scrolling while the mobile sheet is open. */
  onLockScroll: (locked: boolean) => void
}

/**
 * One line at desktop, 68px tall, transparent over the hero footage and
 * frosted once the page has moved. The stuck state comes from an
 * IntersectionObserver sentinel rather than a scroll listener.
 */
export function SiteNav({ onLockScroll }: Props) {
  const [stuck, setStuck] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const logout = useLogout()
  const isStaff = isStaffRole(user?.role)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: '-72px 0px 0px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
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

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" style={{ position: 'absolute', top: 0, height: 1, width: 1 }} />

      <header className="lp-nav" data-stuck={stuck || menuOpen} id="nav">
        <div className="lp-nav__inner">
          <a href="#top" className="lp-brand" onClick={closeMenu}>
            <img className="lp-brand__mark" src="/images/logo-mark.png" alt="" width={34} height={34} />
            <span>CampusTour</span>
            <span className="lp-brand__sub">DT-AMR</span>
          </a>

          <nav className="lp-navlinks" aria-label="Điều hướng chính">
            {navLinks.map((item) => (
              <a key={item.href} href={item.href} className="lp-navlink">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="lp-actions">
            <button
              type="button"
              className="lp-themebtn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            >
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
            </button>

            {isAuthenticated ? (
              <>
                <span className="lp-user">{user?.username}</span>
                {isStaff && (
                  <Link to="/admin" className="lp-btn lp-btn--solid lp-btn--sm">
                    Ops Admin
                  </Link>
                )}
                <button type="button" onClick={logout} className="lp-btn lp-btn--ghost lp-btn--sm">
                  Đăng xuất
                </button>
              </>
            ) : (
              <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--sm">
                Đăng nhập
              </Link>
            )}

            <button
              type="button"
              className="lp-burger"
              aria-expanded={menuOpen}
              aria-controls="lp-mobile-menu"
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="lp-sheet" id="lp-mobile-menu">
          {navLinks.map((item) => (
            <a key={item.href} href={item.href} onClick={closeMenu}>
              {item.label}
            </a>
          ))}
          {isAuthenticated && (
            <button type="button" onClick={logout}>
              Đăng xuất
            </button>
          )}
        </div>
      )}
    </>
  )
}
