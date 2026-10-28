import { useCallback, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { RouteView } from '../../components/ui/RouteView'
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
    <div className="flex min-h-[100dvh] bg-[#f6f7f9] text-[#173b59]">
      <MobileNavToggle open={menuOpen} controls="admin-navigation" label="Mở điều hướng quản trị" closeLabel="Đóng điều hướng quản trị" onOpen={() => setMenuOpen(true)} onClose={closeMenu} />

      <AdminSidebar
        id="admin-navigation"
        currentPath={current}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
      />

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 bg-[#f6f7f9]/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex h-13 items-center justify-between gap-3 border-b border-[#e5e7eb]">
            <p className="min-w-0 truncate text-[12.5px] font-medium text-[#9ca3af]">CampusTour <span className="mx-1.5 text-[#d1d5db]">/</span> <span className="text-[#6b7280]">{title}</span></p>
            <AdminHeaderActions name={user?.username || 'Quản trị viên'} role={roleLabel(user?.role)} icon={ShieldCheck} />
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0"><RouteView /></main>
      </div>
    </div>
  )
}
