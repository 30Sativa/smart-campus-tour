import { Suspense, useCallback, useState } from 'react'
import { KeyRound, Radio, ShieldCheck } from 'lucide-react'
import { Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { PageSkeleton } from '../staff/StaffUi'
import { useMobileNav } from '../staff/use-mobile-nav'
import { ConsoleSidebar, ConsoleTopbar, DevDataBadge, MobileNavToggle } from '../staff/ConsoleSidebar'
import { ADMIN_NAV, ADMIN_NAV_SECTIONS, adminActivePath } from './admin-nav'

/**
 * The administration shell: preparing Tours before they run.
 *
 * Same sidebar, same header height and the same palette as operations
 * (`ConsoleSidebar`), because the only account that crosses between the two
 * is an Admin and should not have to re-learn the chrome. It diverges in
 * priority only: no live badge and no alert bell.
 */
export default function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)

  const current = adminActivePath(location.pathname)
  const onRoles = location.pathname.startsWith('/admin/roles')
  const title = onRoles ? 'Vai trò & quyền' : ADMIN_NAV.find(({ path }) => path === current)?.label ?? 'Quản trị Tour'

  return (
    <div className="flex min-h-[100dvh] bg-[#f0f0eb] text-[#1c1c1c]">
      <MobileNavToggle open={menuOpen} controls="admin-navigation" label="Mở điều hướng quản trị" closeLabel="Đóng điều hướng quản trị" onOpen={() => setMenuOpen(true)} onClose={closeMenu} />

      <ConsoleSidebar
        id="admin-navigation"
        label="Khu vực quản trị"
        navLabel="Điều hướng quản trị"
        homePath="/admin"
        areaName="Quản trị Tour"
        sections={ADMIN_NAV_SECTIONS}
        currentPath={current}
        // Reference links, not tasks: both are read-only for an Admin-only account.
        secondary={[
          { to: '/admin/roles', label: 'Vai trò & quyền', icon: KeyRound, current: onRoles },
          { to: '/staff', label: 'Khu vực vận hành (chỉ xem)', icon: Radio },
        ]}
        user={{ name: user?.username || 'Quản trị viên', role: roleLabel(user?.role), icon: ShieldCheck }}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
      />

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <ConsoleTopbar area="Quản trị" areaPath="/admin" title={title} />

        <DevDataBadge>dữ liệu mẫu · máy chủ quản trị mô phỏng</DevDataBadge>

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
