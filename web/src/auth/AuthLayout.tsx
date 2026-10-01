import { Link, Outlet } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import '../features/landing/landing.css'
import './auth.css'

const VISUAL = {

  title: 'Khám phá khuôn viên từ một điểm chạm.',
  lead: 'Cùng SmartBus bắt đầu hành trình tham quan campus theo một cách mới.',

  '/register': {
    title: 'Bắt đầu hành trình khám phá khuôn viên.',
    lead: 'Một tài khoản để đặt tour và theo dõi lịch tham quan của bạn.',
  },
  default: {
    title: 'Khám phá khuôn viên từ một điểm chạm.',
    lead: 'Cùng SmartBus bắt đầu hành trình tham quan campus theo một cách mới.',
  },

} as const

/**
 * The sign-in shell shares the brand, photograph and theme tokens with the
 * public landing page.
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
  return (
    <main className="lp auth" data-page="login">
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

        <img src="/images/login-smartbus.png" alt="" className="auth-visual__img" fetchPriority="high" />
        <div className="auth-visual__scrim" />
        <div className="auth-visual__inner">
          <p className="auth-visual__eyebrow">CAMPUS TOUR <span /> SMARTBUS</p>
          <p className="auth-visual__title">{VISUAL.title}</p>
          <p className="auth-visual__lead">{VISUAL.lead}</p>
        </div>
        <p className="auth-visual__note">01 / BẮT ĐẦU HÀNH TRÌNH</p>

        <img src={onRegister ? '/images/hero-campus.jpg' : '/images/login-smartbus.png'} alt="" className="auth-visual__img" fetchPriority="high" />
        <div className="auth-visual__scrim" />
        <div className="auth-visual__inner">
          {!onRegister && <p className="auth-visual__eyebrow">CAMPUS TOUR <span /> SMARTBUS</p>}
          <p className="auth-visual__title">{visual.title}</p>
          <p className="auth-visual__lead">{visual.lead}</p>
        </div>
        {!onRegister && <p className="auth-visual__note">01 / BẮT ĐẦU HÀNH TRÌNH</p>}

      </section>

      {/* Business fixtures remain visible during development; sign-in itself
          uses the backend. */}
      {import.meta.env.DEV && (
        <details className="auth-devbadge" data-dev-only="true">

          <summary>Dữ liệu nghiệp vụ mẫu</summary>
          <p>DEV: các màn nghiệp vụ chưa nối backend vẫn dùng dữ liệu mẫu.</p>

          <summary>Dữ liệu mẫu</summary>
          <p>DEV: chạy trên dữ liệu mẫu. {MOCK_ACCOUNTS_HINT}.</p>

        </details>
      )}
    </main>
  )
}
