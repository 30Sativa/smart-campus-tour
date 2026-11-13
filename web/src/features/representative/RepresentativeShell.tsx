import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Menu, UserRound, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'

import { Suspense, useCallback, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { useAuthStore } from '../../stores/auth-store'
import { useDismiss } from '../../components/ui/use-dismiss'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { softConsoleGround, softConsoleHeader } from '../../components/ui/ui-classes'
import { PageSkeleton } from './components/RepUi'
import { RepBell } from './RepBell'
import { REP_NAV, repActivePath } from './rep-nav'

import { useConsoleDrawer } from '../../components/ui/use-mobile-nav'
import { useCurrentPageTitle } from '../../components/ui/use-page-title'
import { MobileNavScrim } from '../../components/ui/ConsoleSidebar'
import { ConsoleAccountMenu, ConsoleHeader } from '../../components/ui/ConsoleHeader'
import { consoleCrumbs } from '../../components/ui/console-crumbs'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { softConsoleGround } from '../../components/ui/ui-classes'
import { PageSkeleton } from './components/RepUi'
import { RepBell } from './RepBell'
import { REP_NAV, REP_NAV_ENTRIES, repActivePath, repPageTitle } from './rep-nav'
import './representative.css'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]'

/**
 * The Representative shell: the navigation stays across the top, drawn in the
 * Staff console's language - the floating frosted header card, the CampusTour
 * logo tile, page links with a 30px icon tile whose active page lifts onto a
 * tinted row, then the bell and the account menu (profile, sign-out). Below
 * `lg` the links fold into a menu under the header. The pages inside keep the
 * Representative layout (`rep-*` classes) on the console palette.
 */
export default function RepresentativeShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)

 * The Representative shell, in the shared console chrome: the soft grouped
 * sidebar (logo, pages, fold to a rail, sign-out) and the shared console header
 * with the breadcrumb, the bell and the account. The pages inside keep their own
 * Representative layout (`rep-*` classes), on the console palette: a primary
 * `rep-btn--primary` is the same console blue as `buttonClass('primary')`.
 */
export default function RepresentativeShell() {
  const drawer = useConsoleDrawer()
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const logout = useLogout()
  const handleLogout = useCallback(() => { void logout() }, [logout])
  const pageTitle = useCurrentPageTitle()
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

  const current = repActivePath(location.pathname)

  return (
    <div className={`min-h-[100dvh] ${softConsoleGround}`}>
      <a href="#rep-main" className={`sr-only z-[80] rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 ${focusRing}`}>Đến nội dung chính</a>

      {/* The Staff console's floating, frosted header card, holding the navigation. */}
      <header className="sticky top-0 z-30 px-4 pt-3 sm:px-6 lg:px-8">
        <div className={`relative mx-auto max-w-[1440px] ${softConsoleHeader}`}>
          <Link to="/dai-dien" onClick={closeMenu} aria-label="CampusTour, về trang tổng quan" className={`group flex shrink-0 items-center gap-3 rounded-xl ${focusRing}`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white shadow-[0_0_0_1px_#e5e7eb,0_6px_14px_-8px_rgba(17,24,39,0.35)] transition-transform duration-500 group-hover:-rotate-6 motion-reduce:transition-none">
              <img src="/images/logo.png" alt="" width={25} height={25} className="size-[25px] object-contain" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-bold tracking-[-0.03em] text-[#0f172a]">CampusTour</span>
              <span className="block truncate text-[10.5px] font-semibold tracking-[0.04em] text-[#9ca3af]">DT-AMR · Đại diện</span>
            </span>
          </Link>
          <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-[#e2e8f0] lg:block" />

          <nav
            ref={navRef}
            id="rep-navigation"
            tabIndex={-1}
            aria-label="Điều hướng đại diện trường"
            className={`${menuOpen ? 'flex' : 'hidden'} absolute top-[calc(100%+8px)] right-0 left-0 z-40 flex-col gap-1 rounded-[15px] border border-white/80 bg-white p-2 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)] focus-visible:outline-none lg:static lg:z-auto lg:flex lg:flex-row lg:items-center lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
          >
            {REP_NAV.map(({ path, label, icon: Icon }) => {
              const active = current === path
              return (
                <Link key={path} to={path} onClick={closeMenu} aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] items-center gap-2.5 rounded-[12px] pr-3 pl-2 text-[14px] whitespace-nowrap transition-[background-color,box-shadow,color] duration-200 lg:min-h-10 ${focusRing} ${active ? 'bg-[#eef2f7] font-semibold text-[#1e293b] ring-1 ring-white/70' : 'font-medium text-[#334155] hover:bg-[#f4f7fb] hover:text-[#0f172a]'}`}>
                  <span aria-hidden="true" className={`grid size-[30px] shrink-0 place-items-center rounded-xl transition-colors duration-200 ${active ? 'bg-white text-[#5b7fbf] shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'bg-[#f1f5f9] text-[#64748b]'}`}><Icon size={15} strokeWidth={2.1} /></span>
                  {label}
                </Link>
              )
            })}
          </nav>

  const { section, parent, title } = repPageTitle(location.pathname)
  const entry = parent ?? REP_NAV.find((item) => item.path === current)?.label ?? null
  const crumbs = consoleCrumbs({ section, entry, page: pageTitle ?? title })

  return (
    <div className={`flex h-[100dvh] overflow-hidden ${softConsoleGround}`}>
      <a href="#rep-main" className="sr-only z-[80] rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">Đến nội dung chính</a>
      <MobileNavScrim open={drawer.open} label="Đóng điều hướng đại diện" onClose={drawer.close} />

      <GroupedSidebar
        id="rep-navigation"
        look="soft"
        label="Khu vực đại diện trường"
        navLabel="Điều hướng đại diện trường"
        homePath="/dai-dien"
        subtitle="DT-AMR · Đại diện trường"
        entries={REP_NAV_ENTRIES}
        currentPath={current}
        onNavigate={drawer.close}
        onLogout={handleLogout}
        open={drawer.open}
        panelRef={drawer.panelRef}
        closeRef={drawer.closeButtonRef}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ConsoleHeader crumbs={crumbs} menuOpen={drawer.open} menuControls="rep-navigation" menuLabel="Mở điều hướng đại diện" onMenu={drawer.openDrawer} menuButtonRef={drawer.menuButtonRef}>
          <RepBell />
          <ConsoleAccountMenu name={user?.username || 'Đại diện'} role={roleLabel(user?.role ?? 'Representative')} profilePath="/dai-dien/ho-so" profileCurrent={location.pathname.startsWith('/dai-dien/ho-so')} onLogout={handleLogout} onNavigate={drawer.close} />
        </ConsoleHeader>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <RepBell />
            <AccountMenu username={user?.username} onLogout={handleLogout} onNavigate={closeMenu} profileCurrent={location.pathname.startsWith('/dai-dien/ho-so')} />
            <button type="button" onClick={() => setMenuOpen(open => !open)} aria-controls="rep-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
              className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors lg:hidden ${focusRing} ${menuOpen ? 'bg-[#eceef1] text-[#374151]' : 'text-[#6b7280] hover:bg-[#eceef1] hover:text-[#374151]'}`}>
              {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main id="rep-main" tabIndex={-1} className="rep-app rep-main focus:outline-none">
        <span key={`sweep-${location.pathname}`} aria-hidden="true" className="console-sweep pointer-events-none fixed top-0 right-0 left-0 z-[70] h-0.5 bg-[#2d719e]" />
        <div key={location.pathname} className="console-enter">
          <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
        </div>
      </main>
        </main>
      </div>
    </div>
  )
}
