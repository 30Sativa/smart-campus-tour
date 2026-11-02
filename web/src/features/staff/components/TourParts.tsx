import { useState } from 'react'
import { Bot, CalendarClock, ChevronDown, CircleCheck, CircleX, Hand, Lock, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { GroupRegistration, StartCheck, TourOperation, TourState } from '../../../api/contracts/staff'
import { StatusBadge } from '../StaffUi'
import { buttonClass, cardClass } from '../../../components/ui/ui-classes'
import { START_CHECK_LABEL, statusInfo } from '../status'
import { REASON_SHORT } from '../reason'
import { formatCountdown, formatTime } from '../formatters'
import { groupSummary, tourAction } from '../attention'

/**
 * One look per Tour state, readable without colour: an icon (or the live dot),
 * the border style and the label all change. Scheduled is dashed (not locked
 * yet), Ready carries a lock, Running is the only solid fill, Completed is
 * green, Cancelled is grey.
 */
const STATE_LOOK: Record<TourState, { icon: LucideIcon | null; className: string }> = {
  Scheduled: { icon: CalendarClock, className: 'border-dashed border-[#94a3b8] bg-white text-[#475569]' },
  Ready: { icon: Lock, className: 'border-[#9cc7e4] bg-[#eaf4fc] text-[#1f5f8b]' },
  Running: { icon: null, className: 'border-[#d6e4f8] bg-[#edf3fb] text-[#4a6fa5]' },
  Completed: { icon: CircleCheck, className: 'border-[#bfe6d2] bg-[#effbf5] text-[#1f7a55]' },
  Cancelled: { icon: CircleX, className: 'border-[#e2e8f0] bg-[#f1f5f9] text-[#64748b]' },
}

export function TourStateBadge({ state, size = 'sm' }: { state: TourState; size?: 'sm' | 'md' }) {
  const look = STATE_LOOK[state]
  const Icon = look.icon
  const md = size === 'md'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-bold whitespace-nowrap ${md ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-0.5 text-[11px]'} ${look.className}`}>
      {Icon ? (
        <Icon size={md ? 14 : 12} aria-hidden="true" />
      ) : (
        <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-60 [animation-duration:2.4s] motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-full bg-white" />
        </span>
      )}
      {statusInfo(state).label}
    </span>
  )
}

/** TourState, plus OperationalStatus and Hold while Running - never merged into one enum. */
export function TourStateBadges({
  tour,
  size = 'sm',
  showReason = true,
}: {
  tour: Pick<TourOperation, 'state' | 'operationalStatus' | 'reason' | 'progress'>
  size?: 'sm' | 'md'
  showReason?: boolean
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <TourStateBadge state={tour.state} size={size} />
      {tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance' && (
        <StatusBadge value="NeedsAssistance" size={size} />
      )}
      {showReason && tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance' && tour.reason && (
        <span className="rounded-full border border-[#fecaca] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-bold text-[#b91c1c]">
          {REASON_SHORT[tour.reason] ?? tour.reason}
        </span>
      )}
      {tour.progress?.hold && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#fed7aa] bg-[#fff7ed] px-2 py-0.5 text-[11px] font-bold text-[#c2410c]">
          <Hand size={11} aria-hidden="true" />
          Đang giữ
        </span>
      )}
    </span>
  )
}

function TourActionLink({ tour }: { tour: TourOperation }) {
  const action = tourAction(tour)
  return (
    <Link to={action.to} className={buttonClass(action.kind === 'primary' ? 'primary' : 'secondary', 'sm')}>
      {action.label}
    </Link>
  )
}

/** Top edge of a Tour card, so the state reads before any text. */
const STATE_EDGE: Record<TourState, string> = {
  Scheduled: 'bg-[#cbd5e1]',
  Ready: 'bg-[#7db9db]',
  Running: 'bg-[#2d719e]',
  Completed: 'bg-[#6cc49a]',
  Cancelled: 'bg-[#e2e8f0]',
}

/**
 * Tours as a list of cards (every width): time and state first, then who and
 * which route, then registrations and robot. Every card carries exactly one
 * action, the one its state calls for.
 */
