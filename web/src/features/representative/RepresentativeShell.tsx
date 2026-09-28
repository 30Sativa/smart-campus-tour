import { Suspense, useCallback, useState } from 'react'
import { Menu, School } from 'lucide-react'
import { Outlet, useLocation } from 'react-router'
import { useLogout } from '../../auth/use-logout'
import { MOCK_MODE_LABEL } from '../../mocks/mock-mode'
import { currentRepresentativeProfile } from '../../mocks/representative-mock'
import { useAuthStore } from '../../stores/auth-store'
import { ConsoleSidebar } from '../staff/ConsoleSidebar'
import { useMobileNav } from '../staff/use-mobile-nav'
import { PageSkeleton } from './components/RepUi'
import { REP_NAV, REP_NAV_SECTIONS, repActivePath } from './rep-nav'

/**
 * The school representative's area (flow review §4): overview, the Tours a
 * school can join, and its own registrations.
 *
 * Same sidebar and palette as administration and operations (`ConsoleSidebar`),
 * so the product reads as one system. Below `lg` the sidebar becomes a drawer
 * opened from the header, which keeps the bottom of the screen free for each
 * page's main action.
 */
export default function RepresentativeShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const navRef = useMobileNav(menuOpen, closeMenu)
  const profile = currentRepresentativeProfile()

  const current = repActivePath(location.pathname)
  const title = REP_NAV.find(({ path }) => path === current)?.label ?? 'Đại diện trường'

  return (
    <div className="flex min-h-[100dvh] bg-[#f8fafc] text-[#1e293b]">
      {menuOpen && <button type="button" onClick={closeMenu} className="fixed inset-0 z-30 cursor-default bg-[#0f172a]/25 backdrop-blur-[2px] lg:hidden" aria-label="Đóng menu" />}

      <ConsoleSidebar
        id="rep-navigation"
        label="Khu vực đại diện trường"
        navLabel="Điều hướng đại diện trường"
        homePath="/dai-dien"
        areaName="Đại diện trường"
        sections={REP_NAV_SECTIONS}
        currentPath={current}
        user={{ name: profile.representativeName || user?.username || 'Đại diện', role: profile.schoolName || 'Đại diện trường', icon: School }}
        onNavigate={closeMenu}
        onLogout={() => void logout()}
        open={menuOpen}
        panelRef={navRef}
      />

      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[#e5e9f0] bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="rep-navigation"
            className="-ml-1 grid size-10 place-items-center rounded-xl text-[#475569] transition-colors hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] lg:hidden"
            aria-label="Mở menu"
          >
            <Menu size={21} aria-hidden="true" />
          </button>
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[#0f172a]">{title}</p>
        </header>
        <p className="border-b border-[#eef1f5] bg-white px-4 py-1.5 text-xs text-[#64748b] sm:px-6 lg:px-10">
          {MOCK_MODE_LABEL}. Đăng ký, duyệt và email đều được mô phỏng, không lưu sau khi tải lại trang.
        </p>

        <main className="flex-1">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
