import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { apiClient, ApiError } from '../api/client'
import { useAuthStore } from '../stores/auth-store'
import { MockAuthError, mockRegister, type AuthResponse } from '../mocks/auth-mock'
import { USE_MOCK_API } from '../mocks/mock-mode'
import { AuthField, AuthPasswordField } from './AuthFields'

type RegisterFormInputs = {
  username: string
  password: string
  confirmPassword: string
}

/**
 * Sign-up screen.
 *
 * There is no `/api/auth/register` yet, so with `USE_MOCK_API` on this runs the
 * labelled mock and the page says plainly that no account is being created. The
 * fields are the ones the mock and the login contract already use, `username`
 * and `password`; `confirmPassword` is a client-side check and is never sent.
 */
export default function RegisterPage() {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInputs>({ mode: 'onTouched' })

  const [apiError, setApiError] = useState('')
  const alertRef = useRef<HTMLDivElement>(null)

  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  useEffect(() => {
    if (apiError) alertRef.current?.focus()
  }, [apiError])

  const onSubmit = async ({ username, password }: RegisterFormInputs) => {
    try {
      setApiError('')
      const response = USE_MOCK_API
        ? await mockRegister(username, password)
        : await apiClient<AuthResponse>('/api/auth/register', {
            method: 'POST',
            json: { username, password },
            credentials: 'include',
          })

      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role,
      })
      navigate('/', { replace: true })
    } catch (error) {
      if (error instanceof MockAuthError) setApiError(error.message)
      else if (error instanceof ApiError && error.status === 409) setApiError('Tên đăng nhập này đã có người dùng.')
      else setApiError('Không tạo được tài khoản. Kiểm tra kết nối tới máy chủ rồi thử lại.')
    }
  }

  return (
    <>
      <h1 className="auth-title">Tạo tài khoản</h1>
      <p className="auth-lead">Đăng ký để đặt tour và quản lý hành trình của bạn.</p>

      {apiError && (
        <div ref={alertRef} role="alert" tabIndex={-1} className="auth-alert">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
        <AuthField
          label="Tên đăng nhập"
          autoComplete="username"
          placeholder="Tên bạn dùng để đăng nhập"
          disabled={isSubmitting}
          error={errors.username?.message}
          {...register('username', {
            required: 'Vui lòng nhập tên đăng nhập',
            minLength: { value: 3, message: 'Tên đăng nhập cần ít nhất 3 ký tự' },
          })}
        />

        <AuthPasswordField
          label="Mật khẩu"
          autoComplete="new-password"
          placeholder="Ít nhất 6 ký tự"
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register('password', {
            required: 'Vui lòng nhập mật khẩu',
            minLength: { value: 6, message: 'Mật khẩu cần ít nhất 6 ký tự' },
          })}
        />

        <AuthPasswordField
          label="Xác nhận mật khẩu"
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu"
          disabled={isSubmitting}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', {
            required: 'Vui lòng nhập lại mật khẩu',
            validate: (value) => value === getValues('password') || 'Mật khẩu nhập lại chưa khớp',
          })}
        />

        <button type="submit" className="auth-submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <span className="auth-spinner" aria-hidden="true" />}
          {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
        </button>
      </form>

      <p className="auth-switch">
        Đã có tài khoản? <Link to="/login" viewTransition>Đăng nhập</Link>
      </p>
    </>
  )
}
