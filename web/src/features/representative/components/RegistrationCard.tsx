import { Link } from 'react-router'
import type { RepresentativeRegistration } from '../../../api/contracts/representative'
import { buttonClass } from '../../staff/ui-classes'
import { cardHover, panelBase } from '../rep-classes'
import { formatDate, formatRelative, formatTime, groupLabel } from '../rep-format'
import { RegistrationStatusBadge } from './RepUi'

/** What the list says under a registration when the Tour no longer takes changes. */
function tourNote(r: RepresentativeRegistration) {
  switch (r.tourState) {
    case 'Ready': return 'Buổi đã chốt danh sách, chỉ xem'
    case 'Running': return 'Buổi đang diễn ra'
    case 'Completed': return 'Buổi đã hoàn thành'
    case 'Cancelled': return 'Buổi đã bị hủy'
    default: return null
  }
}

/** One registration in "Đăng ký của tôi": the Tour, the group, the state and when it last changed. */
export function RegistrationCard({ registration: r }: { registration: RepresentativeRegistration }) {
  const group = groupLabel(r)
  const note = tourNote(r)
  const needsFix = r.state === 'Rejected' && r.allowedActions.edit.allowed
  return (
    <article className={`${panelBase} ${cardHover} grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <RegistrationStatusBadge state={r.state} />
          {note && <span className="text-[13px] text-[#64748b]">{note}</span>}
        </div>
        <h3 className="mt-2 text-[17px] leading-snug font-semibold text-[#0f172a]">
          <Link to={`/dai-dien/dang-ky/${r.id}`} className="rounded hover:text-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]">{r.tourName}</Link>
        </h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          <div className="flex gap-1.5 sm:block"><dt className="text-[#64748b] sm:text-xs">Thời gian</dt><dd className="font-medium text-[#0f172a] tabular-nums">{formatTime(r.tourScheduledAt)}, {formatDate(r.tourScheduledAt)}</dd></div>
          <div className="flex min-w-0 gap-1.5 sm:block"><dt className="text-[#64748b] sm:text-xs">Đoàn</dt><dd className="truncate font-medium text-[#0f172a]">{group ? `${group}, ${r.schoolName}` : r.schoolName}</dd></div>
          <div className="flex gap-1.5 sm:block"><dt className="text-[#64748b] sm:text-xs">Học sinh</dt><dd className="font-medium text-[#0f172a] tabular-nums">{r.studentCount}</dd></div>
        </dl>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-[#eef1f5] pt-3 md:flex-col md:items-end md:border-0 md:pt-0">
        <p className="text-[13px] text-[#64748b]">Cập nhật {formatRelative(r.updatedAt)}</p>
        <Link to={`/dai-dien/dang-ky/${r.id}`} className={buttonClass(needsFix ? 'primary' : 'secondary', 'sm')}>Xem chi tiết</Link>
      </div>
    </article>
  )
}
