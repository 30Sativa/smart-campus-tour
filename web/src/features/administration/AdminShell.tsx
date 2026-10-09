import { Suspense, useCallback, useState } from 'react'
import { KeyRound, Radio, ShieldCheck } from 'lucide-react'
import { Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { PageSkeleton } from '../../components/ui/ConsolePrimitives'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { DevDataBadge, MobileNavToggle } from '../../components/ui/ConsoleSidebar'
import { ADMIN_NAV, adminActivePath } from './admin-nav'
import { AdminHeaderActions } from './AdminHeaderActions'
import { AdminSidebar } from './AdminSidebar'
import { usePendingReviewCount } from './registrations/hooks'

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
  // The badge links to the live SQL queue, so it counts that queue, never the simulated registrations.
  const pendingCount = usePendingReviewCount() ?? 0

  const current = adminActivePath(location.pathname)
  const onRoles = location.pathname.startsWith('/admin/roles')
  const onAccounts = location.pathname.startsWith('/admin/accounts')
  const onPois = location.pathname.startsWith('/admin/pois')
  const title = onRoles ? 'Vai trò & quyền' : ADMIN_NAV.find(({ path }) => path === current)?.label ?? 'Quản trị Tour'

  return (
    <div className="flex min-h-[100dvh] bg-[#f6f7f9] text-[#173b59]">
      <MobileNavToggle open={menuOpen} controls="admin-navigation" label="Mở điều hướng quản trị" closeLabel="Đóng điều hướng quản trị" onOpen={() => setMenuOpen(true)} onClose={closeMenu} />

      <AdminSidebar
        id="admin-navigation"
        currentPath={current}
        pendingCount={pendingCount}
        // Reference links, not tasks: both are read-only for an Admin-only account.
        secondary={[
          { to: '/admin/roles', label: 'Vai trò & quyền', icon: KeyRound, current: onRoles },
          { to: '/staff', label: 'Khu vực vận hành', icon: Radio },
        ]}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
      />

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 bg-[#f6f7f9]/85 px-4 backdrop-blur-md sm:px-6 lg:px-9">
          <div className="flex h-[62px] items-center justify-between gap-3 border-b border-[#e5e7eb]">
            <p className="min-w-0 truncate text-[12.5px] font-medium text-[#9ca3af]">CampusTour <span className="mx-1.5 text-[#d1d5db]">/</span> <span className="text-[#6b7280]">{title}</span></p>
            <AdminHeaderActions name={user?.username || 'Quản trị viên'} role={roleLabel(user?.role)} icon={ShieldCheck} />
          </div>
        </header>

        {!onAccounts && !onPois && !location.pathname.startsWith('/admin/registrations') && <DevDataBadge>dữ liệu mẫu · máy chủ quản trị mô phỏng</DevDataBadge>}

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