export function TourTable({
  tours,
  now,
  showDate = false,
  label,
}: {
  tours: TourOperation[]
  now: number
  showDate?: boolean
  label: string
}) {
  return (
    <ul aria-label={label} className="grid gap-3 bg-[#f8fafc] p-3 sm:grid-cols-2 2xl:grid-cols-3">
      {tours.map((tour) => {
        const groups = groupSummary(tour)
        const countdown = formatCountdown(tour.scheduledAt, now)
        const closed = tour.state === 'Completed' || tour.state === 'Cancelled'
        const when = showDate
          ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(tour.scheduledAt))
          : tour.state === 'Scheduled' || tour.state === 'Ready'
          ? countdown ?? 'đã tới giờ'
          : tour.startedAt
          ? `bắt đầu ${formatTime(tour.startedAt)}`
          : ''
        return (
          <li
            key={tour.id}
            className={`${cardClass} relative flex min-w-0 flex-col overflow-hidden transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_16px_32px_-16px_rgba(23,59,89,0.3)] motion-reduce:hover:translate-y-0 ${closed ? 'opacity-85' : ''}`}
          >
            <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${STATE_EDGE[tour.state]}`} />
            <div className="flex flex-1 flex-col gap-3 p-4 pt-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-xl leading-tight font-bold tabular-nums ${tour.state === 'Cancelled' ? 'text-[#94a3b8] line-through' : 'text-[#0f172a]'}`}>
                    {formatTime(tour.scheduledAt)}
                  </p>
                  {when && <p className="mt-0.5 text-xs whitespace-nowrap text-[#64748b]">{when}</p>}
                </div>
                <TourStateBadges tour={tour} />
              </div>

              <div className="min-w-0">
                <Link to={`/staff/tours/${tour.id}`} className="line-clamp-2 font-bold text-[#0f172a] transition-colors hover:text-[#2d719e]">
                  {tour.name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-[#64748b]">
                  <span className="font-mono font-semibold text-[#2d719e]">{tour.code}</span> · {tour.routeName} · {tour.stops.length} POI
                </p>
              </div>

              {tour.state === 'Scheduled' && tour.readyBlockers.length > 0 && (
                <p className="rounded-lg border border-[#fde7c2] bg-[#fffbf2] px-2.5 py-1.5 text-[11.5px] leading-4 text-[#8a5a06]">
                  Chưa sẵn sàng: {tour.readyBlockers.join(' · ')}
                </p>
              )}
              {tour.state === 'Cancelled' && tour.endReason && (
                <p className="text-[11.5px] leading-4 text-[#64748b]">Lý do: {tour.endReason}</p>
              )}

              <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[#eef2f6] pt-3 text-xs">
                <div className="min-w-0">
                  <dt className="flex items-center gap-1 text-[#64748b]"><Users size={12} aria-hidden="true" />Đoàn đăng ký</dt>
                  <dd className="m-0 font-semibold text-[#334155]">{groups.groups} đoàn · {groups.students} học sinh</dd>
                  {groups.pending > 0 && <dd className="m-0 font-semibold text-[#b45309]">{groups.pending} đăng ký chờ duyệt</dd>}
                </div>
                <div className="min-w-0">
                  <dt className="flex items-center gap-1 text-[#64748b]"><Bot size={12} aria-hidden="true" />Robot</dt>
                  <dd className="m-0 truncate font-mono font-semibold text-[#334155]">
                    {tour.robotName ?? <span className="font-sans font-normal text-[#94a3b8]">Nhận khi bắt đầu</span>}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="flex justify-end border-t border-[#eef2f6] bg-[#fafbfc] px-4 py-2.5">
              <TourActionLink tour={tour} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The groups registered for a Tour. Staff reads them; approving, rejecting and
 * mailing are Admin's (scope §2.1). The roster opens on demand and is never
 * shown to students.
 */
export function RegistrationList({ registrations }: { registrations: GroupRegistration[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (registrations.length === 0) return <p className="text-sm text-[#94a3b8]">Chưa có đoàn nào đăng ký.</p>
  return (
    <ul className="divide-y divide-[#f1f5f9]">
      {registrations.map((reg) => (
        <li key={reg.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-sm text-[#0f172a]">{reg.schoolName}</p>
              <p className="text-xs text-[#64748b]">
                {reg.representativeName} ·{' '}
                {reg.invitationSentAt
                  ? `đã gửi thông tin lúc ${formatTime(reg.invitationSentAt)}`
                  : 'chưa gửi thông tin tham gia'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#334155]">
                <Users size={13} className="text-[#94a3b8]" aria-hidden="true" />
                {reg.studentCount}
              </span>
              <StatusBadge value={reg.state} />
              <button
                type="button"
                onClick={() => setOpen((value) => (value === reg.id ? null : reg.id))}
                aria-expanded={open === reg.id}
                className={buttonClass('ghost', 'sm')}
              >
                Danh sách
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${open === reg.id ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          {open === reg.id && (
            <ol className="mt-3 grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-3 text-xs text-[#334155] transition-opacity duration-200 starting:opacity-0 sm:grid-cols-2">
              {reg.roster.map((row, i) => (
                <li key={`${row.name}-${i}`} className="truncate">
                  <span className="mr-2 text-[11px] text-[#94a3b8] tabular-nums">{i + 1}.</span>
                  {row.name}
                  {row.className ? <span className="text-[#64748b]"> · {row.className}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Pre-start device conditions evaluated by backend. */
export function StartChecklist({ checks }: { checks: StartCheck[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li
          key={check.id}
          className={`flex items-center justify-between rounded-xl border p-3 text-xs transition-colors ${
            check.passed ? 'border-[#a7f3d0] bg-[#ecfdf5]' : 'border-[#e2e8f0] bg-[#f8fafc]'
          }`}
        >
          <span className="flex items-center gap-2">
            {check.passed ? (
              <CircleCheck size={16} className="text-[#10b981]" aria-hidden="true" />
            ) : (
              <CircleX size={16} className="text-[#dc2626]" aria-hidden="true" />
            )}
            <span className="font-bold text-[#0f172a]">{START_CHECK_LABEL[check.id] ?? check.id}</span>
          </span>
          {check.detail && (
            <span className={`text-[11px] ${check.passed ? 'text-[#16a34a]' : 'text-[#64748b]'}`}>
              {check.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
