import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/auth-store';
import { motion } from 'motion/react';

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm();
  const [apiError, setApiError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore(state => state.setAuth);

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

  const onSubmit = async (data: RegisterFormInputs) => {
    try {
      setApiError('');
      const response = await apiClient<AuthResponse>('/api/auth/register', {
        method: 'POST',
        json: { username: data.username, password: data.password }
      });
      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role
      });
      navigate('/tours');
    } catch (err) {
      try {
        const body = JSON.parse((err as { body?: string }).body || '{}');
        setApiError(body.message || 'Đăng ký thất bại.');
      } catch {
        setApiError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
      }
    }
  };

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 0',
      fontFamily: "'Inter', -apple-system, sans-serif",
      overflowX: 'hidden',
      overflowY: 'auto',
    }}>
      {/* Cinematic Background */}
      <video
        src="/videos/campus-tour-hero.mp4"
        poster="/images/hero-campus.jpg"
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 70%',
          zIndex: 0,
        }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(7,16,20,0.6) 0%, rgba(7,16,20,0.3) 50%, rgba(7,16,20,0.9) 100%)',
        zIndex: 1,
      }} />

      {/* Glassmorphism Form Container */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: '440px',
          margin: '0 24px',
          background: 'rgba(10, 15, 20, 0.45)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '48px 40px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
        className="auth-glass-panel"
      >
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{
              width: '44px', height: '44px',
              background: 'var(--accent)',
              borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26C16.81 13.47 18 11.38 18 9c0-3.87-3.13-7-6-7z" fill="#000"/>
                <circle cx="12" cy="9" r="2.5" fill="#fff"/>
              </svg>
            </div>
          </Link>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h2 style={{
            color: '#fff',
            fontSize: '24px',
            fontWeight: '600',
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
          }}>Tạo tài khoản mới</h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '14px', margin: 0 }}>
            Tham gia vào trải nghiệm Smart Campus
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <input
              {...register('username', { required: 'Vui lòng nhập tên đăng nhập' })}
              placeholder="Tên đăng nhập"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255, 255, 255, 0.03)',
                border: errors.username ? '1px solid rgba(248,113,113,0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '14px 20px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
              onFocus={e => { e.target.style.background = 'rgba(255, 255, 255, 0.07)'; e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.target.style.background = 'rgba(255, 255, 255, 0.03)'; e.target.style.borderColor = errors.username ? 'rgba(248,113,113,0.5)' : 'rgba(255, 255, 255, 0.1)'; }}
            />
            {errors.username && <p style={{ color: '#f87171', fontSize: '12px', margin: '6px 0 0', paddingLeft: '4px' }}>{errors.username.message as string}</p>}
          </div>
          
          <div>
            <input
              type="email"
              {...register('email', { required: 'Vui lòng nhập email hợp lệ' })}
              placeholder="Email của bạn"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255, 255, 255, 0.03)',
                border: errors.email ? '1px solid rgba(248,113,113,0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '14px 20px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
              onFocus={e => { e.target.style.background = 'rgba(255, 255, 255, 0.07)'; e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.target.style.background = 'rgba(255, 255, 255, 0.03)'; e.target.style.borderColor = errors.email ? 'rgba(248,113,113,0.5)' : 'rgba(255, 255, 255, 0.1)'; }}
            />
            {errors.email && <p style={{ color: '#f87171', fontSize: '12px', margin: '6px 0 0', paddingLeft: '4px' }}>{errors.email.message as string}</p>}
          </div>

          <div>
            <input
              type="password"
              {...register('password', { required: 'Vui lòng nhập mật khẩu', minLength: { value: 6, message: 'Mật khẩu ít nhất 6 ký tự' } })}
              placeholder="Mật khẩu"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255, 255, 255, 0.03)',
                border: errors.password ? '1px solid rgba(248,113,113,0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '14px 20px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
              onFocus={e => { e.target.style.background = 'rgba(255, 255, 255, 0.07)'; e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.target.style.background = 'rgba(255, 255, 255, 0.03)'; e.target.style.borderColor = errors.password ? 'rgba(248,113,113,0.5)' : 'rgba(255, 255, 255, 0.1)'; }}
            />
            {errors.password && <p style={{ color: '#f87171', fontSize: '12px', margin: '6px 0 0', paddingLeft: '4px' }}>{errors.password.message as string}</p>}
          </div>
          
          <div>
            <input
              type="password"
              {...register('confirmPassword', { 
                required: 'Vui lòng xác nhận mật khẩu',
                validate: (val) => {
                  if (watch('password') != val) {
                    return "Mật khẩu không khớp";
                  }
                }
              })}
              placeholder="Xác nhận mật khẩu"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255, 255, 255, 0.03)',
                border: errors.confirmPassword ? '1px solid rgba(248,113,113,0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '14px 20px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.3s ease',
              }}
              onFocus={e => { e.target.style.background = 'rgba(255, 255, 255, 0.07)'; e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { e.target.style.background = 'rgba(255, 255, 255, 0.03)'; e.target.style.borderColor = errors.confirmPassword ? 'rgba(248,113,113,0.5)' : 'rgba(255, 255, 255, 0.1)'; }}
            />
            {errors.confirmPassword && <p style={{ color: '#f87171', fontSize: '12px', margin: '6px 0 0', paddingLeft: '4px' }}>{errors.confirmPassword.message as string}</p>}
          </div>

          {apiError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: '12px',
              padding: '12px 16px',
            }}>
              <span style={{ color: '#f87171', fontSize: '13px' }}>{apiError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              background: isSubmitting ? 'rgba(255,255,255,0.5)' : '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '14px',
              padding: '16px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              marginTop: '4px',
            }}
            onMouseEnter={e => { if (!isSubmitting) (e.target as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.transform = 'translateY(0)'; }}
          >
            {isSubmitting ? 'Đang xử lý...' : 'Đăng ký ngay'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '28px' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
            Đã có tài khoản?{' '}
            <Link to="/login" style={{ color: '#fff', textDecoration: 'none', fontWeight: '500', transition: 'color 0.2s' }} onMouseEnter={e => (e.target as HTMLAnchorElement).style.color = 'var(--accent)'} onMouseLeave={e => (e.target as HTMLAnchorElement).style.color = '#fff'}>
              Đăng nhập
            </Link>
          </p>
          <Link to="/" style={{
            display: 'inline-block',
            color: 'rgba(255,255,255,0.35)',
            fontSize: '12px',
            textDecoration: 'none',
            marginTop: '24px',
            transition: 'color 0.2s',
          }} onMouseEnter={e => (e.target as HTMLAnchorElement).style.color = '#fff'} onMouseLeave={e => (e.target as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.35)'}>
            Quay lại trang chủ
          </Link>
        </div>
      </motion.div>

      <style>{`
        @media (max-width: 480px) {
          .auth-glass-panel {
            padding: 32px 24px !important;
            border-radius: 20px !important;
            margin: 0 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
