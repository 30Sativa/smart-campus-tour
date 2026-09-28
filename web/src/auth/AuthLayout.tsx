import { Link, Outlet, useLocation } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { MOCK_ACCOUNTS_HINT } from '../mocks/auth-mock'
import '../features/landing/landing.css'
import './auth.css'

/** Copy over the photograph, per route. One sentence, no technical vocabulary. */
const VISUAL = {
  '/register': {
    title: 'Bắt đầu hành trình khám phá khuôn viên.',
    lead: 'Một tài khoản để đặt tour và theo dõi lịch tham quan của bạn.',
  },
  default: {
    title: 'Khám phá khuôn viên. Trải nghiệm tương lai.',
    lead: 'Tham quan cùng robot tự hành, khám phá qua bản đồ trực quan và kết nối với khuôn viên thông minh.',
  },
} as const

/**
 * The shell both auth pages share, so sign-in and sign-up cannot drift apart.
 *
 * It is a *route layout*: `/login` and `/register` render into the `Outlet`, so
 * moving between them leaves the photograph and the brand mounted and only the
 * form changes.
 *
 * Split screen: the form column on the left, one full-bleed campus photograph
 * on the right (from `lg`). The photograph is decorative, so it is
 * `aria-hidden` and holds nothing focusable; below `lg` it is dropped rather
 * than stacked above the fields.
 *
 * The root carries `.lp`, which is where the palette, the font and the
 * light/dark switch come from.
 */
export function AuthLayout() {
  const { pathname } = useLocation()
  const onRegister = pathname === '/register'
  const visual = onRegister ? VISUAL['/register'] : VISUAL.default

  return (
    <main className="lp auth" data-page={onRegister ? 'register' : 'login'}>
      <div className="auth-panel">
        <div className="auth-col">
          <Link to="/" className="auth-brand">
            <img className="auth-brand__mark" src="/images/logo.png" alt="" width={40} height={40} />
            <span>CampusTour</span>
            <span className="auth-brand__sub">DT-AMR</span>
          </Link>
          <div className="auth-body">
            <Outlet />
          </div>
          <Link to="/" className="auth-back">
            <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
            Về trang chủ
          </Link>
          <p className="auth-footer">© {new Date().getFullYear()} Smart Campus Tour</p>
        </div>
      </div>

      <section className="auth-visual" aria-hidden="true">
        <img src={onRegister ? '/images/hero-campus.jpg' : '/images/login-bg.jpg'} alt="" className="auth-visual__img" fetchPriority="high" />
        <div className="auth-visual__scrim" />
        <div className="auth-visual__inner">
          <p className="auth-visual__title">{visual.title}</p>
          <p className="auth-visual__lead">{visual.lead}</p>
        </div>
      </section>

      {/* Development only. A production bundle drops this branch entirely, so
          no visitor ever sees build state in the sign-in UI. The equivalent
          warning for a production build that still runs on mocks goes to the
          console from `mock-mode.ts`. */}
      {import.meta.env.DEV && (
        <p className="auth-devbadge" data-dev-only="true">
          DEV: chạy trên dữ liệu mẫu. {MOCK_ACCOUNTS_HINT}.
        </p>
      )}
    </main>
  )
}
