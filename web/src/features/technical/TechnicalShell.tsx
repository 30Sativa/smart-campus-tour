import { useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { RouteView } from '../../components/ui/RouteView'
import { softConsoleGround, softConsoleMain } from '../../components/ui/ui-classes'
import { useConsoleDrawer } from '../../components/ui/use-mobile-nav'
import { useCurrentPageTitle } from '../../components/ui/use-page-title'
import { MobileNavScrim } from '../../components/ui/ConsoleSidebar'
import { ConsoleAccountMenu, ConsoleHeader } from '../../components/ui/ConsoleHeader'
import { consoleCrumbs } from '../../components/ui/console-crumbs'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { TECHNICAL_NAV, TECHNICAL_NAV_ENTRIES, TECHNICAL_NAV_SECTIONS, technicalActivePath } from './technical-nav'
import { TechnicalBell } from './TechnicalBell'

/**
 * The Technical Staff shell: the same sidebar and header as the other consoles.
 * Its bell lists the work the Dashboard already reads; it has no live connection,
 * so the header shows no connection status.
 */
export default function TechnicalShell() {
  const drawer = useConsoleDrawer()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const pageTitle = useCurrentPageTitle()
  const current = technicalActivePath(location.pathname)
  const onProfile = location.pathname.startsWith('/technical/profile')
  const entry = onProfile ? null : TECHNICAL_NAV.find(({ path }) => path === current)?.label ?? null
  const section = onProfile ? 'Tài khoản' : TECHNICAL_NAV_SECTIONS.find(({ items }) => items.some(({ path }) => path === current))?.label ?? 'Kỹ thuật'
  const crumbs = consoleCrumbs({ section, entry, page: pageTitle ?? (onProfile ? 'Hồ sơ của tôi' : null) })

  return (
    <div className={`flex h-[100dvh] overflow-hidden ${softConsoleGround}`}>
      <MobileNavScrim open={drawer.open} label="Đóng điều hướng kỹ thuật" onClose={drawer.close} />
      <GroupedSidebar
        id="technical-navigation"
        look="soft"
        label="Khu vực kỹ thuật"
        navLabel="Điều hướng kỹ thuật"
        homePath="/technical"
        subtitle="DT-AMR · Kỹ thuật"
        entries={TECHNICAL_NAV_ENTRIES}
        currentPath={current}
        onNavigate={drawer.close}
        onLogout={handleLogout}
        open={drawer.open}
        panelRef={drawer.panelRef}
        closeRef={drawer.closeButtonRef}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ConsoleHeader crumbs={crumbs} menuOpen={drawer.open} menuControls="technical-navigation" menuLabel="Mở điều hướng kỹ thuật" onMenu={drawer.openDrawer} menuButtonRef={drawer.menuButtonRef}>
          <TechnicalBell />
          <ConsoleAccountMenu name={user?.username || 'Nhân viên kỹ thuật'} role={roleLabel(user?.role)} profilePath="/technical/profile" profileCurrent={onProfile} onLogout={handleLogout} onNavigate={drawer.close} />
        </ConsoleHeader>
        <main className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${softConsoleMain}`}><RouteView /></main>
      </div>
    </div>
  )
}
