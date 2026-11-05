import { useCallback, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { RouteView } from '../../components/ui/RouteView'
import { softConsoleGround, softConsoleHeader, softConsoleMain } from '../../components/ui/ui-classes'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { MobileNavToggle } from '../../components/ui/ConsoleSidebar'
import { ADMIN_NAV, adminActivePath } from './admin-nav'
import { AdminHeaderActions } from './AdminHeaderActions'
import { AdminSidebar } from './AdminSidebar'

/**
 * The administration shell: preparing Tours before they run.
 *
 * Its own sidebar (logo, folding groups) and a quiet header with the bell and
 * the account at the top right. The bell and the "Chờ duyệt" badge are where
 * Admin learns of waiting work; the dashboard no longer repeats a task list.
 */
export default function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)

  const current = adminActivePath(location.pathname)
  const title = ADMIN_NAV.find(({ path }) => path === current)?.label ?? 'Quản trị hệ thống'

  return (
    <div className={`flex h-[100dvh] overflow-hidden ${softConsoleGround}`}>
      <MobileNavToggle open={menuOpen} controls="admin-navigation" label="Mở điều hướng quản trị" closeLabel="Đóng điều hướng quản trị" onOpen={() => setMenuOpen(true)} onClose={closeMenu} />

      <AdminSidebar
        id="admin-navigation"
        currentPath={current}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* The same frosted header card as the Staff console: breadcrumb above the page name. */}
        <header className="sticky top-0 z-20 shrink-0 px-4 pt-3 sm:px-6 lg:px-8">
          <div className={softConsoleHeader}>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-[#a0aec0]">Quản trị <span className="mx-1">/</span> <span className="text-[#2d3748]">{title}</span></p>
              <p className="truncate text-sm font-bold text-[#2d3748]">{title}</p>
            </div>
            <AdminHeaderActions name={user?.username || 'Quản trị viên'} role={roleLabel(user?.role)} icon={ShieldCheck} />
          </div>
        </header>

        <main className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0 ${softConsoleMain}`}><RouteView /></main>
      </div>
    </div>
  )
}
