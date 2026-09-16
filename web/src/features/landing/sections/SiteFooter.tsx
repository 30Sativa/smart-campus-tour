import { ArrowUp } from 'lucide-react'

const systemLinks = [
  { href: '#robot', label: 'Robot AMR' },
  { href: '#tinh-nang', label: 'Trợ lý AI' },
  { href: '#gioi-thieu', label: 'Digital Twin' },
  { href: '#quy-trinh', label: 'Quy trình tour' },
]

const projectLinks = [
  { href: '#gioi-thieu', label: 'Về dự án' },
  { href: '#nen-tang', label: 'Nền tảng kỹ thuật' },
  { href: '#chi-so', label: 'Mục tiêu vận hành' },
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
            <p className="lp-body" style={{ marginTop: 18, maxWidth: '38ch' }}>
              Hệ thống tham quan khuôn viên đại học bằng robot tự hành, trợ lý AI đa ngôn ngữ
              và bản sao kỹ thuật số theo thời gian thực.
            </p>
          </div>

          <div className="lp-foot__cols">
            <div>
              <div className="lp-foot__ctitle">Hệ thống</div>
              {systemLinks.map((link) => (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
            <div>
              <div className="lp-foot__ctitle">Dự án</div>
              {projectLinks.map((link) => (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
            <div>
              <div className="lp-foot__ctitle">Liên hệ</div>
              {/*
                TODO: thay hai giá trị dưới bằng địa chỉ thật của nhóm.
                Ví dụ: https://github.com/<tổ chức>/fleet-management-system
                và mailto:<hộp thư nhóm>.
              */}
              <p className="lp-meta" style={{ maxWidth: '26ch' }}>
                Nhóm phát triển CampusTour DT-AMR, Work Package 5.
              </p>
            </div>
          </div>
        </div>

        <div className="lp-foot__bot">
          <p className="lp-meta">© 2026 CampusTour DT-AMR. Dự án nghiên cứu và phát triển.</p>
          <a href="#top" className="lp-btn lp-btn--ghost lp-btn--sm">
            Lên đầu trang
            <ArrowUp size={15} strokeWidth={2} />
          </a>
        </div>
      </div>
    </footer>
  )
}
