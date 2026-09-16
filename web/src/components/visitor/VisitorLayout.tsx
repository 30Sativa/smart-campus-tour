import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Compass, Ticket, Sparkles, CircleUserRound, LogOut, Lightbulb, ArrowUpRight } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';
import { useVisitorLogout } from '../../auth/useVisitorLogout';
import { ThemeToggle } from '../ui/ThemeToggle';

const navItems = [
  { name: 'Khám phá', path: '/tours', icon: Compass },
  { name: 'Tour của tôi', path: '/my-bookings', icon: Ticket },
  { name: 'AI Guide', path: '/ai-guide', icon: Sparkles },
  { name: 'Hồ sơ', path: '/profile', icon: CircleUserRound },
];

export function VisitorLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  const logout = useVisitorLogout();
  const isActive = (path: string) => pathname.startsWith(path) ||
    (path === '/my-bookings' && /^\/(live-tour|feedback)\//.test(pathname));

  return (
    <div className="min-h-[100dvh] bg-[var(--bg-primary)] !text-[var(--text-primary)] flex flex-col font-[inherit]">
      <a href="#visitor-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-[var(--bg-card)] focus:px-5 focus:py-3">Đến nội dung chính</a>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--border-color)] bg-[var(--navbar-bg)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between gap-4 px-5 lg:px-10">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 font-bold tracking-tight" aria-label="CampusTour - Trang chủ">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--accent)] text-[#071014]"><Lightbulb size={20} fill="currentColor" /></span>
            <span>CampusTour</span>
          </Link>
          <nav aria-label="Điều hướng Visitor" className="hidden items-center gap-1 md:flex">
            {navItems.map(({ name, path, icon: Icon }) => (
              <Link key={path} to={path} aria-current={isActive(path) ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${isActive(path) ? 'bg-[var(--bg-secondary)] !text-[var(--accent)]' : '!text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:!text-[var(--text-primary)]'}`}>
                <Icon size={16} aria-hidden="true" />{name}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? <>
              <Link to="/profile" className="hidden items-center gap-2 rounded-full border border-[var(--border-color)] py-1.5 pl-1.5 pr-3 text-xs sm:flex">
                <span className="flex size-7 items-center justify-center rounded-full bg-[var(--accent)]/15 font-bold !text-[var(--accent)]">{user?.username?.slice(0, 1).toUpperCase()}</span>
                <span className="max-w-24 truncate">{user?.username}</span>
              </Link>
              <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} aria-label="Đăng xuất" title="Đăng xuất" className="flex size-10 items-center justify-center rounded-full !text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"><LogOut size={17} /></button>
            </> : <Link to="/login" className="rounded-full bg-[var(--text-primary)] px-4 py-2.5 text-xs font-bold !text-[var(--bg-primary)]">Đăng nhập</Link>}
          </div>
        </div>
      </header>
      {logout.isError && <div role="alert" className="fixed left-4 right-4 top-20 z-50 rounded-2xl border border-red-400 bg-[var(--bg-card)] p-4 text-sm">Không thể đăng xuất. Vui lòng thử lại.</div>}
      <main id="visitor-content" tabIndex={-1} className="w-full flex-1 pt-[72px] pb-[calc(80px+env(safe-area-inset-bottom))] outline-none md:pb-0">{children}</main>
      <footer className="hidden border-t border-[var(--border-color)] md:block">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-10 py-7 text-xs !text-[var(--text-secondary)]">
          <span>CampusTour DT-AMR <span className="ml-3">Khám phá campus cùng công nghệ.</span></span>
          <Link to="/" className="flex items-center gap-2 hover:!text-[var(--text-primary)]">Về trang Home <ArrowUpRight size={15} /></Link>
        </div>
      </footer>
      <nav aria-label="Điều hướng Visitor trên điện thoại" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-color)] bg-[var(--navbar-bg)] px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="grid h-[72px] grid-cols-4">
          {navItems.map(({ name, path, icon: Icon }) => (
            <Link key={path} to={path} aria-current={isActive(path) ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-1.5 text-[11px] font-semibold ${isActive(path) ? '!text-[var(--accent)]' : '!text-[var(--text-secondary)]'}`}>
              <Icon size={21} aria-hidden="true" />{name}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}



