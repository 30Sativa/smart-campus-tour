import { useState } from 'react'
import { Bell, Bot, CalendarDays, ChartNoAxesCombined, ChevronDown, ClipboardList, Cuboid, LayoutDashboard, LogOut, Menu, Radio, Route, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../stores/auth-store'
import { useStaffDemoStore } from '../../api/staff-demo'
import { normalizeRole } from '../../auth/roles'

const links: Array<{ label: string; path: string; icon: LucideIcon }> = [
  { label: 'Tổng quan', path: '/staff', icon: LayoutDashboard },
  { label: 'Lịch tour', path: '/staff/schedule', icon: CalendarDays },
  { label: 'AMR trực tiếp', path: '/staff/amr', icon: Radio },
  { label: 'Cảnh báo', path: '/staff/alerts', icon: Bell },
  { label: 'Digital Twin', path: '/staff/digital-twin', icon: Cuboid },
  { label: 'Báo cáo phản hồi', path: '/staff/reports', icon: ChartNoAxesCombined },
]

export default function StaffShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  const setDemo = useStaffDemoStore((state) => state.setDemo)

  const handleLogout = async () => {
    try {
      await apiClient('/api/auth/logout', { method: 'POST' })
    } catch {
      // Clear local credentials even when the logout endpoint is unavailable.
    } finally {
      logout()
      navigate('/')
    }
  }

  const active = (path: string) => path === '/staff' ? location.pathname === path : location.pathname.startsWith(path)

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
            <Link to="/tours" onClick={() => setMenuOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] hover:bg-[#f1f6fe] hover:text-[#3a6fd8]"><Route size={17} aria-hidden="true" />Trang khách tham quan</Link>
            <span className="mt-2 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#97a7b9]"><ClipboardList size={17} aria-hidden="true" />Quyền theo vai trò</span>
          </div>
        </nav>
        <div className="border-t border-[#e9f1fc] p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-[#f1f6fe] px-3 py-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[#5b91ed] shadow-sm"><Radio size={15} /></span><div className="min-w-0"><p className="truncate text-xs font-bold text-[#40546f]">{user?.username || 'Nhân viên vận hành'}</p><p className="truncate text-[10px] text-[#8a98ac]">{normalizeRole(user?.role)}</p></div></div>
          <button type="button" onClick={handleLogout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] hover:bg-[#eaf4ff] hover:text-[#3a6fd8]"><LogOut size={17} />Đăng xuất</button>
        </div>
      </aside>
      <div className="relative flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#dce9fb] bg-white/90 px-5 backdrop-blur-md lg:px-8">
          <div className="min-w-0"><p className="text-[10px] font-bold tracking-[0.1em] text-[#5b91ed] uppercase">Staff operations</p><h1 className="truncate text-base font-bold tracking-[-0.02em] text-[#1f314d]">{isDemo ? 'Điều hành tour · Dữ liệu mẫu' : 'Điều hành tour'}</h1></div>
          <div className="flex items-center gap-2 sm:gap-3"><button type="button" onClick={() => setDemo(!isDemo)} className={`hidden min-h-10 items-center justify-center rounded-full border px-4 text-xs font-bold md:inline-flex ${isDemo ? 'border-[#cde9dc] bg-[#effbf5] text-[#25895f]' : 'border-[#dce9fb] bg-white text-[#6e89b2] hover:border-[#9fc4f8]'}`}>{isDemo ? 'Đang xem dữ liệu mẫu' : 'Xem dữ liệu mẫu'}</button><button type="button" onClick={() => setDemo(!isDemo)} className={`grid h-10 w-10 place-items-center rounded-full border md:hidden ${isDemo ? 'border-[#cde9dc] bg-[#effbf5] text-[#25895f]' : 'border-[#dce9fb] bg-white text-[#6e89b2]'}`} aria-label={isDemo ? 'Tắt dữ liệu mẫu' : 'Bật dữ liệu mẫu'}><Radio size={18} /></button><div className="hidden items-center gap-2 rounded-full border border-[#cde9dc] bg-[#effbf5] px-3 py-2 text-xs font-semibold text-[#25895f] md:flex"><Radio size={15} />Theo dõi có bảo vệ</div><Link to="/staff/alerts" aria-label="Xem cảnh báo" className="grid h-10 w-10 place-items-center rounded-full border border-[#dce9fb] bg-white text-[#6e89b2] hover:border-[#9fc4f8] hover:bg-[#eff6ff] hover:text-[#4f7fca]"><Bell size={18} /></Link><details className="group relative"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-[#dce9fb] bg-white px-1.5 pr-2.5 text-left"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#5b91ed] text-xs font-bold text-white">{(user?.username || 'NV').slice(0, 2).toUpperCase()}</span><ChevronDown className="hidden text-[#8a98ac] sm:block" size={15} /></summary><div className="absolute right-0 mt-2 w-64 rounded-2xl border border-[#dce9fb] bg-white p-3 shadow-[0_16px_40px_rgba(63,103,158,0.16)]"><p className="text-sm font-bold text-[#40546f]">Quyền vận hành giới hạn</p><p className="mt-1 text-xs leading-5 text-[#71819a]">Các thao tác luôn cần xác nhận và được kiểm soát bởi RBAC ở máy chủ{isDemo ? '. Dữ liệu mẫu chỉ dùng để xem giao diện.' : '.'}</p></div></details></div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden"><Outlet /></main>
      </div>
    </div>
  )
}
