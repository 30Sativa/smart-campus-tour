import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { EXPERIENCE_HREF, OPERATIONS_DEMO_HREF } from '../landing-content'

/**
 * Closing band, left aligned against the campus footage rather than a glowing
 * centred card. Same primary action as the hero, because a page has one
 * conversion, but the promise is stated in terms of what the reader has just
 * scrolled past instead of repeating the opening line.
 */
export function CtaBand() {
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
            <Link to={OPERATIONS_DEMO_HREF} className="lp-btn lp-btn--onmedia">
              Xem hệ thống vận hành
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
