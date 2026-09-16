import { useVisitorLogout } from '../../auth/useVisitorLogout';
import { useAuthStore } from '../../stores/auth-store';
import { VisitorLayout } from '../../components/visitor/VisitorLayout';
import { GlassCard } from '../../components/visitor/GlassCard';
import { motion } from 'motion/react';

export default function Profile() {
  const { user } = useAuthStore();
  const logout = useVisitorLogout();

  const handleLogout = () => {
    logout.mutate();
  };

  return (
    <VisitorLayout>
      <div className="pt-12 md:pt-24 pb-32 px-6 max-w-[600px] mx-auto min-h-screen">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          <div className="flex flex-col items-center mb-10">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--accent)] to-cyan-500 flex items-center justify-center text-3xl font-bold text-black mb-4 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{user?.username || 'Guest User'}</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">{!user || user.role === 'visitor' ? 'Khách tham quan' : 'Nhân viên campus'}</p>
          </div>

          {logout.isError && <p role="alert" className="mb-4 text-sm text-red-500">Không thể đăng xuất. Vui lòng thử lại.</p>}
          <div className="space-y-4">
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[var(--text-primary)]">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold">Ngôn ngữ</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">Tiếng Việt</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[var(--text-primary)]">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold">Trợ giúp & Hỗ trợ</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">Câu hỏi thường gặp</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </GlassCard>

            <button 
              onClick={handleLogout}
              disabled={logout.isPending}
              className="w-full mt-8 p-4 rounded-[20px] bg-red-500/10 border border-red-500/20 text-red-400 font-bold text-sm hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Đăng xuất
            </button>
          </div>
        </motion.div>
      </div>
    </VisitorLayout>
  );
}



