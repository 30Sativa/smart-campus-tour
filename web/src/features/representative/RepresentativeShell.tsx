import { Suspense, useEffect, useState } from 'react'
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { useAuthStore } from '../../stores/auth-store'
import { useThemeStore } from '../../stores/theme-store'
import { PageSkeleton } from './components/RepUi'
import { REP_NAV, repActivePath } from './rep-nav'
import './representative.css'

/**
 * The representative's workspace: three destinations under the public Home's
 * header (robot logo, underlined links, theme switch), and its footer.
 */
export default function RepresentativeShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const queryClient = useQueryClient()
  useEffect(() => {
    function clearOwner(owner: string | undefined) {
      if (!owner) return
      void queryClient.cancelQueries({ queryKey: repQueryKeys.owner(owner) })
      queryClient.removeQueries({ queryKey: repQueryKeys.owner(owner) })
    }
    const currentOwner = useAuthStore.getState().user?.userId
    queryClient.removeQueries({ predicate: query => query.queryKey[0] === 'representative' && query.queryKey[1] !== currentOwner })
    return useAuthStore.subscribe((state, previous) => {
      if (state.user?.userId !== previous.user?.userId || state.user?.role !== previous.user?.role)
        clearOwner(previous.user?.userId)
    })
  }, [queryClient])
  const current = repActivePath(location.pathname)
  const name = user?.username || 'Đại diện'
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  // The landing's circular reveal from the theme button, where the browser supports it.
  const switchTheme = (button: HTMLButtonElement) => {
    if (typeof document.startViewTransition !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      toggleTheme()
      return
    }
    const box = button.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const root = document.documentElement
    root.style.setProperty('--rep-wave-x', `${x}px`)
    root.style.setProperty('--rep-wave-y', `${y}px`)
    root.style.setProperty('--rep-wave-r', `${Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))}px`)
    root.dataset.repWave = ''
    const transition = document.startViewTransition(() => {
      root.classList.remove('light', 'dark')
      root.classList.add(theme === 'dark' ? 'light' : 'dark')
      toggleTheme()
    })
    const cleanup = () => { delete root.dataset.repWave }
    void transition.finished.then(cleanup, cleanup)
  }

  return (
    <div className="rep-app">
      <header className="rep-nav">
        <div className="rep-nav-in">
          <Link to="/dai-dien" className="rep-brand" onClick={() => setMenuOpen(false)} aria-label="CampusTour - Tổng quan đại diện">
            <img src="/images/logo.png" alt="" width={46} height={46} />
            <span className="rep-brand-lock"><span className="rep-brand-name">CampusTour</span><span className="rep-brand-rule" aria-hidden="true" /><span className="rep-brand-sub">ĐẠI DIỆN</span></span>
          </Link>
          <nav id="rep-navigation" className={`rep-links ${menuOpen ? 'is-open' : ''}`} aria-label="Điều hướng đại diện trường">
            {REP_NAV.map(({ path, label }) => (
              <Link key={path} to={path} className="rep-link" aria-current={current === path ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{label}</Link>
            ))}
            <button type="button" className="rep-sheet-logout" onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />Đăng xuất</button>
          </nav>
          <div className="rep-actions">
            <button type="button" className="rep-icon-btn" onClick={(event) => switchTheme(event.currentTarget)} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>
              {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} aria-hidden="true" /> : <Moon size={18} strokeWidth={1.8} aria-hidden="true" />}
            </button>
            <div className="rep-me" title="Đại diện trường">
              <span className="rep-avatar" aria-hidden="true">{initials}</span>
              <span className="rep-me-copy"><strong>{name}</strong><small>Đại diện trường</small></span>
            </div>
            <button type="button" className="rep-icon-btn rep-logout" onClick={() => void logout()} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18} aria-hidden="true" /></button>
            <button type="button" className="rep-icon-btn rep-burger" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-controls="rep-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      {menuOpen && <button type="button" className="rep-scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
      <main id="rep-main" className="rep-main"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      <footer className="rep-foot">
        <div className="rep-foot-in">
          <span className="rep-brand"><img src="/images/logo.png" alt="" width={40} height={40} /><span className="rep-brand-lock"><span className="rep-brand-name">CampusTour</span><span className="rep-brand-rule" aria-hidden="true" /><span className="rep-brand-sub">DT-AMR</span></span></span>
          <nav aria-label="Liên kết cuối trang">{REP_NAV.map(({ path, label }) => <Link key={path} to={path}>{label}</Link>)}</nav>
          <span className="rep-foot-tag">CÔNG NGHỆ KẾT NỐI CON NGƯỜI VỚI NHỮNG CHÂN TRỜI MỚI</span>
        </div>
      </footer>
    </div>
  )
}
