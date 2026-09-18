import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '../../../stores/auth-store'
import { isStaffRole } from '../../../auth/roles'
import { EXPERIENCE_HREF, OPERATIONS_DEMO_HREF } from '../landing-content'

/**
 * Closing band, left aligned against the campus footage rather than a glowing
 * centred card. Same primary action as the hero, because a page has one
 * conversion, but the promise is stated in terms of what the reader has just
 * scrolled past instead of repeating the opening line.
 *
 * The secondary action is role-aware. `OPERATIONS_DEMO_HREF` points inside
 * `/staff/*`, which is guarded, so offering it to a signed-out visitor is a
 * button that bounces them to sign-in with no explanation. Only an account that
 * can actually open the operations console is given the link to it; everyone
 * else is taken to the section of this page that shows what operations covers,
 * which is the honest answer to the same question.
 */
export function CtaBand() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const canOpenOperations = isAuthenticated && isStaffRole(user?.role)

  return (
    <section className="lp-cta" id="dat-tour">
      <div className="lp-cta__media" aria-hidden="true">
        <img src="/images/hero-campus.jpg" alt="" loading="lazy" decoding="async" />
      </div>

      <div className="lp-ctn">
        <div className="lp-cta__body">
          <h2 className="lp-h2 lp-h2--wide" data-reveal>
            Trải nghiệm khuôn viên theo một cách hoàn toàn mới.
          </h2>
          <p className="lp-lead" data-reveal>
            Theo dõi robot tự dẫn đường, AI thuyết minh và Digital Twin hoạt động trong một
            chuyến tour thực tế.
          </p>
          <div className="lp-cta__btns" data-reveal>
            <Link to={EXPERIENCE_HREF} className="lp-btn lp-btn--solid lp-btn--lg">
              Trải nghiệm Campus Tour
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </Link>
            {canOpenOperations ? (
              <Link to={OPERATIONS_DEMO_HREF} className="lp-btn lp-btn--onmedia">
                Xem hệ thống vận hành
              </Link>
            ) : (
              <a href="#nen-tang" className="lp-btn lp-btn--onmedia">
                Xem hệ thống vận hành
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
