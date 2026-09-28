import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '../../../stores/auth-store'
import { isStaffRole } from '../../../auth/roles'
import { EXPERIENCE_HREF, OPERATIONS_DEMO_HREF } from '../landing-content'

/** The closing scene keeps account entry for representatives and staff. */
export function CtaBand() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const canOpenOperations = isAuthenticated && isStaffRole(user?.role)

  return (
    <section className="lp-cta" id="dat-tour">
      <div className="lp-cta__media" aria-hidden="true">
        <img src="/images/home-3d/closing-smartbus.png" alt="" loading="lazy" decoding="async" />
      </div>

      <div className="lp-ctn">
        <div className="lp-cta__body">
          <h2 className="lp-h2 lp-h2--wide" data-reveal>
            Một campus.<br /><em>Nhiều góc nhìn mới.</em>
          </h2>
          <p className="lp-lead" data-reveal>
            Khám phá hành trình tham quan từ xa cùng CampusTour.
          </p>
          <div className="lp-cta__btns" data-reveal>
            <Link to={EXPERIENCE_HREF} className="lp-btn lp-btn--solid lp-btn--lg">
              Đăng nhập đại diện
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </Link>
            {canOpenOperations ? (
              <Link to={OPERATIONS_DEMO_HREF} className="lp-btn lp-btn--onmedia">
                Xem hệ thống vận hành
              </Link>
            ) : (
              <a href="#lien-he" className="lp-btn lp-btn--onmedia">
                Liên hệ nhóm dự án
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
