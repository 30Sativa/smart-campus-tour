import { Suspense, useCallback, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repQueryKeys } from './representative-hooks'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { useAuthStore } from '../../stores/auth-store'
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

/**
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

        <main id="rep-main" tabIndex={-1} className="rep-app rep-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto focus:outline-none">
          <span key={`sweep-${location.pathname}`} aria-hidden="true" className="console-sweep pointer-events-none fixed top-0 right-0 left-0 z-[70] h-0.5 bg-[#2d719e]" />
          <div key={location.pathname} className="console-enter min-h-full">
            <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
