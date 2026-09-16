import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  Bell,
  Bot,
  CalendarDays,
  ClipboardCheck,
  Cuboid,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { apiClient } from '../../api/client';

interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Vận hành',
    items: [
      { label: 'Trực tiếp', path: '/admin/live-operations', icon: Activity },
      { label: 'Lịch và phiên tour', path: '/admin/schedule', icon: CalendarDays },
      { label: 'Cảnh báo', path: '/admin#alerts', icon: Bell },
    ],
  },
  {
    label: 'Digital Twin',
    items: [
      { label: 'Live Twin', path: '/admin/digital-twin', icon: Cuboid },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { label: 'Việc chờ xem xét', path: '/admin#pending-actions', icon: ClipboardCheck },
      { label: 'System Readiness', path: '/admin#system-readiness', icon: Radio },
    ],
  },
];

export default function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);

  const currentTarget = `${location.pathname}${location.hash}`;

  const handleLogout = async () => {
    try {
      await apiClient('/api/auth/logout', { method: 'POST' });
    } catch {
      // Local state must still be cleared if the server is unreachable.
    } finally {
      logout();
      navigate('/');
    }
  };

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin' && !location.hash;
    }
    return currentTarget === path;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed right-5 bottom-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#5b91ed] text-white shadow-[0_10px_28px_rgba(79,141,247,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 lg:hidden"
        aria-label="Mở điều hướng quản trị"
      >
        <Menu size={22} strokeWidth={2} aria-hidden="true" />
      </button>

      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 cursor-default bg-[#1f314d]/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-label="Đóng điều hướng quản trị"
        />
      )}

      <aside className={`fixed top-0 left-0 z-40 flex h-[100dvh] w-[256px] flex-col border-r border-[#dce9fb] bg-white transition-transform duration-200 lg:sticky lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 shrink-0 items-center border-b border-[#e9f1fc] px-4">
          <Link to="/admin" onClick={() => setIsOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#5b91ed] text-white shadow-sm">
              <Bot size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold tracking-[-0.02em] text-[#1f314d]">CampusTour</span>
            </span>
          </Link>
          <button type="button" onClick={() => setIsOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-[#8a98ac] hover:bg-[#f1f6fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] lg:hidden" aria-label="Đóng menu">
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Điều hướng quản trị">
          <Link
            to="/admin"
            onClick={() => setIsOpen(false)}
            className={`mb-5 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${isActive('/admin') ? 'bg-[#eaf4ff] text-[#3a6fd8]' : 'text-[#6e8096] hover:bg-[#f1f6fe] hover:text-[#3a6fd8]'}`}
          >
            <LayoutDashboard size={18} strokeWidth={1.9} aria-hidden="true" />
            Tổng quan
          </Link>

          <div className="space-y-5">
            {navigationGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.08em] text-[#9aa8bd] uppercase">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsOpen(false)}
                        className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${active ? 'bg-[#eaf4ff] text-[#3a6fd8]' : 'text-[#6e8096] hover:bg-[#f1f6fe] hover:text-[#3a6fd8]'}`}
                      >
                        <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-[#e9f1fc] p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-[#f1f6fe] px-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-[#5b91ed] shadow-sm">
              <Radio size={15} strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[#40546f]">Ready</p>
              <p className="truncate text-[10px] text-[#8a98ac]">Demo profile</p>
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#6e8096] transition-colors hover:bg-[#eaf4ff] hover:text-[#3a6fd8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
            <LogOut size={17} strokeWidth={1.9} aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
}
