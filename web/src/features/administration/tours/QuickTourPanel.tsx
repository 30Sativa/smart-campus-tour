import { useEffect, useState } from 'react'
import { Plus, Zap } from 'lucide-react'
import { Link } from 'react-router'
import { buttonClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, EmptyState, SkeletonRows } from '../AdminUi'
import { useTours } from './hooks'
import { overdueStartLabel } from './overdue-start'
import { MINUTE, quickDeadlineLabel } from './quick-tour'
import { campusShortStamp, campusTime } from './tour-calendar'
import { tourError, tourStateLabel } from './tour-messages'
import type { TourSummary } from './types'

const PAGE_SIZE = 20

/** The clock for the countdowns; a minute is enough, the list itself refreshes on Tour changes. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/**
 * The quick Tours (ADR-0053), newest first: each one's state, robot hold and how long is left to Start it. A quick Tour
 * has no shift, so it is managed by how soon it must start rather than placed in the week.
 */
export function QuickTourPanel() {
  const tours = useTours({ shortNotice: true, sort: '-createdAt', page: 1, size: PAGE_SIZE })
  const now = useMinuteClock()
  if (tours.isError) return <AdminErrorPanel title={tourError(tours.error)} onRetry={() => void tours.refetch()} />
  if (tours.isPending) return <SkeletonRows rows={3} label="Đang tải Tour nhanh" />
  if (tours.data.data.length === 0) return <EmptyState title="Chưa có Tour nhanh nào"
    description="Tour nhanh không cần chọn ngày, ca: robot được giữ từ lúc tạo và Start được ngay khi chốt danh sách, đủ người."
    action={<Link to="/staff/manage/tours/new?kind=quick" className={buttonClass('primary', 'sm')}><Plus size={14} aria-hidden="true" />Tạo Tour nhanh</Link>} />
  return <ul aria-label="Danh sách Tour nhanh" className="divide-y divide-[#eef1f4] rounded-xl border border-[#e2e8f0]">
    {tours.data.data.map(tour => <QuickTourRow key={tour.id} tour={tour} now={now} />)}
  </ul>
}

function QuickTourRow({ tour, now }: { tour: TourSummary; now: number }) {
  const left = quickDeadlineLabel(tour, now)
  const overdue = overdueStartLabel(tour, tour.reservation, now)
  const urgent = left !== null && new Date(tour.scheduledStartAt).getTime() - now <= 10 * MINUTE
  return <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#fffaf0] text-[#b7791f]"><Zap size={16} /></span>
    <span className="min-w-0 flex-1 basis-56">
      <Link to={`/staff/manage/tours/${tour.id}`} className="block font-semibold break-words text-[#0f172a] hover:text-[#2d719e] hover:underline focus-visible:outline-2 focus-visible:outline-[#2d719e]">{tour.name}</Link>
      <span className="block text-xs text-[#64748b]">{tour.routeName} · tạo {campusShortStamp(tour.createdAt)}{tour.reservation
        ? ` · robot ${tour.reservation.robotCode}, giữ ${campusTime(tour.reservation.startsAt)} - ${campusTime(tour.reservation.endsAt)}` : ''}</span>
    </span>
    <span className="text-xs tabular-nums text-[#475569]">Hạn Start {campusTime(tour.scheduledStartAt)}
      {left && <span className={`block font-semibold ${urgent ? 'text-[#9d3428]' : 'text-[#1e293b]'}`}>{left}</span>}
      {overdue && <span className="block font-semibold text-[#9d3428]">{overdue}</span>}</span>
    <span className="rounded-full border border-[#e2e8f0] bg-white px-2 py-px text-[11px] font-bold whitespace-nowrap text-[#334155]">{tourStateLabel(tour, now)}</span>
  </li>
}
