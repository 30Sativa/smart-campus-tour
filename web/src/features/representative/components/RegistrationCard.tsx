import { Link } from 'react-router'
import { Users } from 'lucide-react'
import type { RegistrationSummary } from '../api/types'
import { repButton } from '../rep-classes'
import { formatDate, formatRelative, formatTime, groupLabel } from '../rep-format'
import { RegistrationStatusBadge } from './RepUi'
import { RegistrationTrack } from './RegistrationTrack'

/** What the list says under a registration when the Tour no longer takes changes. */
function tourNote(r: RegistrationSummary) {
  switch (r.tourState) {
    case 'READY': return 'Buổi đã chốt danh sách, chỉ xem'
    case 'RUNNING': return 'Buổi đang diễn ra'
    case 'COMPLETED': return 'Buổi đã hoàn thành'
    case 'CANCELLED': return 'Buổi đã bị hủy'
    default: return null
  }
}

/** One registration in "Đăng ký của tôi": the group, its Tour, the route of its progress and the state. */
export function RegistrationCard({ registration: r }: { registration: RegistrationSummary }) {
  const group = groupLabel(r)
  const note = tourNote(r)
  const needsFix = r.state === 'REJECTED' && r.tourState === 'SCHEDULED'
  const to = `/dai-dien/dang-ky/${r.id}`
  return (
    <article className={`rep-reg${r.state === 'REJECTED' ? ' is-rejected' : ''}`}>
      <div style={{ minWidth: 0 }}>
        <h3><Link to={to}>{r.tourName}</Link></h3>
        <p className="rep-reg-sub">{group ? `${group}, ${r.schoolName}` : r.schoolName} · <span className="num">{formatTime(r.tourScheduledStartAt)}, {formatDate(r.tourScheduledStartAt)}</span></p>
        <p className="rep-reg-meta"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={14} aria-hidden="true" /><span className="num">{r.rowCount}</span> dòng lời mời</span><span>Cập nhật {formatRelative(r.updatedAt)}</span>{note && <span>{note}</span>}</p>
      </div>
      <RegistrationTrack state={r.state} tourState={r.tourState} />
      <div className="rep-reg-side">
        <RegistrationStatusBadge state={r.state} />
        <Link to={to} className={repButton(needsFix ? 'dark' : 'secondary', 'sm')}>{needsFix ? 'Sửa và gửi lại' : 'Xem chi tiết'}</Link>
      </div>
    </article>
  )
}
