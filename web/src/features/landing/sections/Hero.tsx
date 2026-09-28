import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '../../../stores/auth-store'
import { homePathForRole, isAdminRole, isStaffRole } from '../../../auth/roles'

/** Public landing hero with a generated campus illustration and live HTML actions. */
export function Hero() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)

  return (
    <section className="lp-hero" id="hero">
      <div className="lp-hero__media" id="hero-media">
        <img src="/images/home-3d/hero-smartbus.png" alt="Robot SmartBus di chuyển trong khuôn viên đại học, minh họa 3D" fetchPriority="high" />
      </div>
      <div className="lp-hero__scrim" aria-hidden="true" />

      <div className="lp-hero__body lp-ctn">
        <div className="lp-hero__copy">
          <span className="lp3-hero-kicker">CAMPUS TOUR · TRẢI NGHIỆM TỪ XA</span>
          <h1 className="lp-display" id="hero-title">
            <span className="lp3-hero-line">Khám phá campus</span>
            <span className="lp3-hero-line">từ bất cứ đâu<span className="lp3-title-accent">.</span></span>
          </h1>
          <p className="lp-lead" id="hero-lead">
            Một robot dẫn đường. Cả lớp cùng trải nghiệm trực tiếp trên trình duyệt.
          </p>
          <div className="lp-hero__cta" id="hero-cta">
            {/* Signed-in accounts keep the direct route into their own area. */}
            {isAuthenticated ? (
              <Link to={homePathForRole(user?.role)} className="lp-btn lp-btn--solid lp-btn--lg">
                {isAdminRole(user?.role)
                  ? 'Vào trang quản trị'
                  : isStaffRole(user?.role)
                    ? 'Vào trang điều hành'
                    : 'Tiếp tục hành trình'}
                <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
              </Link>
            ) : (
              <a href="#quy-trinh" className="lp-btn lp-btn--solid lp-btn--lg">
                Xem hành trình
                <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
              </a>
            )}
            <a href="#gioi-thieu" className="lp-btn lp-btn--onmedia">
              Tìm hiểu hệ thống
            </a>
          </div>
          <span className="lp3-hero-footnote">CÔNG NGHỆ KẾT NỐI CON NGƯỜI VỚI NHỮNG CHÂN TRỜI MỚI</span>
        </div>
      </div>
    </section>
  )
}
