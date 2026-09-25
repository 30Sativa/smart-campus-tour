import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { ArrowRight, Check, CircleAlert, LockKeyhole, UserRound } from 'lucide-react'
import { ApiError } from '../api/client'
import { useAuthStore } from '../stores/auth-store'
import { landingPathAfterLogin } from './access'
import { MockAuthError, mockLogin } from '../mocks/auth-mock'
import { AuthField, AuthPasswordField } from './AuthFields'
import { playSplitExit } from './split-exit'

/** How long the "Đăng nhập thành công" state shows before the screen splits. */
const SUCCESS_HOLD_MS = 450

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
  const [succeeded, setSucceeded] = useState(false)
  const submittingRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
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
      const response = await mockLogin(username, password)

      setAuth(response.accessToken, {
        userId: response.userId,
        username: response.username,
        role: response.role,
      })

      // The role decides the console; a remembered destination only wins when
      // it is inside that same area (see `landingPathAfterLogin`).
      const from = (location.state as { from?: string })?.from
      const destination = landingPathAfterLogin(response.role, from)
      const go = () => navigate(destination, { replace: true })

      // Inside the auth layout: show success, then split the screen open onto
      // the destination. Anywhere else (tests, reuse) go straight there.
      const root = formRef.current?.closest('.auth') ?? null
      if (!root) {
        go()
        return
      }
      setSucceeded(true)
      await new Promise((resolve) => window.setTimeout(resolve, SUCCESS_HOLD_MS))
      playSplitExit(root, go)
    } catch (error) {
      if (error instanceof MockAuthError || (error instanceof ApiError && error.status === 401)) {
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
      <p className="ah-kicker ah-kicker--panel">Cổng đăng nhập</p>
      <h1 className="auth-title">Chào mừng bạn trở lại</h1>
      <p className="auth-lead">Admin, Staff, đại diện trường và khách tham quan dùng chung cổng này. Hệ thống tự đưa bạn tới đúng khu vực.</p>

      {apiError && (
        <div id="login-error" ref={alertRef} role="alert" tabIndex={-1} className="auth-alert auth-alert--login">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{apiError}</span>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault()
          // Lock before validation too: two rapid submits must not start two
          // handleSubmit cycles that can reset each other's loading state.
          if (submittingRef.current || succeeded) return
          submittingRef.current = true
          void handleSubmit(onSubmit)(event).finally(() => { submittingRef.current = false })
        }}
        className="auth-form"
        aria-busy={isSubmitting || succeeded}
        noValidate
      >
        <AuthField
          label="Tên đăng nhập"
          autoComplete="username"
          placeholder="Nhập tên đăng nhập"
          icon={<UserRound size={19} />}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalidCredentials || undefined}
          aria-describedby={apiError ? 'login-error' : undefined}
          disabled={isSubmitting || succeeded}
          error={errors.username?.message}
          {...register('username', { required: 'Vui lòng nhập tên đăng nhập' })}
        />

        <AuthPasswordField
          label="Mật khẩu"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          icon={<LockKeyhole size={19} />}
          aria-invalid={invalidCredentials || undefined}
          aria-describedby={apiError ? 'login-error' : undefined}
          disabled={isSubmitting || succeeded}
          error={errors.password?.message}
          {...register('password', { required: 'Vui lòng nhập mật khẩu' })}
        />

        <button
          type="submit"
          className={succeeded ? 'auth-submit is-success' : 'auth-submit'}
          disabled={isSubmitting || succeeded}
          aria-busy={isSubmitting}
        >
          {isSubmitting && !succeeded && <span className="auth-spinner" aria-hidden="true" />}
          {succeeded ? 'Đăng nhập thành công' : isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          {succeeded ? <Check size={18} aria-hidden="true" /> : !isSubmitting && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </form>

      <p className="auth-switch">
        Chưa có tài khoản? Admin cấp tài khoản cho Staff và đại diện trường. Học sinh vào tour bằng đường dẫn và mã đoàn, không cần đăng nhập.
      </p>
    </>
  )
}
