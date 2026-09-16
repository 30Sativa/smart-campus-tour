import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '../../../stores/auth-store'
import { isStaffRole } from '../../../auth/roles'

/**
 * Asymmetric split over full-bleed footage: copy holds the left two thirds, the
 * campus footage carries the right. Four text elements at most, so the headline,
 * the one-sentence claim and the two actions all sit inside the first viewport.
 */
export function Hero() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const isStaff = isStaffRole(user?.role)

  return (
    <section className="lp-hero" id="hero">
      <div className="lp-hero__media" id="hero-media">
        <video
          src="/videos/campus-tour-hero.mp4"
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
            Tham quan khuôn viên cùng robot tự hành.
          </h1>
          <p className="lp-lead" id="hero-lead">
            Hướng dẫn viên robot, trợ lý AI đa ngôn ngữ và bản đồ khuôn viên 3D cập nhật theo thời gian thực.
          </p>
          <div className="lp-hero__cta" id="hero-cta">
            {isAuthenticated && isStaff ? (
              <Link to="/admin" className="lp-btn lp-btn--solid">
                Vào trang điều hành
                <ArrowRight size={17} strokeWidth={2} />
              </Link>
            ) : (
              <Link to="/login" className="lp-btn lp-btn--solid">
                Đăng nhập điều hành
                <ArrowRight size={17} strokeWidth={2} />
              </Link>
            )}
            <a href="#tinh-nang" className="lp-btn lp-btn--onmedia">
              Tìm hiểu hệ thống
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
