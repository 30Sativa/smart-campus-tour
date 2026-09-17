import { ArrowUp, ExternalLink, Mail, MapPin, Phone } from 'lucide-react'

type FooterLink = {
  href: string
  label: string
  external?: boolean
}

type FooterColumn = {
  title: string
  links: FooterLink[]
}

const columns: FooterColumn[] = [
  {
    title: 'Hành trình',
    links: [
      { href: '#quy-trinh', label: 'Các bước của một tour' },
      { href: '#tinh-nang', label: 'Tính năng hệ thống' },
      { href: '#gioi-thieu', label: 'Digital Twin' },
    ],
  },
  {
    title: 'Kỹ thuật',
    links: [
      { href: '#robot', label: 'Công nghệ robot' },
      { href: '#nen-tang', label: 'Nền tảng kỹ thuật' },
      { href: '#chi-so', label: 'Mục tiêu vận hành' },
    ],
  },
  {
    title: 'FPTU HCM',
    links: [
      { href: 'https://daihoc.fpt.edu.vn/hcm/', label: 'Campus TP. Hồ Chí Minh', external: true },
      { href: 'https://daihoc.fpt.edu.vn/', label: 'Website Đại học FPT', external: true },
      { href: 'https://daihoc.fpt.edu.vn/lien-he/', label: 'Thông tin liên hệ', external: true },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="lp-foot" id="lien-he">
      <div className="lp-ctn">
        <div className="lp-foot__top">
          <div className="lp-foot__identity">
            <a href="#top" className="lp-brand">
              <img className="lp-brand__mark" src="/images/logo.png" alt="" width={56} height={56} />
              <span>CampusTour</span>
              <span className="lp-brand__sub">DT-AMR</span>
            </a>
            <p className="lp-body lp-foot__tag">
              Hệ thống tham quan khuôn viên đại học bằng robot tự hành, trợ lý AI đa ngôn ngữ
              và bản sao kỹ thuật số theo thời gian thực.
            </p>
            <p className="lp-foot__eyebrow">Được phát triển tại</p>
            <p className="lp-foot__institution">Trường Đại học FPT<br />Campus TP. Hồ Chí Minh</p>
          </div>

          <div className="lp-foot__cols">
            {columns.map((column) => (
              <div key={column.title}>
                <p className="lp-foot__ctitle">{column.title}</p>
                {column.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noreferrer' : undefined}
                  >
                    {link.label}
                    {link.external && <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />}
                  </a>
                ))}
              </div>
            ))}
            <address className="lp-foot__address">
              <p className="lp-foot__ctitle">Liên hệ</p>
              <a className="lp-foot__contact-link" href="https://maps.google.com/?q=Lô+E2a-7,+Đường+D1,+Khu+Công+nghệ+cao,+TP.+Hồ+Chí+Minh" target="_blank" rel="noreferrer">
                <MapPin size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Lô E2a-7, Đường D1, Khu Công nghệ cao, Phường Tăng Nhơn Phú, TP. Hồ Chí Minh</span>
              </a>
              <a className="lp-foot__contact-link" href="tel:+842873005588">
                <Phone size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>(028) 7300 5588</span>
              </a>
              <a className="lp-foot__contact-link" href="mailto:tuyensinhhcm@fpt.edu.vn">
                <Mail size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>tuyensinhhcm@fpt.edu.vn</span>
              </a>
            </address>
          </div>
        </div>

        <div className="lp-foot__bot">
          <p className="lp-meta">© 2026 CampusTour DT-AMR · Dự án nghiên cứu và phát triển tại FPTU HCM.</p>
          <a
            href="#top"
            className="lp-foot__topbtn"
            aria-label="Lên đầu trang"
            title="Lên đầu trang"
          >
            <ArrowUp size={13} strokeWidth={2.25} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  )
}
