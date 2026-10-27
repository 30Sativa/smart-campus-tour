import { Link } from 'react-router'
import { Users } from 'lucide-react'
import type { RegistrationSummary } from '../api/types'
import { repButton } from '../rep-classes'
import { closedNote, formatDate, formatRelative, formatTime, groupLabel, isClosedRegistration } from '../rep-format'
import { RegistrationStatusBadge } from './RepUi'
import { RegistrationTrack } from './RegistrationTrack'

/** What the list says under a registration when the Tour no longer takes changes. */
function tourNote(r: RegistrationSummary) {
  switch (r.tourState) {
    case 'READY': return 'Buổi đã chốt danh sách, chỉ xem'
    case 'RUNNING': return 'Buổi đang diễn ra'
    case 'COMPLETED': return 'Buổi đã hoàn thành'
    default: return null
  }
}

/**
 * One registration in "Đăng ký của tôi". An active one shows its route of progress and its next action;
 * an ended one (see `isClosedRegistration`) shows only why it ended, with no steps or actions.
 */
export function RegistrationCard({ registration: r }: { registration: RegistrationSummary }) {
  if (isClosedRegistration(r)) return <ClosedRegistrationCard registration={r} />
  const group = groupLabel(r)
  const note = tourNote(r)
  const needsFix = r.state === 'REJECTED'
  const to = `/dai-dien/dang-ky/${r.id}`
  return (
    <article className={`rep-reg${needsFix ? ' is-rejected' : ''}`}>
      <div style={{ minWidth: 0 }}>
        <h3><Link to={to}>{r.tourName}</Link></h3>
        <p className="rep-reg-sub">{group ? `${group}, ${r.schoolName}` : r.schoolName} · <span className="num">{formatTime(r.tourScheduledStartAt)}, {formatDate(r.tourScheduledStartAt)}</span></p>
        <p className="rep-reg-meta"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={14} aria-hidden="true" /><span className="num">{r.rowCount}</span> dòng lời mời</span><span>Cập nhật {formatRelative(r.updatedAt)}</span>{note && <span>{note}</span>}</p>
        {needsFix && r.rejectionReason && <p className="rep-reg-fix"><b>Nhà trường yêu cầu sửa:</b> {r.rejectionReason}</p>}
      </div>
      <RegistrationTrack state={r.state} tourState={r.tourState} />
      <div className="rep-reg-side">
        {needsFix ? <span className="rep-badge rep-badge--danger">Cần sửa</span> : <RegistrationStatusBadge state={r.state} />}
        <Link to={to} className={repButton(needsFix ? 'dark' : 'secondary', 'sm')}>{needsFix ? 'Sửa và gửi lại' : 'Xem chi tiết'}</Link>
      </div>
    </article>
  )
}

/** An ended registration: the Tour, the group, and the reason it ended. Nothing further to do here. */
function ClosedRegistrationCard({ registration: r }: { registration: RegistrationSummary }) {
  const group = groupLabel(r)
  const why = closedNote(r)
  return (
    <article className="rep-closed">
      <div className="rep-closed-main">
        <div className="rep-closed-title">
          <h3><Link to={`/dai-dien/dang-ky/${r.id}`}>{r.tourName}</Link></h3>
          <span className={`rep-badge rep-badge--${why.tone}`}>{why.badge}</span>
        </div>
        <p className="rep-reg-sub">{group ? `${group}, ${r.schoolName}` : r.schoolName} · <span className="num">{formatTime(r.tourScheduledStartAt)}, {formatDate(r.tourScheduledStartAt)}</span></p>
      </div>
      <div className="rep-closed-why">
        <p className="rep-closed-by">Lý do · {why.by}</p>
        <p className="rep-closed-reason">{why.reason}</p>
        <p className="rep-closed-at num">{why.at}</p>
      </div>
    </article>
  )
}
