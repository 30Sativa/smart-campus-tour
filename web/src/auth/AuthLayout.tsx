import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { MOCK_ACCOUNTS_HINT } from '../mocks/auth-mock'
import '../features/landing/landing.css'
import './auth.css'
import './auth-home.css'

/** Copy over the photograph. Short, plain, no technical vocabulary. */
const VISUAL = {
  kicker: 'Tham quan khuôn viên từ xa',
  title: 'Khám phá khuôn viên, tới tận lớp học.',
  lead: 'Robot tự hành đưa cả lớp đi qua từng điểm tham quan bằng một livestream chung, bản đồ 2D và trợ lý AI riêng.',
} as const

const META = [
  { value: '≥ 3', label: 'Điểm tham quan' },
  { value: '≈ 30′', label: 'Mỗi buổi' },
  { value: '1', label: 'Livestream chung' },
]

/** Long enough to cover the slowest entrance step; see --motion-enter in auth.css. */
const ENTRANCE_MS = 700

/** The lime robot mark of the home page header. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={32} height={32} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#bde74e" />
      <rect x="7" y="10" width="18" height="12" rx="4" fill="#1c1c1c" />
      <circle cx="12.5" cy="16" r="2" fill="#bde74e" />
      <circle cx="19.5" cy="16" r="2" fill="#bde74e" />
      <path d="M16 10V6.5" stroke="#1c1c1c" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5.5" r="1.8" fill="#1c1c1c" />
    </svg>
  )
}

/**
 * The shell both auth pages share, so sign-in and sign-up cannot drift apart.
 *
 * It is a *route layout* for `/login`. Self sign-up (`/register`) was removed
 * with the Visitor role on 2026-09-24; Admin issues accounts.
 *
 * Visual language (`auth-home.css`, class `ah`) follows the public home page:
 * ink photograph panel with a lime kicker and large capitals, cream ground,
 * pill button. After a successful sign-in the whole screen splits in two and
 * slides apart onto the destination (`split-exit.ts`).
 *
 * The photograph is decorative, so it is `aria-hidden` and holds nothing
 * focusable. On phones it is dropped rather than stacked.
 */
export function AuthLayout() {
  const visual = VISUAL

  const [entering, setEntering] = useState(true)
  useEffect(() => {
    const id = window.setTimeout(() => setEntering(false), ENTRANCE_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <main
      className="lp auth ah"
      data-page="login"
      data-entrance={entering ? 'on' : 'off'}
      data-side="form-right"
    >
      <section className="auth-visual" aria-hidden="true">
        <img src="/images/login-bg.jpg" alt="" className="auth-visual__img" fetchPriority="high" />
        <div className="auth-visual__scrim" />
        <div className="auth-visual__brand">
          <BrandMark />
          <span>CampusTour <span className="auth-visual__brand-sub">DT-AMR</span></span>
        </div>
        <div className="auth-visual__inner">
          <div>
            <p className="ah-kicker">{visual.kicker}</p>
            <p className="auth-visual__title">{visual.title}</p>
            <p className="auth-visual__lead">{visual.lead}</p>
            <div className="ah-meta">
              {META.map((item) => (
                <div key={item.label}><b>{item.value}</b>{item.label}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="auth-panel">
        <div className="auth-col">
          <Link to="/" className="auth-brand">
            <BrandMark className="auth-brand__mark" />
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

      {/* Development only; outside every animated group. */}
      {import.meta.env.DEV && (
        <p className="auth-devbadge" data-dev-only="true">
          DEV: chạy trên dữ liệu mẫu. {MOCK_ACCOUNTS_HINT}.
        </p>
      )}
    </main>
  )
}
