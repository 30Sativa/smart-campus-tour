import { Suspense, useState } from 'react'
import { LogOut, Menu, Radio, ShieldCheck, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { roleLabel } from '../../auth/roles'
import { USE_MOCK_API } from '../../mocks/mock-mode'
import { PageSkeleton } from '../operations/OperationsUi'
import { ADMIN_NAV } from './admin-nav'

/**
 * The administration shell.
 *
 * Deliberately not the staff shell with a different title. It is a darker,
 * quieter chrome because administration is a place you visit to check and to
 * configure, not a console you watch all day; there is no alert bell, no live
 * badge and nothing that pulls for attention. It shares the brand, the type and
 * the panel language with operations, and diverges on density and priority.
 */
export default function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()

  const active = (path: string) => (path === '/admin' ? location.pathname === path : location.pathname.startsWith(path))

  return (
    <div className="flex min-h-[100dvh] bg-[#f4f6fa] text-[#1f2937]">
      <button type="button" onClick={() => setMenuOpen(true)} className="fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#33415c] text-white shadow-[0_10px_28px_rgba(51,65,92,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#33415c] focus-visible:ring-offset-2 lg:hidden" aria-label="Mở điều hướng quản trị">
        <Menu size={22} aria-hidden="true" />
      </button>
      {menuOpen && <button type="button" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 cursor-default bg-[#1f2937]/25 backdrop-blur-[2px] lg:hidden" aria-label="Đóng điều hướng quản trị" />}

      <aside className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-64 flex-col border-r border-[#dfe4ec] bg-white transition-transform duration-200 lg:sticky lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center border-b border-[#ecf0f5] px-4">
          <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex min-w-0 flex-1 items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#33415c]">
            <img className="h-9 w-9 shrink-0 translate-x-1 -translate-y-1 scale-125 object-contain" src="/images/logo.png" alt="" width={36} height={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold tracking-[-0.02em] text-[#1f2937]">CampusTour</span>
              <span className="block text-[10px] font-semibold text-[#8792a5]">Quản trị hệ thống</span>
            </span>
          </Link>
          <button type="button" onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-[#8792a5] hover:bg-[#f4f6fa] lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng quản trị">
          <div className="space-y-1">
            {ADMIN_NAV.map(({ label, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMenuOpen(false)}
                aria-current={active(path) ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#33415c] ${active(path) ? 'bg-[#eceff5] text-[#1f2937]' : 'text-[#6b7688] hover:bg-[#f4f6fa] hover:text-[#1f2937]'}`}
              >
                <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>

          <div className="mt-6 border-t border-[#ecf0f5] pt-5">
            <Link to="/staff" onClick={() => setMenuOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6b7688] transition-colors hover:bg-[#f4f6fa] hover:text-[#1f2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#33415c]">
              <Radio size={17} strokeWidth={1.9} aria-hidden="true" />
              Khu vực vận hành
            </Link>
          </div>
        </nav>

        <div className="border-t border-[#ecf0f5] p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-[#f4f6fa] px-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[#33415c] shadow-sm"><ShieldCheck size={15} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#3c4657]">{user?.username || 'Quản trị viên'}</p>
              <p className="truncate text-[10px] text-[#8792a5]">{roleLabel(user?.role)}</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6b7688] hover:bg-[#eceff5] hover:text-[#1f2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#33415c]">
            <LogOut size={17} aria-hidden="true" />Đăng xuất
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center border-b border-[#dfe4ec] bg-white/90 px-5 backdrop-blur-md lg:px-8">
          <p className="text-sm font-bold tracking-[-0.01em] text-[#1f2937] lg:hidden">{ADMIN_NAV.find(({ path }) => active(path))?.label ?? 'Quản trị hệ thống'}</p>
        </header>

        {import.meta.env.DEV && USE_MOCK_API && (
          <p role="status" data-dev-only="true" className="border-b border-[#e6dcc0] bg-[#faf6ea] px-5 py-1.5 text-[11px] font-semibold text-[#7a5f14] lg:px-8">
            DEV · Dữ liệu hiển thị là dữ liệu mẫu.
          </p>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
