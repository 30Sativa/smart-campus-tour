import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'

/**
 * Closing band, left aligned against the campus footage rather than a glowing
 * centred card. One primary action: open the live digital twin. Visitors
 * without a staff account land on sign in, which is the same door, described by
 * what is behind it.
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
            Xem khuôn viên chuyển động theo thời gian thực.
          </h2>
          <p className="lp-lead" data-reveal>
            Bản sao kỹ thuật số hiển thị vị trí, pin và lộ trình của từng robot ngay khi chúng đang chạy.
          </p>
          <div className="lp-cta__btns" data-reveal>
            <Link to="/admin/digital-twin" className="lp-btn lp-btn--solid">
              Xem demo Digital Twin
              <ArrowRight size={17} strokeWidth={2} />
            </Link>
            <a href="#lien-he" className="lp-btn lp-btn--onmedia">
              Liên hệ nhóm phát triển
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
