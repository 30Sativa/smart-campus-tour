import { useEffect, useState } from 'react'
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
    title: 'Mỗi chuyến tham quan đều có người dõi theo.',
    lead: 'Robot dẫn đường, lịch tham quan và tình trạng khuôn viên nằm chung một nơi.',
  },
} as const

/** Long enough to cover the slowest entrance step; see --motion-enter in auth.css. */
const ENTRANCE_MS = 700

/**
 * The shell both auth pages share, so sign-in and sign-up cannot drift apart.
 *
 * It is a *route layout*: `/login` and `/register` render into the `Outlet`, so
 * moving between them leaves the photograph, the panel and the brand mounted.
 * That is what lets the switch read as one screen changing its content rather
 * than two pages replacing each other, and it is the only reason the routing
 * shape changed.
 *
 * The two routes sit on opposite sides: signing in puts the form on the right,
 * signing up puts it on the left. `data-side` is the only thing that says so;
 * the grid reads it, and the view transition turns the reordering into a slide
 * instead of a jump.
 *
 * The root carries `.lp`, which is where the palette, the font and the
 * light/dark switch come from: auth reads the landing page's language rather
 * than hard-coding a second one.
 *
 * The photograph is decorative, so it is `aria-hidden` and holds nothing
 * focusable. Below 1024px it is dropped rather than stacked: a decorative image
 * above the form would push the fields off a phone screen.
 */
export function AuthLayout() {
  const { pathname } = useLocation()
  const onRegister = pathname === '/register'
  const visual = onRegister ? VISUAL['/register'] : VISUAL.default

  /**
   * The staggered entrance belongs to arriving at auth, not to every route
   * change. Once it has played, the flag goes off and the sign-in/sign-up
   * switch is left to the view transition, so the two never run at once.
   */
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setEntering(false), ENTRANCE_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <main
      className="lp auth"
      data-entrance={entering ? 'on' : 'off'}
      data-side={onRegister ? 'form-left' : 'form-right'}
    >
      <section className="auth-visual" aria-hidden="true">
        <img src="/images/hero-campus.jpg" alt="" className="auth-visual__img" />
        <div className="auth-visual__scrim" />
        <div className="auth-visual__inner">
          <div>
            <p className="auth-visual__title">{visual.title}</p>
            <p className="auth-visual__lead">{visual.lead}</p>
          </div>
        </div>
      </section>

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
        </div>
      </div>

      {/* Development only. A production bundle drops this branch entirely, so
          no visitor ever sees build state in the sign-in UI. The equivalent
          warning for a production build that still runs on mocks goes to the
          console from `mock-mode.ts`. It is deliberately outside every
          animated group: build state does not get an entrance. */}
      {import.meta.env.DEV && (
        <p className="auth-devbadge" data-dev-only="true">
          DEV: chạy trên dữ liệu mẫu. {MOCK_ACCOUNTS_HINT}.
        </p>
      )}
    </main>
  )
}
