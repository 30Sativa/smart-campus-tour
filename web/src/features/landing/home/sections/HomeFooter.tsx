import { EXPERIENCE_HREF } from '../../landing-content'
import { CONTACT_EMAIL, homeNavLinks } from '../home-content'
import { PillLink, SplitText } from '../primitives'

/** Parallax campus photo, the closing call, sitemap and the oversized wordmark. */
export function HomeFooter() {
  const sitemap = [{ href: '#top', label: 'Trang chủ' }, ...homeNavLinks, { href: '#goc-ky-thuat', label: 'Góc kỹ thuật' }]

  return (
    <footer className="hm-footer" id="lien-he">
      <div className="hm-footer__parallax" aria-hidden="true">
        <img src="/images/login-bg.jpg" alt="" loading="lazy" decoding="async" />
      </div>
      <div className="hm-ctn hm-footer__inner">
        <div className="hm-cta" id="dat-tour">
          <SplitText className="hm-cta__title" text="Sẵn sàng đưa cả lớp đi tham quan khuôn viên mà không cần rời chỗ ngồi?" />
          <div className="hm-fade">
            <p>Nhập mã đoàn đã nhận qua email để vào phòng chờ trước giờ bắt đầu.</p>
            <PillLink to={EXPERIENCE_HREF}>Trải nghiệm Campus Tour</PillLink>
          </div>
        </div>
        <div className="hm-info">
          <div>
            <span className="hm-mono hm-info__label">Sơ đồ trang</span>
            <nav className="hm-sitemap" aria-label="Sơ đồ trang">
              {sitemap.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
            </nav>
          </div>
          <div className="hm-info__right">
            <div>
              <span className="hm-mono hm-info__label">Email &amp; hỗ trợ</span>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </div>
            <div>
              <span className="hm-mono hm-info__label">Đồ án</span>
              <span className="hm-info__text">CampusTour DT-AMR · Robot tự hành dẫn tour khuôn viên</span>
            </div>
          </div>
        </div>
        <div className="hm-sign">
          <span>© 2026 Nhóm đồ án CampusTour</span>
          <a href="#top">Về đầu trang ↑</a>
        </div>
      </div>
      <div className="hm-brand" aria-hidden="true">CampusTour</div>
    </footer>
  )
}
