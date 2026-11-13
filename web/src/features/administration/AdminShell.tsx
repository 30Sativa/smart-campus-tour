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
import { ADMIN_NAV, ADMIN_NAV_SECTIONS, adminActivePath } from './admin-nav'
import { AdminSidebar } from './AdminSidebar'

/**
 * The administration shell: accounts, roles, configuration and audit.
 *
 * The shared grouped sidebar and the shared console header. Administration has
 * no live connection and no notices of its own, so its header shows neither a
 * connection status nor a bell: only the breadcrumb and the account.
 */
export default function AdminShell() {
  const drawer = useConsoleDrawer()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const pageTitle = useCurrentPageTitle()

  const current = adminActivePath(location.pathname)
  const onProfile = location.pathname.startsWith('/admin/profile')
  const entry = onProfile ? null : ADMIN_NAV.find(({ path }) => path === current)?.label ?? null
  const section = onProfile ? 'Tài khoản' : ADMIN_NAV_SECTIONS.find(({ items }) => items.some(({ path }) => path === current))?.label ?? 'Quản trị'
  const crumbs = consoleCrumbs({ section, entry, page: pageTitle ?? (onProfile ? 'Hồ sơ của tôi' : null) })

  return (
    <div className={`flex h-[100dvh] overflow-hidden ${softConsoleGround}`}>
      <MobileNavScrim open={drawer.open} label="Đóng điều hướng quản trị" onClose={drawer.close} />

      <AdminSidebar
        id="admin-navigation"
        currentPath={current}
        onNavigate={drawer.close}
        onLogout={handleLogout}
        open={drawer.open}
        panelRef={drawer.panelRef}
        closeRef={drawer.closeButtonRef}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ConsoleHeader crumbs={crumbs} menuOpen={drawer.open} menuControls="admin-navigation" menuLabel="Mở điều hướng quản trị" onMenu={drawer.openDrawer} menuButtonRef={drawer.menuButtonRef}>
          <ConsoleAccountMenu name={user?.username || 'Quản trị viên'} role={roleLabel(user?.role)} profilePath="/admin/profile" profileCurrent={onProfile} onLogout={handleLogout} onNavigate={drawer.close} />
        </ConsoleHeader>

        <main className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto ${softConsoleMain}`}><RouteView /></main>
      </div>
    </div>
  )
}
