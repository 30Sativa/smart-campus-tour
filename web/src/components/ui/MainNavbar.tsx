import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuthStore } from '../../stores/auth-store';
import { ThemeToggle } from './ThemeToggle';

export function MainNavbar() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const role = user?.role?.toLowerCase();
  const isStaff = role === 'ops' || role === 'admin' || role === 'staff';
  const isAdmin = role === 'admin';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0a0a0a]/85 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-400 p-[1.5px] shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-300">
            <div className="w-full h-full bg-[#0d1117] rounded-[10px] flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="10" rx="3" />
                <circle cx="12" cy="5" r="2" />
                <path d="M12 7v4" />
                <line x1="8" y1="16" x2="8" y2="16" strokeLinecap="round" strokeWidth="3" />
                <line x1="16" y1="16" x2="16" y2="16" strokeLinecap="round" strokeWidth="3" />
              </svg>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white group-hover:text-emerald-300 transition-colors">
                CampusTour
              </span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                DT-AMR
              </span>
            </div>
            <p className="text-[11px] text-gray-400 hidden sm:block">AI Robot Guide & Digital Twin</p>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1">
          <Link
            to="/"
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive('/') && location.pathname === '/'
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            Trang Chủ
          </Link>
          <Link
            to="/tours"
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              isActive('/tours')
                ? 'text-emerald-400 bg-emerald-500/10 font-semibold shadow-inner'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Khám Phá Tour</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </Link>
          {isAuthenticated && !isAdmin && (
            <Link
              to="/my-bookings"
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive('/my-bookings')
                  ? 'text-emerald-400 bg-emerald-500/10 font-semibold'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              Vé & Lịch Đặt
            </Link>
          )}
          {isStaff && (
            <Link
              to="/admin"
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                isActive('/admin')
                  ? 'text-cyan-400 bg-cyan-500/10 font-semibold'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Điều Hành (Ops)</span>
            </Link>
          )}
        </nav>

        {/* Right Authentication Controls */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                  {user?.username?.charAt(0) || 'U'}
                </div>
                <div className="text-left leading-tight">
                  <div className="text-xs font-semibold text-gray-200">{user?.username}</div>
                  <div className="text-[10px] text-emerald-400 capitalize">{user?.role}</div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-white/10 hover:border-red-500/20 transition-all cursor-pointer"
                title="Đăng xuất"
              >
                Đăng Xuất
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-4 py-2 text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors"
              >
                Đăng Nhập
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-black bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 rounded-lg shadow-lg shadow-emerald-500/20 transition-all transform hover:-translate-y-0.5"
              >
                Đăng Ký
              </Link>
            </div>
          )}
          
          <ThemeToggle />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0c1015]/95 backdrop-blur-2xl px-4 py-4 space-y-2">
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2 rounded-lg text-sm ${
              isActive('/') ? 'text-emerald-400 bg-emerald-500/10 font-semibold' : 'text-gray-300'
            }`}
          >
            Trang Chủ
          </Link>
          <Link
            to="/tours"
            onClick={() => setMobileOpen(false)}
            className={`block px-3 py-2 rounded-lg text-sm ${
              isActive('/tours') ? 'text-emerald-400 bg-emerald-500/10 font-semibold' : 'text-gray-300'
            }`}
          >
            Khám Phá Tour
          </Link>
          {isAuthenticated && !isAdmin && (
            <Link
              to="/my-bookings"
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm ${
                isActive('/my-bookings') ? 'text-emerald-400 bg-emerald-500/10 font-semibold' : 'text-gray-300'
              }`}
            >
              Vé & Lịch Đặt Của Tôi
            </Link>
          )}
          {isStaff && (
            <Link
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-cyan-400 hover:bg-cyan-500/10"
            >
              Trung Tâm Điều Hành (Ops)
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
