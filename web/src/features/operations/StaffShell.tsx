import { Suspense, useState } from 'react'
import { Bell, Bot, LogOut, Menu, Radio, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { isAdminRole, roleLabel } from '../../auth/roles'
import { USE_MOCK_API } from '../../mocks/mock-mode'
import { PageSkeleton } from './OperationsUi'
import { STAFF_NAV } from './staff-nav'

export default function StaffShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()
  const showAdminLink = isAdminRole(user?.role)

  const active = (path: string) => (path === '/staff' ? location.pathname === path : location.pathname.startsWith(path))

  return (
    <div className="flex min-h-[100dvh] bg-[#f1f6fe] text-[#1f314d]">
      <button type="button" onClick={() => setMenuOpen(true)} className="fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#5b91ed] text-white shadow-[0_10px_28px_rgba(79,141,247,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 lg:hidden" aria-label="Mở điều hướng vận hành">
        <Menu size={22} aria-hidden="true" />
      </button>
      {menuOpen && <button type="button" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 cursor-default bg-[#1f314d]/20 backdrop-blur-[2px] lg:hidden" aria-label="Đóng điều hướng vận hành" />}

      <aside className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-64 flex-col border-r border-[#dce9fb] bg-white transition-transform duration-200 lg:sticky lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center border-b border-[#e9f1fc] px-4">
          <Link to="/staff" onClick={() => setMenuOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5b91ed] text-white shadow-sm"><Bot size={20} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold tracking-[-0.02em] text-[#1f314d]">CampusTour</span>
              <span className="block text-[10px] font-semibold text-[#7b8fa9]">Vận hành tour</span>
            </span>
          </Link>
          <button type="button" onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-[#8a98ac] hover:bg-[#f1f6fe] lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng vận hành">
          <div className="space-y-1">
            {STAFF_NAV.map(({ label, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMenuOpen(false)}
                aria-current={active(path) ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${active(path) ? 'bg-[#eaf4ff] text-[#2f62b8]' : 'text-[#6e8096] hover:bg-[#f1f6fe] hover:text-[#2f62b8]'}`}
              >
                <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>

          {/* Only an Admin sees a way across, and only because that account
              genuinely has the other area. An operator is not shown a door it
              cannot open. */}
          {showAdminLink && (
            <div className="mt-6 border-t border-[#e9f1fc] pt-5">
              <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] transition-colors hover:bg-[#f1f6fe] hover:text-[#2f62b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
                <Bot size={17} strokeWidth={1.9} aria-hidden="true" />
                Khu vực quản trị
              </Link>
            </div>
          )}
        </nav>

        <div className="border-t border-[#e9f1fc] p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-[#f1f6fe] px-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[#5b91ed] shadow-sm"><Radio size={15} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#40546f]">{user?.username || 'Nhân viên vận hành'}</p>
              <p className="truncate text-[10px] text-[#8a98ac]">{roleLabel(user?.role)}</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] hover:bg-[#eaf4ff] hover:text-[#2f62b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <LogOut size={17} aria-hidden="true" />Đăng xuất
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        {/* The shell header names the area. The page heading below says what the
            page is, so the two never print the same words. */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#dce9fb] bg-white/90 px-5 backdrop-blur-md lg:px-8">
          <p className="text-sm font-bold tracking-[-0.01em] text-[#1f314d] lg:hidden">{STAFF_NAV.find(({ path }) => active(path))?.label ?? 'Vận hành tour'}</p>
          <span className="hidden lg:block" />
          <Link to="/staff/alerts" aria-label="Xem cảnh báo" className="grid h-10 w-10 place-items-center rounded-full border border-[#dce9fb] bg-white text-[#6e89b2] hover:border-[#9fc4f8] hover:bg-[#eff6ff] hover:text-[#2f62b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <Bell size={18} aria-hidden="true" />
          </Link>
        </header>

        {/* Development only, and one line. A production bundle drops the branch;
            `mock-mode.ts` warns to the console instead, so a mocked production
            build is still disclosed without shouting at an operator all shift. */}
        {import.meta.env.DEV && USE_MOCK_API && (
          <p role="status" data-dev-only="true" className="border-b border-[#f0dfb4] bg-[#fff8e6] px-5 py-1.5 text-[11px] font-semibold text-[#8a5a06] lg:px-8">
            DEV · Dữ liệu hiển thị là dữ liệu mẫu.
          </p>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
