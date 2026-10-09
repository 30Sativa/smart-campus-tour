import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Lock } from 'lucide-react'
import type { AdminTour } from '../../../api/contracts/admin'
import { shortName } from '../tour-day'

const pad = (n: number) => String(n).padStart(2, '0')

const chip = 'relative z-10 inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap'

/**
 * One Tour as one row of the day-grouped list: time, name and route, how many
 * students and groups, and the one or two things Admin should know.
 * The whole row opens the Tour; the chips open the right tab of it.
 */
export function TourRow({ tour, students }: { tour: AdminTour; students: number }) {
  const d = new Date(tour.scheduledAt)
  const c = tour.counts
  const total = Math.max(1, c.total)
  const chips: ReactNode[] = []
  if (tour.state === 'Scheduled' && tour.allowedActions.finalize.allowed) chips.push(<Link key="fin" to={`/admin/tours/${tour.id}`} className={`${chip} bg-[#ecfdf3] text-[#15803d] hover:underline`}><Lock size={11} aria-hidden="true" />Đủ điều kiện chốt</Link>)
  if (tour.state === 'Scheduled' && c.submitted > 0) chips.push(<Link key="sub" to={`/admin/tours/${tour.id}?tab=registrations`} className={`${chip} bg-[#fffbeb] text-[#b45309] hover:underline`}>{c.submitted} chờ duyệt</Link>)
  if ((tour.state === 'Scheduled' || tour.state === 'Ready') && tour.invitationsPending > 0) chips.push(<Link key="mail" to={`/admin/tours/${tour.id}?tab=registrations`} className={`${chip} bg-[#eff6ff] text-[#2563eb] hover:underline`}>{tour.invitationsPending} chưa gửi thông tin</Link>)
  const others = tour.state === 'Scheduled' ? tour.readyBlockers.filter((line) => !/chờ duyệt/i.test(line)) : []
  if (others.length && !tour.allowedActions.finalize.allowed) chips.push(<span key="blk" className={`${chip} max-w-[260px] truncate bg-[#fef2f2] text-[#dc2626]`} title={others.join(' · ')}>{others[0]}</span>)
  if (tour.state === 'Cancelled' && tour.endReason) chips.push(<span key="why" className="line-clamp-1 text-[12px] text-[#9d3428]">{tour.endReason}</span>)

  return (
    <li className="relative flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#f1f2f4] px-5 py-3.5 transition-colors duration-150 last:border-b-0 hover:bg-[#f8fafc] motion-reduce:transition-none">
      <span className="w-12 shrink-0 font-mono text-[15px] font-bold text-[#0f172a] tabular-nums">{pad(d.getHours())}:{pad(d.getMinutes())}</span>
      <span className="min-w-0 flex-[1_1_220px]">
        <Link to={`/admin/tours/${tour.id}`} title={tour.name} className="block truncate text-[14.5px] font-semibold text-[#111827] after:absolute after:inset-0 hover:text-[#2d719e] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[#5b9dc9] focus-visible:after:ring-inset">{shortName(tour.name)}</Link>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-[#6b7280]"><span className="rounded bg-[#f3f4f6] px-[5px] font-mono text-[11px] font-semibold text-[#4b5563]">{tour.code}</span><span className="truncate">{tour.routeName}</span></span>
      </span>
      <span className="grid w-[136px] shrink-0 gap-1 text-[12.5px] text-[#6b7280]">
        {c.total ? (
          <span className="tabular-nums"><b className="text-[#111827]">{students}</b> HS · <b className="text-[#111827]">{c.approved}/{c.total}</b> đoàn</span>
        ) : (
          <span className="text-[#9ca3af]">Chưa có đoàn</span>
        )}
        <span className="flex h-1 w-full overflow-hidden rounded bg-[#f1f3f6]" aria-hidden="true">
          <i className="block h-full bg-[#16a34a]" style={{ width: `${(c.approved / total) * 100}%` }} />
          <i className="block h-full bg-[#f59e0b]" style={{ width: `${(c.submitted / total) * 100}%` }} />
          <i className="block h-full bg-[#f87171]" style={{ width: `${(c.rejected / total) * 100}%` }} />
          <i className="block h-full bg-[#cbd5e1]" style={{ width: `${(c.cancelled / total) * 100}%` }} />
        </span>
      </span>
      <span className="flex min-w-0 flex-[0_1_300px] flex-wrap justify-start gap-1.5 sm:justify-end">{chips}</span>
    </li>
  )
}
