import { Suspense, useEffect, useState } from 'react'
import { LogOut, Menu, Search, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { useAuthStore } from '../../stores/auth-store'
import { PageSkeleton } from './components/RepUi'
import { REP_NAV, repActivePath } from './rep-nav'
import './representative.css'

/** The representative has a small three-destination workspace. */
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
  const initials = name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase()

  return (
    <div className="rep-app min-h-[100dvh]">
      <div className="rep-demo-ribbon">CAMPUS TOUR · CỔNG ĐẠI DIỆN TRƯỜNG</div>
      <header className="rep-site-header">
        <div className="rep-site-header-inner">
          <Link to="/dai-dien" className="rep-brand" onClick={() => setMenuOpen(false)} aria-label="CampusTour - Tổng quan đại diện">
            <span className="rep-brand-mark" aria-hidden="true">✺</span>
            <span><strong>CampusTour</strong><small>DT–AMR · Cổng đại diện</small></span>
          </Link>
          <nav id="rep-navigation" className={`rep-site-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Điều hướng đại diện trường">
            {REP_NAV.map(({ path, label, icon: Icon }) => (
              <Link key={path} to={path} className="rep-nav-link" aria-current={current === path ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                <Icon size={16} aria-hidden="true" />{label}
              </Link>
            ))}
            <button type="button" className="rep-mobile-logout" onClick={() => void logout()}><LogOut size={16} aria-hidden="true" />Đăng xuất</button>
          </nav>
          <div className="rep-header-actions">
            <Link to="/dai-dien/buoi" className="rep-help-link"><Search size={15} aria-hidden="true" /> Tìm buổi</Link>
            <div className="rep-profile" title={'Đại diện trường'}>
              <span className="rep-avatar">{initials}</span>
              <span className="rep-profile-copy"><strong>{name}</strong><small>{'Đại diện trường'}</small></span>
            </div>
            <button type="button" className="rep-logout" onClick={() => void logout()} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18} aria-hidden="true" /></button>
            <button type="button" className="rep-menu-toggle" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-controls="rep-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      {menuOpen && <button type="button" className="rep-menu-scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
      <main id="rep-main" className="rep-main"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
    </div>
  )
}
