import { Link } from 'react-router'
import type { RegistrationSummary } from '../api/types'
import { repButton } from '../rep-classes'
import { closedNote, formatDateTime, formatRelative, groupLabel, isClosedRegistration } from '../rep-format'
import { RegistrationStatusBadge } from './RepUi'

export function RegistrationCard({ registration: r }: { registration: RegistrationSummary }) {
  const closed = isClosedRegistration(r)
  const why = closed ? closedNote(r) : null
  const to = `/dai-dien/dang-ky/${r.id}`
  return <article className={closed ? 'rep-closed' : 'rep-reg'}><div>
    <h3><Link to={to}>{r.tourName}</Link></h3><p className="rep-reg-sub">{groupLabel(r) || r.schoolName}</p><p className="rep-reg-sub num">{formatDateTime(r.tourScheduledStartAt)}</p>
    <div className="rep-reg-meta"><span>{r.rowCount} dòng đăng ký</span>{r.tourState !== 'CANCELLED' && <span>Cập nhật {formatRelative(r.updatedAt)}</span>}</div>
    {!closed && r.state === 'REJECTED' && r.rejectionReason && <p className="rep-reg-fix"><b>Lý do từ chối:</b> {r.rejectionReason}</p>}
  </div>{why ? <div className="rep-closed-why"><span className={`rep-badge rep-badge--${why.tone}`}>{why.badge}</span><p>{why.reason}</p>{why.at && <p className="rep-closed-at num">{why.at}</p>}<Link to={to} className="rep-text-link">Xem hồ sơ</Link></div> : <div className="rep-reg-side"><RegistrationStatusBadge state={r.state} /><Link to={to} className={repButton('secondary', 'sm')}>{r.state === 'REJECTED' ? 'Xem lý do và cập nhật' : 'Xem chi tiết'}</Link></div>}</article>
}
