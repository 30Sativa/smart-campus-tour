import { useCallback, useState } from 'react'
import { Wrench } from 'lucide-react'
import { useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { RouteView } from '../../components/ui/RouteView'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { MobileNavToggle } from '../../components/ui/ConsoleSidebar'
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
        <header className="sticky top-0 z-20 shrink-0 bg-[#f6f7f9]/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex h-13 items-center justify-between gap-3 border-b border-[#e5e7eb]">
            <p className="min-w-0 truncate text-[12.5px] font-medium text-[#9ca3af]">CampusTour <span className="mx-1.5 text-[#d1d5db]">/</span> <span className="text-[#6b7280]">{title}</span></p>
            <div role="group" aria-label="Tài khoản đang đăng nhập" className="ml-auto flex min-w-0 items-center gap-2.5 border-l border-[#e5e7eb] pl-3.5">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#173b59] text-white"><Wrench size={15} /></span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-40 truncate text-[13px] leading-tight font-semibold text-[#0f172a]">{user?.username}</span>
                <span className="block max-w-40 truncate text-[11px] leading-tight text-[#9ca3af]">{roleLabel(user?.role)}</span>
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 lg:pb-0"><RouteView /></main>
      </div>
    </div>
  )
}
