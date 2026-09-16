import { Bell, ChevronDown, Radio, Search, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuthStore } from '../../stores/auth-store';

const pageTitles: Record<string, string> = {
  '/admin': 'Tổng quan',
  '/admin/digital-twin': 'Digital Twin',
};

export default function AdminTopbar() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const pageTitle = pageTitles[location.pathname] ?? 'Quản trị';

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#dce9fb] bg-white/90 px-5 backdrop-blur-md lg:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-[-0.02em] text-[#1f314d]">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <label className="hidden h-9 items-center gap-2 rounded-full border border-[#e0ebfa] bg-[#f7faff] px-3 text-[#93a3b9] lg:flex">
          <Search size={15} aria-hidden="true" />
          <input type="search" className="w-32 bg-transparent text-xs text-[#40546f] outline-none placeholder:text-[#9ba9ba]" placeholder="Tìm kiếm..." aria-label="Tìm kiếm trong quản trị" />
        </label>
        <div className="hidden items-center gap-2 rounded-full border border-[#cde9dc] bg-[#effbf5] px-3 py-2 text-xs font-semibold text-[#25895f] md:flex">
          <Radio size={15} strokeWidth={2} aria-hidden="true" />
          Hệ thống sẵn sàng
        </div>

        <Link
          to="/admin#alerts"
          aria-label="Xem 2 cảnh báo đang mở"
          title="Cảnh báo đang mở"
          className="relative grid h-10 w-10 place-items-center rounded-full border border-[#dce9fb] bg-white text-[#6e89b2] transition-colors hover:border-[#9fc4f8] hover:bg-[#eff6ff] hover:text-[#4f7fca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2"
        >
          <Bell size={18} strokeWidth={1.9} aria-hidden="true" />
          <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-[#ed7b6c] px-1 text-center text-[11px] leading-5 font-bold text-white">2</span>
        </Link>

        <details className="group relative">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-[#dce9fb] bg-white px-1.5 pr-2.5 text-left transition-colors hover:border-[#b9d5fa] hover:bg-[#f8fbff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#5b91ed] text-xs font-bold text-white" aria-hidden="true">
              {(user?.username || 'AD').slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden max-w-28 sm:block">
              <span className="block truncate text-xs font-bold text-[#40546f]">{user?.username || 'Administrator'}</span>
              <span className="block text-[11px] text-[#8a98ac]">System Admin</span>
            </span>
            <ChevronDown className="hidden text-[#8a98ac] transition-transform group-open:rotate-180 sm:block" size={15} aria-hidden="true" />
          </summary>
          <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-[#dce9fb] bg-white p-3 shadow-[0_16px_40px_rgba(63,103,158,0.16)]">
            <div className="flex items-start gap-2.5 border-b border-[#eaf1fb] pb-3">
              <ShieldCheck className="mt-0.5 text-[#5b91ed]" size={18} aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-[#40546f]">Quản trị hệ thống</p>
                <p className="mt-0.5 text-xs leading-5 text-[#71819a]">Quyền thao tác vẫn phụ thuộc RBAC và trạng thái an toàn.</p>
              </div>
            </div>
            <Link to="/" className="mt-2 block rounded-xl px-2 py-2 text-sm font-semibold text-[#647793] hover:bg-[#eff6ff] hover:text-[#4f7fca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]">
              Về trang khách tham quan
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}
