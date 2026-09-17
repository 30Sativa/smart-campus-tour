import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { apiClient, ApiError } from '../api/client'
import { useAuthStore } from '../stores/auth-store'
import { landingPathAfterLogin } from './access'
import { MockAuthError, mockLogin, type AuthResponse } from '../mocks/auth-mock'
import { USE_MOCK_API } from '../mocks/mock-mode'
import { AuthField, AuthPasswordField } from './AuthFields'

type LoginFormInputs = {
  username: string
  password: string
}

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInputs>({ mode: 'onTouched' })

  const [apiError, setApiError] = useState('')
  const alertRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((state) => state.setAuth)

  // A failed sign-in is announced and focused, so it is not a colour change a
  // keyboard or screen-reader user has to go hunting for.
  useEffect(() => {
    if (apiError) alertRef.current?.focus()
  }, [apiError])

  const onSubmit = async ({ username, password }: LoginFormInputs) => {
    try {
      setApiError('')
      const response = USE_MOCK_API
        ? await mockLogin(username, password)
        : await apiClient<AuthResponse>('/api/auth/login', {
            method: 'POST',
            json: { username, password },
            // The refresh token comes back as an HttpOnly cookie.
            credentials: 'include',
          })

      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role,
      })

      // The role decides the console; a remembered destination only wins when
      // it is inside that same area (see `landingPathAfterLogin`).
      const from = (location.state as { from?: string })?.from
      navigate(landingPathAfterLogin(response.role, from), { replace: true })
    } catch (error) {
      if (error instanceof MockAuthError) setApiError(error.message)
      else if (error instanceof ApiError && error.status === 401) setApiError('Sai tên đăng nhập hoặc mật khẩu.')
      else setApiError('Không đăng nhập được. Kiểm tra kết nối tới máy chủ rồi thử lại.')
    }
  }

  return (
    <>
      <h1 className="auth-title">Chào mừng bạn trở lại</h1>
      <p className="auth-lead">Đăng nhập để tiếp tục hành trình CampusTour.</p>

      {apiError && (
        <div ref={alertRef} role="alert" tabIndex={-1} className="auth-alert">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
        <AuthField
          label="Tên đăng nhập"
          autoComplete="username"
          placeholder="vd: operator"
          disabled={isSubmitting}
          error={errors.username?.message}
          {...register('username', { required: 'Vui lòng nhập tên đăng nhập' })}
        />

        <AuthPasswordField
          label="Mật khẩu"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register('password', { required: 'Vui lòng nhập mật khẩu' })}
        />

        <button type="submit" className="auth-submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <span className="auth-spinner" aria-hidden="true" />}
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>

      <p className="auth-switch">
        Chưa có tài khoản? <Link to="/register" viewTransition>Đăng ký</Link>
      </p>
    </>
  )
}
