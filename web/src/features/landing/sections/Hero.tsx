import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '../../../stores/auth-store'
import { homePathForRole, isAdminRole, isStaffRole } from '../../../auth/roles'
import { EXPERIENCE_HREF } from '../landing-content'

/**
 * Asymmetric split over full-bleed campus footage.
 *
 * Three text elements: a headline that balances onto two lines, one supporting
 * sentence, and the two actions. The copy is deliberately short here, because a
 * visitor decides whether this page is for them before reading a paragraph. A
 * staff member who is already signed in gets the operations door instead.
 */
export function Hero() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isStaff = isStaffRole(user?.role)

  return (
    <section className="lp-hero" id="hero">
      <div className="lp-hero__media" id="hero-media">
        <video
          src="/videos/home.mp4"
          poster="/images/hero-campus.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-label="Robot dẫn đường cho khách tham quan trong khuôn viên đại học lúc chiều tối"
        />
      </div>
      <div className="lp-hero__scrim" aria-hidden="true" />

      <div className="lp-hero__body lp-ctn">
        <div className="lp-hero__copy">
          <h1 className="lp-display" id="hero-title">
            Khám phá khuôn viên cùng robot tự hành
          </h1>
          <p className="lp-lead" id="hero-lead">
            Robot AMR dẫn đường, thuyết minh và đồng hành cùng bạn theo lộ trình có sẵn.
          </p>
          <div className="lp-hero__cta" id="hero-cta">
            {isAuthenticated && isStaff ? (
              <Link to={homePathForRole(user?.role)} className="lp-btn lp-btn--solid lp-btn--lg">
                {isAdminRole(user?.role) ? 'Vào trang quản trị' : 'Vào trang điều hành'}
                <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
              </Link>
            ) : (
              <Link to={EXPERIENCE_HREF} className="lp-btn lp-btn--solid lp-btn--lg">
                Trải nghiệm Campus Tour
                <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
              </Link>
            )}
            <a href="#quy-trinh" className="lp-btn lp-btn--onmedia">
              Xem cách hệ thống hoạt động
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
