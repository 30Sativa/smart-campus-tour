import { Suspense, useState } from 'react'
import { Bell, Bot, CalendarDays, ChartNoAxesCombined, ChevronDown, ClipboardList, Cuboid, LayoutDashboard, LogOut, Menu, Radio, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuthStore } from '../../stores/auth-store'
import { useLogout } from '../../auth/use-logout'
import { normalizeRole } from '../../auth/roles'
import { MOCK_MODE_LABEL, USE_MOCK_API } from '../../mocks/mock-mode'
import { PageSkeleton } from './OperationsUi'

const links: Array<{ label: string; path: string; icon: LucideIcon }> = [
  { label: 'Tổng quan', path: '/admin', icon: LayoutDashboard },
  { label: 'Lịch tour', path: '/admin/schedule', icon: CalendarDays },
  { label: 'AMR trực tiếp', path: '/admin/amr', icon: Radio },
  { label: 'Cảnh báo', path: '/admin/alerts', icon: Bell },
  { label: 'Digital Twin', path: '/admin/digital-twin', icon: Cuboid },
  { label: 'Báo cáo phản hồi', path: '/admin/reports', icon: ChartNoAxesCombined },
]

export default function OperationsShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const handleLogout = useLogout()

  const active = (path: string) => (path === '/admin' ? location.pathname === path : location.pathname.startsWith(path))

  return (
    <div className="flex min-h-[100dvh] bg-[#f1f6fe] text-[#1f314d]">
      <button type="button" onClick={() => setMenuOpen(true)} className="fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#5b91ed] text-white shadow-[0_10px_28px_rgba(79,141,247,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 lg:hidden" aria-label="Mở điều hướng vận hành">
        <Menu size={22} aria-hidden="true" />
      </button>
      {menuOpen && <button type="button" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 cursor-default bg-[#1f314d]/20 backdrop-blur-[2px] lg:hidden" aria-label="Đóng điều hướng vận hành" />}
      <aside className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-64 flex-col border-r border-[#dce9fb] bg-white transition-transform duration-200 lg:sticky lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center border-b border-[#e9f1fc] px-4">
          <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5b91ed] text-white shadow-sm"><Bot size={20} aria-hidden="true" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-extrabold tracking-[-0.02em] text-[#1f314d]">CampusTour</span><span className="block text-[10px] font-semibold text-[#7b8fa9]">Điều hành tour</span></span>
          </Link>
          <button type="button" onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-[#8a98ac] hover:bg-[#f1f6fe] lg:hidden" aria-label="Đóng menu"><X size={19} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng vận hành">
          <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.08em] text-[#9aa8bd] uppercase">Điều hành</p>
          <div className="space-y-1">
            {links.map(({ label, path, icon: Icon }) => <Link key={path} to={path} onClick={() => setMenuOpen(false)} className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${active(path) ? 'bg-[#eaf4ff] text-[#3a6fd8]' : 'text-[#6e8096] hover:bg-[#f1f6fe] hover:text-[#3a6fd8]'}`}><Icon size={17} strokeWidth={1.9} aria-hidden="true" />{label}</Link>)}
          </div>
          <div className="mt-6 border-t border-[#e9f1fc] pt-5">
            <span className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#97a7b9]"><ClipboardList size={17} aria-hidden="true" />Quyền theo vai trò</span>
          </div>
        </nav>
        <div className="border-t border-[#e9f1fc] p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-[#f1f6fe] px-3 py-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[#5b91ed] shadow-sm"><Radio size={15} /></span><div className="min-w-0"><p className="truncate text-xs font-bold text-[#40546f]">{user?.username || 'Nhân viên vận hành'}</p><p className="truncate text-[10px] text-[#8a98ac]">{normalizeRole(user?.role)}</p></div></div>
          <button type="button" onClick={handleLogout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] hover:bg-[#eaf4ff] hover:text-[#3a6fd8]"><LogOut size={17} />Đăng xuất</button>
        </div>
      </aside>
      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#dce9fb] bg-white/90 px-5 backdrop-blur-md lg:px-8">
          <div className="min-w-0"><p className="text-[10px] font-bold tracking-[0.1em] text-[#5b91ed] uppercase">Staff operations</p><h1 className="truncate text-base font-bold tracking-[-0.02em] text-[#1f314d]">Điều hành tour</h1></div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/admin/alerts" aria-label="Xem cảnh báo" className="grid h-10 w-10 place-items-center rounded-full border border-[#dce9fb] bg-white text-[#6e89b2] hover:border-[#9fc4f8] hover:bg-[#eff6ff] hover:text-[#4f7fca]"><Bell size={18} /></Link>
            <details className="group relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-[#dce9fb] bg-white px-1.5 pr-2.5 text-left"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#5b91ed] text-xs font-bold text-white">{(user?.username || 'NV').slice(0, 2).toUpperCase()}</span><ChevronDown className="hidden text-[#8a98ac] sm:block" size={15} /></summary><div className="absolute right-0 mt-2 w-64 rounded-2xl border border-[#dce9fb] bg-white p-3 shadow-[0_16px_40px_rgba(63,103,158,0.16)]"><p className="text-sm font-bold text-[#40546f]">Quyền vận hành giới hạn</p><p className="mt-1 text-xs leading-5 text-[#71819a]">Mọi thao tác điều phối đều cần xác nhận và được kiểm soát bởi RBAC ở máy chủ.</p></div></details>
          </div>
        </header>
        {USE_MOCK_API && (
          <p role="status" className="border-b border-[#f0dfb4] bg-[#fff9e9] px-5 py-2 text-xs font-bold text-[#8a5f03] lg:px-8">
            {MOCK_MODE_LABEL}. Mọi con số trên màn hình này là dữ liệu mẫu, không phải trạng thái thật của đội robot.
          </p>
        )}
        <main className="flex-1 overflow-y-auto overflow-x-hidden"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
