import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Bot,
  Eye,
  EyeOff,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRound,
  Mail
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/auth-store';
import { isStaffRole, staffHomePath } from './roles';

interface LoginFormInputs {
  username: string;
  password: string;
}

interface RegisterFormInputs {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

interface AuthResponse {
  accessToken: string;
  userId: string;
  username: string;
  role: string;
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  
  // Login form
  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: errorsLogin, isSubmitting: isSubmittingLogin },
  } = useForm<LoginFormInputs>();

  // Register form
  const {
    register: registerSignup,
    handleSubmit: handleSubmitSignup,
    watch: watchSignup,
    formState: { errors: errorsSignup, isSubmitting: isSubmittingSignup },
  } = useForm<RegisterFormInputs>();

  const [apiError, setApiError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);

  const onLoginSubmit = async (data: LoginFormInputs) => {
    try {
      setApiError('');
      const response = await apiClient<AuthResponse>('/api/auth/login', {
        method: 'POST',
        json: data,
      });
      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role,
      });

      const destination = (location.state as { from?: string })?.from;
      if (destination) {
        navigate(destination);
      } else if (isStaffRole(response.role)) {
        navigate(staffHomePath(response.role));
      } else {
        navigate('/tours');
      }
    } catch (error) {
      try {
        const body = JSON.parse((error as { body?: string }).body || '{}');
        setApiError(body.message || 'Đăng nhập thất bại.');
      } catch {
        setApiError('Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
      }
    }
  };

  const onRegisterSubmit = async (data: RegisterFormInputs) => {
    try {
      setApiError('');
      const response = await apiClient<AuthResponse>('/api/auth/register', {
        method: 'POST',
        json: { username: data.username, password: data.password },
      });
      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role,
      });
      navigate('/tours');
    } catch (error) {
      try {
        const body = JSON.parse((error as { body?: string }).body || '{}');
        setApiError(body.message || 'Đăng ký thất bại.');
      } catch {
        setApiError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
      }
    }
  };

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden overflow-y-auto bg-[#071014] p-4 font-['Inter'] text-white sm:p-6 lg:h-screen lg:overflow-hidden lg:p-10">
      <div className="pointer-events-none absolute inset-0 z-0">
        <img
          src="/images/login-bg.jpg"
          alt=""
          className="h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,16,20,0.8)_100%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className={`relative z-10 mx-auto flex w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b151a]/85 shadow-[0_28px_90px_rgba(0,0,0,0.7)] backdrop-blur-xl lg:min-h-[520px] ${isLogin ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
      >
        {/* Left Side (Image) */}
        <motion.section 
          layout
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative min-h-[250px] overflow-hidden lg:min-h-[520px] lg:w-1/2" 
          aria-label="Trải nghiệm tham quan CampusTour"
        >
          <img
            src="/images/login-bg.jpg"
            alt="Campus Tour Hero"
            className="absolute inset-0 h-full w-full object-cover object-[center_70%]"
          />
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
              <Sparkles size={14} /> HÀNH TRÌNH KHUÔN VIÊN THÔNG MINH
            </span>
            <h1 className="max-w-[520px] text-[32px] leading-[1.1] font-bold tracking-normal text-white lg:text-[38px]">
              Khám phá nhiều hơn.<br />Di chuyển thông minh hơn.
            </h1>
            <p className="mt-4 max-w-[430px] text-sm leading-6 text-white/65">
              Robot AMR và trợ lý AI luôn sẵn sàng đồng hành trong hành trình của bạn.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-[10px] text-white/80 backdrop-blur-md">
                <MapPin size={14} /> Lộ trình được tuyển chọn
              </span>
              <span className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-[10px] text-white/80 backdrop-blur-md">
                <ShieldCheck size={14} /> Trải nghiệm an toàn
              </span>
            </div>
          </div>
        </motion.section>

        {/* Right Side (Forms) */}
        <motion.section 
          layout
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex w-full items-center bg-[#0b151a] px-6 py-10 sm:px-10 lg:w-1/2 lg:px-14 lg:py-12 relative overflow-y-auto max-h-[85vh] lg:max-h-none"
        >
          <div className="mx-auto w-full max-w-[400px]">
            {apiError && (
              <div role="alert" className="mb-5 rounded-md border border-red-400/25 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
                {apiError}
              </div>
            )}

            <AnimatePresence mode="wait">
              {isLogin ? (
                <motion.div
                  key="login-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-8">
                    <span className="mb-3 block text-[10px] font-bold tracking-[0.16em] text-cyan-400">CHÀO MỪNG TRỞ LẠI</span>
                    <h2 className="text-[30px] leading-tight font-semibold tracking-normal text-white">Đăng nhập CampusTour</h2>
                    <p className="mt-3 text-[13px] text-slate-400">
                      Chưa có tài khoản?{' '}
                      <button type="button" onClick={() => { setApiError(''); setIsLogin(false); }} className="font-semibold text-cyan-400 cursor-pointer no-underline hover:text-cyan-300 hover:underline">
                        Tạo tài khoản
                      </button>
                    </p>
                  </div>

                  <form onSubmit={handleSubmitLogin(onLoginSubmit)} className="flex flex-col gap-4" noValidate>
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                      Tên đăng nhập
                      <span className="relative flex items-center">
                        <UserRound className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                        <input
                          {...registerLogin('username', { required: 'Vui lòng nhập tên đăng nhập' })}
                          autoComplete="username"
                          placeholder="Nhập tên đăng nhập"
                          aria-invalid={Boolean(errorsLogin.username)}
                          className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-4 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errorsLogin.username ? 'border-red-400/60' : 'border-[#2b3941]'}`}
                        />
                      </span>
                      {errorsLogin.username && <span className="text-[11px] font-normal text-red-300">{errorsLogin.username.message}</span>}
                    </label>

                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                      Mật khẩu
                      <span className="relative flex items-center">
                        <LockKeyhole className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          {...registerLogin('password', { required: 'Vui lòng nhập mật khẩu' })}
                          autoComplete="current-password"
                          placeholder="Nhập mật khẩu"
                          aria-invalid={Boolean(errorsLogin.password)}
                          className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-10 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errorsLogin.password ? 'border-red-400/60' : 'border-[#2b3941]'}`}
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
                      {errorsLogin.password && <span className="text-[11px] font-normal text-red-300">{errorsLogin.password.message}</span>}
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmittingLogin}
                      className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-cyan-400 px-5 text-[13px] font-bold text-[#071014] shadow-[0_8px_20px_rgba(34,211,238,0.15)] transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      <span>{isSubmittingLogin ? 'Đang đăng nhập...' : 'Đăng nhập'}</span>
                      {!isSubmittingLogin && <ArrowRight size={17} />}
                    </button>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="register-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-5">
                    <span className="mb-2 block text-[10px] font-bold tracking-[0.16em] text-cyan-400">KHÁM PHÁ MỚI</span>
                    <h2 className="text-[26px] leading-tight font-semibold tracking-normal text-white">Tạo tài khoản</h2>
                    <p className="mt-2 text-[12.5px] text-slate-400">
                      Đã có tài khoản?{' '}
                      <button type="button" onClick={() => { setApiError(''); setIsLogin(true); }} className="font-semibold text-cyan-400 cursor-pointer no-underline hover:text-cyan-300 hover:underline">
                        Đăng nhập ngay
                      </button>
                    </p>
                  </div>

                  <form onSubmit={handleSubmitSignup(onRegisterSubmit)} className="flex flex-col gap-3" noValidate>
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                      Tên đăng nhập
                      <span className="relative flex items-center">
                        <UserRound className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                        <input
                          {...registerSignup('username', { required: 'Vui lòng nhập tên đăng nhập' })}
                          placeholder="Chọn tên đăng nhập"
                          aria-invalid={Boolean(errorsSignup.username)}
                          className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-4 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errorsSignup.username ? 'border-red-400/60' : 'border-[#2b3941]'}`}
                        />
                      </span>
                      {errorsSignup.username && <span className="text-[11px] font-normal text-red-300">{errorsSignup.username.message}</span>}
                    </label>

                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                      Email
                      <span className="relative flex items-center">
                        <Mail className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                        <input
                          type="email"
                          {...registerSignup('email', { 
                            required: 'Vui lòng nhập email',
                            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email không hợp lệ' }
                          })}
                          placeholder="Nhập email của bạn"
                          aria-invalid={Boolean(errorsSignup.email)}
                          className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-4 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errorsSignup.email ? 'border-red-400/60' : 'border-[#2b3941]'}`}
                        />
                      </span>
                      {errorsSignup.email && <span className="text-[11px] font-normal text-red-300">{errorsSignup.email.message}</span>}
                    </label>

                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                      Mật khẩu
                      <span className="relative flex items-center">
                        <LockKeyhole className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          {...registerSignup('password', { 
                            required: 'Vui lòng nhập mật khẩu',
                            minLength: { value: 6, message: 'Mật khẩu phải từ 6 ký tự' }
                          })}
                          placeholder="Nhập mật khẩu (từ 6 ký tự)"
                          aria-invalid={Boolean(errorsSignup.password)}
                          className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-10 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errorsSignup.password ? 'border-red-400/60' : 'border-[#2b3941]'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          className="absolute right-2 grid h-8 w-8 cursor-pointer place-items-center border-0 bg-transparent text-slate-500 transition-colors hover:text-cyan-400"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                      {errorsSignup.password && <span className="text-[11px] font-normal text-red-300">{errorsSignup.password.message}</span>}
                    </label>

                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-200">
                      Xác nhận mật khẩu
                      <span className="relative flex items-center">
                        <LockKeyhole className="pointer-events-none absolute left-3.5 text-slate-500" size={16} />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          {...registerSignup('confirmPassword', { 
                            required: 'Vui lòng xác nhận mật khẩu',
                            validate: (val) => watchSignup('password') === val || 'Mật khẩu không khớp'
                          })}
                          placeholder="Nhập lại mật khẩu"
                          aria-invalid={Boolean(errorsSignup.confirmPassword)}
                          className={`h-10 w-full rounded-lg border bg-[#111c22] py-2 pr-10 pl-10 text-[13px] text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${errorsSignup.confirmPassword ? 'border-red-400/60' : 'border-[#2b3941]'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((visible) => !visible)}
                          className="absolute right-2 grid h-8 w-8 cursor-pointer place-items-center border-0 bg-transparent text-slate-500 transition-colors hover:text-cyan-400"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </span>
                      {errorsSignup.confirmPassword && <span className="text-[11px] font-normal text-red-300">{errorsSignup.confirmPassword.message}</span>}
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmittingSignup}
                      className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-cyan-400 px-5 text-[13px] font-bold text-[#071014] shadow-[0_8px_20px_rgba(34,211,238,0.15)] transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      <span>{isSubmittingSignup ? 'Đang xử lý...' : 'Đăng ký ngay'}</span>
                      {!isSubmittingSignup && <ArrowRight size={17} />}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="my-6 flex items-center gap-3 text-[9px] font-semibold tracking-[0.12em] text-slate-600">
              <span className="h-px flex-1 bg-[#24323a]" />
              SMART CAMPUS ACCESS
              <span className="h-px flex-1 bg-[#24323a]" />
            </div>

            <p className="flex items-center justify-center gap-2 text-center text-[10px] text-slate-500">
              <ShieldCheck size={14} className="text-cyan-500" /> Phiên làm việc được bảo vệ an toàn.
            </p>
          </div>
        </motion.section>
      </motion.div>
    </main>
  );
}
