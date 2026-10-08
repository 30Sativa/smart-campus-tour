import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Lock } from 'lucide-react'
import type { AdminTour, TourState } from '../../../api/contracts/admin'
import { TOUR_COLOR } from '../admin-visual'

const TINT: Record<TourState, string> = { Scheduled: '#fffbeb', Ready: '#f0fdf4', Running: '#eff6ff', Completed: '#f8fafc', Cancelled: '#fef2f2' }
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const pad = (n: number) => String(n).padStart(2, '0')

function dayLabel(value: string) {
  const d = new Date(value)
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(d); b.setHours(0, 0, 0, 0)
  const k = Math.round((+b - +a) / 864e5)
  const name = k === 0 ? 'Hôm nay' : k === 1 ? 'Mai' : k === -1 ? 'Hôm qua' : WD[d.getDay()]
  return `${name} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/** "Tham quan từ xa · Buổi chiều" reads as "Buổi chiều" on a card; the full name stays in the title. */
const shortName = (name: string) => name.replace(/^Tham quan từ xa\s*·\s*/i, '')

const chip = 'relative z-10 inline-flex h-5 items-center gap-1 rounded-[5px] px-[7px] text-[11px] font-semibold'

/**
 * One Tour, compact: when, what, how many students and groups, and the
 * one or two things Admin should know before opening it.
 */
export function TourCard({ tour, students }: { tour: AdminTour; students: number }) {
  const d = new Date(tour.scheduledAt)
  const c = tour.counts
  const total = Math.max(1, c.total)
  const chips: ReactNode[] = []
  if (tour.state === 'Scheduled' && c.submitted > 0) chips.push(<Link key="sub" to={`/admin/tours/${tour.id}?tab=registrations`} className={`${chip} bg-[#fffbeb] text-[#b45309] hover:underline`}>{c.submitted} chờ duyệt</Link>)
  if (tour.state === 'Scheduled' && tour.allowedActions.finalize.allowed) chips.push(<Link key="fin" to={`/admin/tours/${tour.id}`} className={`${chip} bg-[#ecfdf3] text-[#15803d] hover:underline`}><Lock size={11} aria-hidden="true" />Đủ điều kiện chốt</Link>)
  if ((tour.state === 'Scheduled' || tour.state === 'Ready') && tour.invitationsPending > 0) chips.push(<Link key="mail" to={`/admin/tours/${tour.id}?tab=registrations`} className={`${chip} bg-[#eff6ff] text-[#2563eb] hover:underline`}>{tour.invitationsPending} chưa gửi thông tin</Link>)
  const others = tour.state === 'Scheduled' ? tour.readyBlockers.filter((line) => !/chờ duyệt/i.test(line)) : []
  if (others.length && !tour.allowedActions.finalize.allowed) chips.push(<span key="blk" className={`${chip} max-w-full truncate bg-[#fef2f2] text-[#dc2626]`} title={others.join(' · ')}>{others[0]}</span>)
  if (tour.state === 'Cancelled' && tour.endReason) chips.push(<span key="why" className="line-clamp-1 text-[11.5px] text-[#9d3428]">{tour.endReason}</span>)

  return (
    <li className="relative grid grid-cols-[74px_minmax(0,1fr)_78px] items-center gap-x-2.5 gap-y-1 rounded-[9px] bg-white p-2.5 shadow-[inset_0_0_0_1px_#eef0f3] transition-[box-shadow,translate] duration-200 hover:-translate-y-px hover:shadow-[inset_0_0_0_1px_#a8cde6,0_10px_22px_-16px_rgba(17,24,39,0.35)] motion-reduce:transition-none">
      <span className="self-start rounded-md py-1 text-center font-mono text-xs font-semibold tabular-nums" style={{ background: TINT[tour.state], color: TOUR_COLOR[tour.state] }}>
        <span className="mb-px block font-sans text-[10px] font-semibold whitespace-nowrap opacity-80">{dayLabel(tour.scheduledAt)}</span>{pad(d.getHours())}:{pad(d.getMinutes())}
      </span>
      <span className="min-w-0">
        <Link to={`/admin/tours/${tour.id}`} title={tour.name} className="block truncate text-[13px] font-semibold text-[#111827] after:absolute after:inset-0 after:rounded-[9px] hover:text-[#2d719e] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[#5b9dc9]">{shortName(tour.name)}</Link>
        <span className="mt-px flex items-center gap-1.5 truncate text-[11.5px] text-[#9ca3af]"><span className="rounded bg-[#f3f4f6] px-[5px] font-mono text-[10.5px] font-semibold text-[#6b7280]">{tour.code}</span><span className="truncate">{tour.routeName}</span></span>
      </span>
      <span className="grid justify-items-end gap-[3px] text-[11px] text-[#9ca3af]">
        <span><b className="text-[13px] text-[#111827] tabular-nums">{students}</b> HS</span>
        <span className="flex h-1 w-full overflow-hidden rounded bg-[#f3f4f6]" aria-hidden="true">
          <i className="block h-full bg-[#16a34a]" style={{ width: `${(c.approved / total) * 100}%` }} />
          <i className="block h-full bg-[#f59e0b]" style={{ width: `${(c.submitted / total) * 100}%` }} />
          <i className="block h-full bg-[#f87171]" style={{ width: `${(c.rejected / total) * 100}%` }} />
          <i className="block h-full bg-[#cbd5e1]" style={{ width: `${(c.cancelled / total) * 100}%` }} />
        </span>
        <span className="tabular-nums">{c.total ? `${c.approved}/${c.total} đoàn` : 'Chưa có đoàn'}</span>
      </span>
      {chips.length > 0 && <span className="col-start-2 col-end-4 flex min-w-0 flex-wrap gap-[5px]">{chips}</span>}
    </li>
  )
}
