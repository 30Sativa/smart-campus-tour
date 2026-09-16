import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import { ArrowRight, Bot, Eye, EyeOff, LockKeyhole, MapPin, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { apiClient, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth-store';
import { isStaffRole } from './roles';
import { MOCK_ACCOUNTS_HINT, MockAuthError, mockLogin, type AuthResponse } from '../mocks/auth-mock';
import { USE_MOCK_API } from '../mocks/mock-mode';

type LoginFormInputs = {
  username: string;
  password: string;
};

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInputs>();

  const [apiError, setApiError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);

  const onSubmit = async ({ username, password }: LoginFormInputs) => {
    try {
      setApiError('');
      const response = USE_MOCK_API
        ? await mockLogin(username, password)
        : await apiClient<AuthResponse>('/api/auth/login', {
            method: 'POST',
            json: { username, password },
            // The refresh token comes back as an HttpOnly cookie.
            credentials: 'include',
          });

      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role,
      });

      const destination = (location.state as { from?: string })?.from;
      if (destination) navigate(destination, { replace: true });
      else if (isStaffRole(response.role)) navigate('/admin', { replace: true });
      else navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof MockAuthError) setApiError(error.message);
      else if (error instanceof ApiError && error.status === 401) setApiError('Sai tên đăng nhập hoặc mật khẩu.');
      else setApiError('Không đăng nhập được. Kiểm tra kết nối tới máy chủ rồi thử lại.');
    }
  };

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden overflow-y-auto bg-[#071014] p-4 font-['Inter'] text-white sm:p-6 lg:h-screen lg:overflow-hidden lg:p-10">
      <div className="pointer-events-none absolute inset-0 z-0">
        <img src="/images/login-bg.jpg" alt="" className="h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,16,20,0.8)_100%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto flex w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b151a]/85 shadow-[0_28px_90px_rgba(0,0,0,0.7)] backdrop-blur-xl lg:min-h-[520px] lg:flex-row"
      >
        <section className="relative min-h-[250px] overflow-hidden lg:min-h-[520px] lg:w-1/2" aria-label="Trải nghiệm tham quan CampusTour">
          <img src="/images/login-bg.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[center_70%]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,13,17,0.28)_0%,rgba(4,13,17,0.06)_38%,rgba(4,13,17,0.92)_100%)]" />

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 p-5 sm:p-7">
            <Link to="/" className="flex items-center gap-2.5 text-base font-bold text-white no-underline">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400 text-[#071014]">
                <Bot size={20} strokeWidth={2.2} />
              </span>
              CampusTour
            </Link>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 hidden p-12 lg:block">
            <span className="mb-4 inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-cyan-300">
              <Sparkles size={14} /> ĐIỀU HÀNH ĐỘI ROBOT THAM QUAN
            </span>
            <h1 className="max-w-[520px] text-[32px] leading-[1.1] font-bold text-white lg:text-[38px]">
              Theo dõi đội AMR.<br />Điều phối từng phiên tour.
            </h1>
            <p className="mt-4 max-w-[430px] text-sm leading-6 text-white/65">
              Khu vực dành cho nhân viên vận hành khuôn viên.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-[10px] text-white/80 backdrop-blur-md">
                <MapPin size={14} /> Giám sát theo thời gian thực
              </span>
              <span className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-[10px] text-white/80 backdrop-blur-md">
                <ShieldCheck size={14} /> Thao tác có kiểm soát
              </span>
            </div>
          </div>
        </section>

        <section className="relative flex max-h-[85vh] w-full items-center overflow-y-auto bg-[#0b151a] px-6 py-10 sm:px-10 lg:max-h-none lg:w-1/2 lg:px-14 lg:py-12">
          <div className="mx-auto w-full max-w-[400px]">
            {apiError && (
              <div role="alert" className="mb-5 rounded-md border border-red-400/25 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
                {apiError}
              </div>
            )}

            <div className="mb-8">
              <span className="mb-3 block text-[10px] font-bold tracking-[0.16em] text-cyan-400">KHU VỰC NHÂN VIÊN</span>
              <h2 className="text-[30px] leading-tight font-semibold text-white">Đăng nhập CampusTour</h2>
              <p className="mt-3 text-[13px] text-slate-400">
                Tài khoản vận hành do quản trị viên khuôn viên cấp.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                Tên đăng nhập
                <span className="relative flex items-center">
                  <UserRound className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                  <input
                    {...register('username', { required: 'Vui lòng nhập tên đăng nhập' })}
                    autoComplete="username"
                    placeholder="Nhập tên đăng nhập"
                    aria-invalid={Boolean(errors.username)}
                    className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-4 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errors.username ? 'border-red-400/60' : 'border-[#2b3941]'}`}
                  />
                </span>
                {errors.username && <span className="text-[11px] font-normal text-red-300">{errors.username.message}</span>}
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                Mật khẩu
                <span className="relative flex items-center">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('password', { required: 'Vui lòng nhập mật khẩu' })}
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    aria-invalid={Boolean(errors.password)}
                    className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-10 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errors.password ? 'border-red-400/60' : 'border-[#2b3941]'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute right-2 grid h-8 w-8 cursor-pointer place-items-center border-0 bg-transparent text-slate-500 transition-colors hover:text-cyan-400"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
                {errors.password && <span className="text-[11px] font-normal text-red-300">{errors.password.message}</span>}
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-cyan-400 px-5 text-[13px] font-bold text-[#071014] shadow-[0_8px_20px_rgba(34,211,238,0.15)] transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
              >
                <span>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
                {!isSubmitting && <ArrowRight size={17} />}
              </button>
            </form>

            {USE_MOCK_API && (
              <p className="mt-5 rounded-md border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[11px] leading-5 text-amber-200">
                Backend xác thực chưa sẵn sàng nên trang này chạy bằng đăng nhập mẫu. {MOCK_ACCOUNTS_HINT}.
              </p>
            )}

            <p className="mt-6 flex items-center justify-center gap-2 text-center text-[10px] text-slate-500">
              <ShieldCheck size={14} className="text-cyan-500" /> Phiên làm việc chỉ được giữ trong bộ nhớ trình duyệt.
            </p>
          </div>
        </section>
      </motion.div>
    </main>
  );
}
