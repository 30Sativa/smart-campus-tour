import { useState } from 'react'
import { ChevronDown, CircleCheck, CircleX, Hand, Users } from 'lucide-react'
import { Link } from 'react-router'
import type { GroupRegistration, StartCheck, TourOperation } from '../../../api/contracts/staff'
import { StatusBadge } from '../StaffUi'
import { buttonClass } from '../ui-classes'
import { START_CHECK_LABEL } from '../status'
import { REASON_SHORT } from '../reason'
import { formatCountdown, formatTime } from '../formatters'
import { groupSummary, tourAction } from '../attention'

/** TourState, plus OperationalStatus and Hold while Running - never merged into one enum. */
export function TourStateBadges({
  tour,
  size = 'sm',
}: {
  tour: Pick<TourOperation, 'state' | 'operationalStatus' | 'reason' | 'progress'>
  size?: 'sm' | 'md'
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge value={tour.state} size={size} live={tour.state === 'Running' && tour.operationalStatus === 'Normal'} />
      {tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance' && (
        <StatusBadge value="NeedsAssistance" size={size} />
      )}
      {tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance' && tour.reason && (
        <span className="text-[11px] font-bold text-[#dc2626] bg-[#fef2f2] px-2 py-0.5 rounded-full border border-[#fecaca]">
          {REASON_SHORT[tour.reason] ?? tour.reason}
        </span>
      )}
      {tour.progress?.hold && (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#d5e5a8] bg-[#f2f7e4] px-2 py-0.5 text-[11px] font-bold text-[#4d6410]">
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

/**
 * Tours as a table (laptop) or cards (tablet and below). Every row carries
 * exactly one action, the one its state calls for.
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
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm" aria-label={label}>
          <thead className="bg-[#f7f7f3] text-[11px] font-bold tracking-[0.05em] text-[#6b6e75] uppercase border-b border-[#e3e3dc]">
            <tr>
              <th className="px-5 py-3">Giờ</th>
              <th className="px-3 py-3">Buổi tham quan</th>
              <th className="px-3 py-3">Đoàn đăng ký</th>
              <th className="px-3 py-3">Robot</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-5 py-3 text-right">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#efefe9]">
            {tours.map((tour) => {
              const groups = groupSummary(tour)
              const countdown = formatCountdown(tour.scheduledAt, now)
              return (
                <tr key={tour.id} className="transition-colors hover:bg-[#f7f7f3]">
                  <td className="px-5 py-3.5 align-top">
                    <p className="font-extrabold text-[#1c1c1c] tabular-nums">{formatTime(tour.scheduledAt)}</p>
                    <p className="mt-0.5 text-xs whitespace-nowrap text-[#8e9096]">
                      {showDate
                        ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(
                            new Date(tour.scheduledAt),
                          )
                        : tour.state === 'Scheduled' || tour.state === 'Ready'
                        ? countdown ?? 'đã tới giờ'
                        : tour.startedAt
                        ? `bắt đầu ${formatTime(tour.startedAt)}`
                        : ''}
                    </p>
                  </td>
                  <td className="px-3 py-3.5 align-top">
                    <Link
                      to={`/staff/tours/${tour.id}`}
                      className="font-bold text-[#1c1c1c] hover:text-[#4d6410] transition-colors"
                    >
                      {tour.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-[#6b6e75]">
                      <span className="font-mono font-semibold text-[#4d6410]">{tour.code}</span> · {tour.routeName} ·{' '}
                      {tour.stops.length} POI
                    </p>
                  </td>
                  <td className="px-3 py-3.5 align-top">
                    <p className="font-semibold whitespace-nowrap text-[#3a3d44]">
                      {groups.groups} đoàn · {groups.students} học sinh
                    </p>
                    {groups.pending > 0 && (
                      <p className="mt-0.5 text-xs font-semibold text-[#d97706]">{groups.pending} đăng ký chờ duyệt</p>
                    )}
                  </td>
                  <td className="px-3 py-3.5 align-top font-mono text-xs text-[#3a3d44]">
                    {tour.robotName ?? <span className="font-sans text-xs text-[#8e9096]">Nhận khi bắt đầu</span>}
                  </td>
                  <td className="px-3 py-3.5 align-top">
                    <TourStateBadges tour={tour} />
                    {tour.state === 'Scheduled' && tour.readyBlockers.length > 0 && (
                      <p className="mt-1 max-w-56 text-[11px] leading-4 text-[#8e9096]">
                        {tour.readyBlockers.join(' · ')}
                      </p>
                    )}
                    {tour.state === 'Cancelled' && tour.endReason && (
                      <p className="mt-1 max-w-56 text-[11px] leading-4 text-[#8e9096]">{tour.endReason}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right align-top">
                    <TourActionLink tour={tour} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[#efefe9] lg:hidden" aria-label={label}>
        {tours.map((tour) => {
          const groups = groupSummary(tour)
          return (
            <li key={tour.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1c1c1c]">
                    <span className="tabular-nums">{formatTime(tour.scheduledAt)}</span> · {tour.name}
                  </p>
                  <p className="mt-1 text-xs text-[#6b6e75]">
                    {tour.code} · {tour.routeName} · {groups.groups} đoàn · {groups.students} học sinh
                  </p>
                </div>
                <TourStateBadges tour={tour} />
              </div>
              <div className="mt-3">
                <TourActionLink tour={tour} />
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/**
 * The groups registered for a Tour. Staff reads them; approving, rejecting and
 * mailing are Admin's (scope §2.1). The roster opens on demand and is never
 * shown to students.
 */
export function RegistrationList({ registrations }: { registrations: GroupRegistration[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (registrations.length === 0) return <p className="text-sm text-[#8e9096]">Chưa có đoàn nào đăng ký.</p>
  return (
    <ul className="divide-y divide-[#efefe9]">
      {registrations.map((reg) => (
        <li key={reg.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-sm text-[#1c1c1c]">{reg.schoolName}</p>
              <p className="text-xs text-[#6b6e75]">
                {reg.representativeName} ·{' '}
                {reg.invitationSentAt
                  ? `đã gửi thông tin lúc ${formatTime(reg.invitationSentAt)}`
                  : 'chưa gửi thông tin tham gia'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3a3d44]">
                <Users size={13} className="text-[#8e9096]" aria-hidden="true" />
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
            <ol className="mt-3 grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto rounded-xl bg-[#f7f7f3] border border-[#e3e3dc] p-3 text-xs text-[#3a3d44] transition-opacity duration-200 starting:opacity-0 sm:grid-cols-2">
              {reg.roster.map((row, i) => (
                <li key={`${row.name}-${i}`} className="truncate">
                  <span className="mr-2 text-[11px] text-[#8e9096] tabular-nums">{i + 1}.</span>
                  {row.name}
                  {row.className ? <span className="text-[#6b6e75]"> · {row.className}</span> : null}
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
            check.passed ? 'border-[#d5e8a6] bg-[#f2f7e4]' : 'border-[#e3e3dc] bg-[#f7f7f3]'
          }`}
        >
          <span className="flex items-center gap-2">
            {check.passed ? (
              <CircleCheck size={16} className="text-[#8fbf2a]" aria-hidden="true" />
            ) : (
              <CircleX size={16} className="text-[#dc2626]" aria-hidden="true" />
            )}
            <span className="font-bold text-[#1c1c1c]">{START_CHECK_LABEL[check.id] ?? check.id}</span>
          </span>
          {check.detail && (
            <span className={`text-[11px] ${check.passed ? 'text-[#5f7a12]' : 'text-[#6b6e75]'}`}>
              {check.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
