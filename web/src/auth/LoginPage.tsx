import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { ArrowRight, CircleAlert } from 'lucide-react'

import { ApiError, login } from '../api/client'

import { ApiError } from '../api/client'

import { useAuthStore } from '../stores/auth-store'
import { landingPathAfterLogin } from './access'
import { AuthField, AuthPasswordField } from './AuthFields'
import { prepareSplitExit } from './split-exit'

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
  const [invalidCredentials, setInvalidCredentials] = useState(false)
  const submittingRef = useRef(false)
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
      setInvalidCredentials(false)
      const response = await login(username, password)

      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role,
      })

      // The role decides the console; a remembered destination only wins when
      // it is inside that same area (see `landingPathAfterLogin`).
      const from = (location.state as { from?: string })?.from
      // The screen splits open onto the destination (see `split-exit.ts`).
      const split = prepareSplitExit()
      navigate(landingPathAfterLogin(response.role, from), { replace: true, viewTransition: split })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setInvalidCredentials(true)
        setApiError('Tên đăng nhập hoặc mật khẩu không chính xác.')
      } else if (error instanceof ApiError && error.status === 403) {
        setApiError('Tài khoản không thể truy cập hệ thống. Vui lòng liên hệ quản trị viên để được hỗ trợ.')
      } else if (error instanceof TypeError) {
        setApiError('Không thể kết nối đến hệ thống. Vui lòng thử lại.')
      } else {
        setApiError('Không đăng nhập được. Vui lòng thử lại sau ít phút.')
      }
    }
  }

  return (
    <>
      <p className="auth-form-eyebrow"><span /> CỔNG TRẢI NGHIỆM CAMPUS</p>
      <h1 className="auth-title" aria-label="Chào mừng bạn trở lại"><span>Chào mừng bạn </span><span>trở lại</span></h1>
      <p className="auth-lead">Đăng nhập để tiếp tục hành trình cùng CampusTour.</p>

      {apiError && (
        <div id="login-error" ref={alertRef} role="alert" tabIndex={-1} className="auth-alert auth-alert--login">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{apiError}</span>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          // Lock before validation too: two rapid submits must not start two
          // handleSubmit cycles that can reset each other's loading state.
          if (submittingRef.current) return
          submittingRef.current = true
          void handleSubmit(onSubmit)(event).finally(() => { submittingRef.current = false })
        }}
        className="auth-form"
        aria-busy={isSubmitting}
        noValidate
      >
        <AuthField
          label="Tên đăng nhập"
          autoComplete="username"
          placeholder="Nhập tên đăng nhập"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalidCredentials || undefined}
          aria-describedby={apiError ? 'login-error' : undefined}
          disabled={isSubmitting}
          error={errors.username?.message}
          {...register('username', {
            required: 'Vui lòng nhập tên đăng nhập',
            pattern: { value: /^\P{White_Space}+$/u, message: 'Tên đăng nhập không được chứa khoảng trắng.' },
            maxLength: { value: 100, message: 'Tên đăng nhập tối đa 100 ký tự.' },
          })}
        />

        <AuthPasswordField
          label="Mật khẩu"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          aria-invalid={invalidCredentials || undefined}
          aria-describedby={apiError ? 'login-error' : undefined}
          disabled={isSubmitting}
          error={errors.password?.message}
          {...register('password', { required: 'Vui lòng nhập mật khẩu' })}
        />

        <button type="submit" className="auth-submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <span className="auth-spinner" aria-hidden="true" />}
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          {!isSubmitting && <ArrowRight size={19} strokeWidth={2} aria-hidden="true" />}
        </button>
      </form>

    </>
  )
}
