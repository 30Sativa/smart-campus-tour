import { ArrowUp } from 'lucide-react'

const columns = [
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
]

export function SiteFooter() {
  return (
    <footer className="lp-foot" id="lien-he">
      <div className="lp-ctn">
        <div className="lp-foot__top">
          <div>
            <a href="#top" className="lp-brand">
              <img className="lp-brand__mark" src="/images/logo-mark.png" alt="" width={34} height={34} />
              <span>CampusTour</span>
              <span className="lp-brand__sub">DT-AMR</span>
            </a>
            <p className="lp-body lp-foot__tag">
              Hệ thống tham quan khuôn viên đại học bằng robot tự hành, trợ lý AI đa ngôn ngữ
              và bản sao kỹ thuật số theo thời gian thực.
            </p>
          </div>

          <div className="lp-foot__cols">
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className="lp-foot__ctitle">{column.title}</h2>
                {column.links.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
            <div>
              <h2 className="lp-foot__ctitle">Liên hệ</h2>
              {/*
                TODO: thay bằng địa chỉ thật của nhóm khi có.
                Ví dụ: https://github.com/<tổ chức>/fleet-management-system
                và mailto:<hộp thư nhóm>.
              */}
              <p className="lp-meta lp-foot__contact">
                Nhóm phát triển CampusTour DT-AMR, Work Package 5.
              </p>
            </div>
          </div>
        </div>

        <div className="lp-foot__bot">
          <p className="lp-meta">© 2026 CampusTour DT-AMR. Dự án nghiên cứu và phát triển.</p>
          <a href="#top" className="lp-btn lp-btn--ghost lp-btn--sm">
            Lên đầu trang
            <ArrowUp size={15} strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  )
}
