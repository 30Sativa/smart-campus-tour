import { Suspense, useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { PageSkeleton } from '../../components/ui/ConsolePrimitives'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { DevDataBadge, MobileNavToggle } from '../../components/ui/ConsoleSidebar'
import { GroupedSidebar } from '../../components/ui/GroupedSidebar'
import { TECHNICAL_NAV, TECHNICAL_NAV_ENTRIES, technicalActivePath } from './technical-nav'

/** The Technical Staff shell: same console chrome as Staff and Admin. */
export default function TechnicalShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)
  const current = technicalActivePath(location.pathname)
  const title = TECHNICAL_NAV.find(({ path }) => path === current)?.label ?? 'Kỹ thuật'

  return (
    <div className="flex min-h-[100dvh] bg-[#f6f7f9] text-[#173b59]">
      <MobileNavToggle open={menuOpen} controls="technical-navigation" label="Mở điều hướng kỹ thuật" closeLabel="Đóng điều hướng kỹ thuật" onOpen={() => setMenuOpen(true)} onClose={closeMenu} />
      <GroupedSidebar
        id="technical-navigation"
        label="Khu vực kỹ thuật"
        navLabel="Điều hướng kỹ thuật"
        homePath="/technical"
        subtitle="DT-AMR · Kỹ thuật"
        entries={TECHNICAL_NAV_ENTRIES}
        currentPath={current}
        onNavigate={closeMenu}
        onLogout={handleLogout}
        open={menuOpen}
        panelRef={navRef}
      />
      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 bg-[#f6f7f9]/85 px-4 backdrop-blur-md sm:px-6 lg:px-9">
          <div className="flex h-[62px] items-center justify-between gap-3 border-b border-[#e5e7eb]">
            <p className="min-w-0 truncate text-[12.5px] font-medium text-[#9ca3af]">CampusTour <span className="mx-1.5 text-[#d1d5db]">/</span> <span className="text-[#6b7280]">{title}</span></p>
            <p className="shrink-0 text-right text-xs"><span className="block font-semibold text-[#334155]">{user?.username}</span><span className="text-[#94a3b8]">{roleLabel(user?.role)}</span></p>
          </div>
        </header>
        {!location.pathname.startsWith('/technical/poi-import') && <DevDataBadge>dữ liệu mẫu · chưa có API kỹ thuật</DevDataBadge>}
        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
