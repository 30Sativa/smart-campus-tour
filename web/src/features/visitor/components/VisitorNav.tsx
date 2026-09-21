import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Bell, LogOut, Menu, Moon, Sun, X } from 'lucide-react'
import { useAuthStore } from '../../../stores/auth-store'
import { useThemeStore } from '../../../stores/theme-store'
import { useLogout } from '../../../auth/use-logout'
import { VISITOR_NAV, VISITOR_SECONDARY_NAV } from '../visitor-content'
import { useNotifications, useVisitorProfile } from '../visitor-hooks'
import { initials } from '../visitor-format'

/**
 * The signed-in visitor's header.
 *
 * It is the landing page's header, not a dashboard sidebar. Same 68px bar, same
 * container width and gutter, same brand lockup with the same logo file, same
 * inline link row, same pill buttons and the same theme control — those are all
 * landing.css classes (`.lp-nav__inner`, `.lp-brand`, `.lp-navlink`,
 * `.lp-actions`, `.lp-themebtn`, `.lp-burger`), reused rather than re-cut. The
 * only structural change is that it is sticky with a permanent ground instead of
 * fixed over hero footage, which is what `.vs-nav` adds.
 *
 * A sidebar would have been the obvious dashboard shape and the wrong one: the
 * visitor came from the landing page and is still on the same product.
 */
export function VisitorNav() {
  const accountRef = useRef<HTMLDivElement>(null)
  const accountButton = useRef<HTMLButtonElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()

  /**
   * Which panel is open, and the route it was opened on.
   *
   * Storing the route with it is what closes both panels on navigation without
   * an effect that mirrors the location into state: a panel opened on another
   * page is simply not open on this one. Only one can be open at a time, which
   * is also the behaviour you want from a sheet and a menu that overlap.
   */
  const [panel, setPanel] = useState<{ id: 'menu' | 'account'; at: string } | null>(null)
  const open = panel?.at === pathname ? panel.id : null
  const menuOpen = open === 'menu'
  const accountOpen = open === 'account'

  const toggle = (id: 'menu' | 'account') => setPanel((current) => (current?.id === id && current.at === pathname ? null : { id, at: pathname }))
  const close = () => setPanel(null)

  const user = useAuthStore((state) => state.user)
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const logout = useLogout()

  const { data: profile } = useVisitorProfile()
  const { data: notifications } = useNotifications()
  const unread = notifications?.filter((item) => !item.readAt).length ?? 0

  const displayName = user?.username ?? profile?.fullName ?? 'Representative'

  useEffect(() => {
    if (!accountOpen) return
    const onPointer = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); accountButton.current?.focus() }
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [accountOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); menuButton.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="vs-nav">
      <div className="lp-nav__inner">
        <Link to="/visit" className="lp-brand" aria-label="CampusTour home">
          <img className="lp-brand__mark" src="/images/logo.png" alt="" width={56} height={56} />
          <span>CampusTour</span>
          <span className="lp-brand__sub">DT-AMR</span>
        </Link>

        <nav className="lp-navlinks" aria-label="Visitor navigation">
          {VISITOR_NAV.map((item) => (
            <NavLink key={item.path} to={item.path} end={item.end} className="lp-navlink">
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="lp-actions">
          <button
            type="button"
            className="lp-themebtn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          >
            {theme === 'dark' ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
          </button>

          <Link
            to="/visit/notifications"
            className="vs-iconbtn"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
            {unread > 0 && <span className="vs-dot" aria-hidden="true" />}
          </Link>

          <div className="vs-account" ref={accountRef}>
            <button
              type="button"
              ref={accountButton}
              className="vs-avatar"
              onClick={() => toggle('account')}
              aria-expanded={accountOpen}
              aria-controls="visitor-account-links"
              aria-label="Account menu"
            >
              {initials(displayName)}
            </button>

            {accountOpen && (
              <div className="vs-menu" id="visitor-account-links" aria-label="Account links">
                <div className="vs-menu__head">
                  <p className="vs-menu__name">{displayName}</p>
                  <p className="vs-menu__role">Your CampusTour account</p>
                </div>
                {VISITOR_SECONDARY_NAV.map(({ label, path, icon: Icon }) => (
                  <Link key={path} to={path} onClick={close}>
                    <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                    {label}
                  </Link>
                ))}
                <button type="button" onClick={logout}>
                  <LogOut size={16} strokeWidth={1.9} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="lp-burger"
            ref={menuButton}
            aria-expanded={menuOpen}
            aria-controls="vs-mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => toggle('menu')}
          >
            {menuOpen ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="vs-sheet" id="vs-mobile-menu" aria-label="Mobile visitor navigation">
          {[...VISITOR_NAV, ...VISITOR_SECONDARY_NAV].map(({ label, path, icon: Icon, end }) => (
            <NavLink key={path} to={path} end={end} onClick={close}>
              <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <button type="button" onClick={logout}>
            <LogOut size={17} strokeWidth={1.9} aria-hidden="true" />
            Sign out
          </button>
        </nav>
      )}
    </header>
  )
}
