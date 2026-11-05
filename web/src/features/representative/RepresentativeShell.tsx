import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Menu, Moon, Sun, UserRound, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { useAuthStore } from '../../stores/auth-store'
import { useThemeStore } from '../../stores/theme-store'
import { useDismiss } from '../../components/ui/use-dismiss'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { PageSkeleton } from './components/RepUi'
import { RepBell } from './RepBell'
import { REP_NAV, repActivePath } from './rep-nav'
import './representative.css'

export default function RepresentativeShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)
  const [meOpen, setMeOpen] = useState(false)
  const meButton = useRef<HTMLButtonElement>(null)
  const closeMe = useCallback(() => setMeOpen(false), [])
  const meRef = useDismiss<HTMLDivElement>(meOpen, closeMe)
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const logout = useLogout()
  const queryClient = useQueryClient()
  useEffect(() => {
    function clearOwner(owner: string | undefined) {
      if (!owner) return
      void queryClient.cancelQueries({ queryKey: repQueryKeys.owner(owner) })
      queryClient.removeQueries({ queryKey: repQueryKeys.owner(owner) })
      void queryClient.cancelQueries({ queryKey: ['registration-invitations', owner] })
      queryClient.removeQueries({ queryKey: ['registration-invitations', owner] })
    }
    const currentOwner = useAuthStore.getState().user?.userId
    queryClient.removeQueries({ predicate: query => query.queryKey[0] === 'representative' && query.queryKey[1] !== currentOwner })
    return useAuthStore.subscribe((state, previous) => {
      if (state.user?.userId !== previous.user?.userId || state.user?.role !== previous.user?.role) clearOwner(previous.user?.userId)
    })
  }, [queryClient])
  useEffect(() => { if (meOpen) meRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [meOpen, meRef])
  const current = repActivePath(location.pathname)
  const name = user?.username || 'Đại diện'
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase()
  const theme = useThemeStore(state => state.theme)
  const toggleTheme = useThemeStore(state => state.toggleTheme)

  return <div className="rep-app">
    <a className="rep-skip" href="#rep-main">Đến nội dung chính</a>
    <header className="rep-nav"><div className="rep-nav-in">
      <Link to="/" className="rep-brand" onClick={() => setMenuOpen(false)} aria-label="CampusTour, về trang chủ" title="Về trang chủ"><img src="/images/logo.png" alt="" width={28} height={28} /><span className="rep-brand-name">CampusTour</span><span className="rep-brand-sub">Đại diện</span></Link>
      <nav ref={navRef} tabIndex={-1} id="rep-navigation" className={`rep-links ${menuOpen ? 'is-open' : ''}`} aria-label="Điều hướng đại diện trường">{REP_NAV.map(({ path, label }) => <Link key={path} to={path} className="rep-link" aria-current={current === path ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{label}</Link>)}</nav>
      <div className="rep-actions"><RepBell /><button type="button" className="rep-icon-btn" onClick={() => toggleTheme()} aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}>{theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</button>
        <div ref={meRef} className="rep-me-wrap"><button ref={meButton} type="button" className="rep-me" aria-haspopup="menu" aria-expanded={meOpen} aria-label={`Tài khoản ${name}`} onClick={() => setMeOpen(open => !open)}><span className="rep-avatar" aria-hidden="true">{initials}</span><span className="rep-me-copy"><strong>{name}</strong><small>Đại diện trường</small></span><ChevronDown size={14} aria-hidden="true" /></button>
          {meOpen && <div className="rep-me-menu" role="menu" aria-label="Tài khoản" onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); closeMe(); meButton.current?.focus(); return }
            const items = [...(meRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
            const index = items.indexOf(document.activeElement as HTMLElement)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus() }
          }}><Link role="menuitem" to="/dai-dien/ho-so" onClick={() => { closeMe(); setMenuOpen(false) }} aria-current={location.pathname.startsWith('/dai-dien/ho-so') ? 'page' : undefined}><UserRound size={16} aria-hidden="true" />Hồ sơ của tôi</Link><button role="menuitem" type="button" className="rep-me-menu-out" onClick={() => { closeMe(); void logout() }}><LogOut size={16} aria-hidden="true" />Đăng xuất</button></div>}
        </div>
        <button type="button" className="rep-icon-btn rep-burger" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-controls="rep-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
      </div>
    </div></header>
    <main id="rep-main" className="rep-main"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
    <footer className="rep-foot"><div className="rep-foot-in"><Link to="/" className="rep-brand" aria-label="CampusTour, về trang chủ"><img src="/images/logo.png" alt="" width={24} height={24} /><span>CampusTour</span></Link><span>Cổng đại diện trường</span><Link to="/dai-dien/buoi">Xem buổi tham quan</Link></div></footer>
  </div>
}
