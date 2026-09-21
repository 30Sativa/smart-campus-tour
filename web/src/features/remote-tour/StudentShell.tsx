import { Outlet, Link } from 'react-router'
import { Suspense } from 'react'
import { VisitorFooter } from '../visitor/components/VisitorFooter'
import { LoadingPanel } from '../visitor/components/States'
import '../landing/landing.css'
import '../../auth/auth.css'
import '../visitor/visitor.css'

/** The same visitor brand, ground and type scale, without account-only navigation. */
export default function StudentShell() {
  return <div className="lp vs" lang="vi"><header className="vs-nav"><div className="lp-nav__inner"><Link className="lp-brand" to="/" aria-label="CampusTour"><img className="lp-brand__mark" src="/images/logo.png" alt="" width={56} height={56} /><span>CampusTour</span><span className="lp-brand__sub">DT-AMR</span></Link><Link className="lp-btn lp-btn--ghost lp-btn--sm" to="/login">Đại diện / Nhân viên</Link></div></header><main className="vs-main"><Suspense fallback={<LoadingPanel />}><Outlet /></Suspense></main><VisitorFooter student />{import.meta.env.DEV && <p className="vs-devbadge">DEV: dữ liệu mô phỏng trong tab này; reload sẽ reset. Chưa có video, email hoặc robot thật.</p>}</div>
}
