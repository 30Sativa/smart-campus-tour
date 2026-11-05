import { CalendarDays } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { FilterChips, LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'
import { campusDate, campusDay, campusTime } from '../../features/administration/tours/tour-calendar'
import { tourError } from '../../features/administration/tours/tour-messages'
import type { TourState, TourSummary } from '../../features/administration/tours/types'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { useDayTours, useUpcomingTours } from '../../features/staff/operations/hooks'
import { TourStateBadge } from '../../features/staff/operations/OperationParts'
import { nextStep } from '../../features/staff/operations/next-step'

type View = 'all' | 'SCHEDULED' | 'READY' | 'RUNNING' | 'ended'
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'all', label: 'Tất cả' }, { value: 'SCHEDULED', label: 'Chưa chốt' }, { value: 'READY', label: 'Đã chốt' },
  { value: 'RUNNING', label: 'Đang diễn ra' }, { value: 'ended', label: 'Đã xong / hủy' },
]
const ENDED: TourState[] = ['COMPLETED', 'CANCELLED']
const matches = (tour: TourSummary, view: View) => view === 'all' || (view === 'ended' ? ENDED.includes(tour.state) : tour.state === view)

/** Today's Tours on the campus calendar, from the live Tour list, each with its next step. */
export default function ToursTodayPage() {
  const [params, setParams] = useSearchParams()
  const today = campusDay(new Date())
  const tours = useDayTours(today)
  const asked = params.get('view') as View | null
  const view: View = asked && VIEWS.some(item => item.value === asked) ? asked : 'all'
  const all = tours.data?.data ?? []
  const rows = all.filter(tour => matches(tour, view))
  const count = (state: TourState) => all.filter(tour => tour.state === state).length
  const known = tours.isSuccess
  const upcoming = useUpcomingTours(today)
  const ahead = (upcoming.data?.data ?? []).filter(tour => !ENDED.includes(tour.state))

  return (
    <StaffPage>
      <PageHeader eyebrow="Vận hành" title="Buổi hôm nay" description={`Các Tour ngày ${campusDate(`${today}T05:00:00Z`)}, đọc từ hệ thống. Mỗi Tour có một bước tiếp theo theo trạng thái của nó.`}
        action={<Link to="/staff/schedule" className={buttonClass('secondary')}><CalendarDays size={15} aria-hidden="true" />Xem lịch</Link>} />
      <KpiRow label="Tổng hợp hôm nay">
        <KpiTile label="Tour hôm nay" value={known ? all.length : '-'} />
        <KpiTile label="Chưa chốt" value={known ? count('SCHEDULED') : '-'} />
        <KpiTile label="Đã chốt" value={known ? count('READY') : '-'} />
        <KpiTile label="Đang diễn ra" value={known ? count('RUNNING') : '-'} />
      </KpiRow>
      <section className={`${panelClass} mt-4`} aria-label="Tour hôm nay">
        <div className="border-b border-[#f1f5f9] px-3.5 py-3">
          <FilterChips label="Lọc theo trạng thái" value={view} options={VIEWS}
            onChange={value => setParams(current => { const next = new URLSearchParams(current); if (value === 'all') next.delete('view'); else next.set('view', value); return next }, { replace: true })} />
        </div>
        {tours.isPending ? <div className="p-4"><LoadingPanel /></div>
          : tours.isError ? <div className="p-4"><ErrorPanel error={new Error(tourError(tours.error))} onRetry={() => void tours.refetch()} /></div>
          : rows.length === 0 ? <div className="p-4"><EmptyPanel>{all.length ? 'Không có Tour nào ở trạng thái này hôm nay.' : ahead.length ? 'Hôm nay không có Tour nào. Các Tour sắp tới ở bên dưới.' : 'Hôm nay không có Tour nào.'}</EmptyPanel></div>
          : <TourTable label="Tour hôm nay" tours={rows} />}
      </section>
      <section className={`${panelClass} mt-4`} aria-label="Tour sắp tới">
        <PanelHead title="Sắp tới" description="Tour chưa kết thúc trong 7 ngày tới. Kiểm tra trước khi bắt đầu mở được từ đây, nhưng chỉ bắt đầu được khi tới giờ." />
        {upcoming.isPending ? <div className="p-4"><LoadingPanel /></div>
          : upcoming.isError ? <div className="p-4"><ErrorPanel error={new Error(tourError(upcoming.error))} onRetry={() => void upcoming.refetch()} /></div>
          : ahead.length === 0 ? <div className="p-4"><EmptyPanel>Không có Tour nào trong 7 ngày tới.</EmptyPanel></div>
          : <TourTable label="Tour sắp tới" tours={ahead} dated />}
      </section>
    </StaffPage>
  )
}

/** One row per Tour with its next step. `dated` adds the day, for Tours that are not today. */
function TourTable({ label, tours, dated = false }: { label: string; tours: TourSummary[]; dated?: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left" aria-label={label}>
    <thead className="border-b border-[#e2e8f0]"><tr>{[dated ? 'Ngày giờ' : 'Giờ', 'Tour', 'Robot', 'Đoàn', 'Trạng thái', 'Bước tiếp theo'].map(head => <th key={head} scope="col" className={thClass}>{head}</th>)}</tr></thead>
    <tbody className="divide-y divide-[#eef1f4]">{tours.map(tour => {
      const step = nextStep(tour)
      return <tr key={tour.id} className={rowClass}>
        <td className={`${tdClass} font-semibold tabular-nums whitespace-nowrap`}>{dated && `${campusDate(tour.scheduledStartAt).slice(0, 5)} · `}{campusTime(tour.scheduledStartAt)}</td>
        <td className={tdClass}><span className="block font-semibold text-[#0f172a]">{tour.name}</span><span className="block text-xs text-[#64748b]">{tour.routeName}</span></td>
        <td className={`${tdClass} font-mono text-xs`}>{tour.reservation?.robotCode ?? '-'}</td>
        <td className={`${tdClass} tabular-nums`}>{tour.registrationCount} đoàn</td>
        <td className={tdClass}><TourStateBadge state={tour.state} /></td>
        <td className={tdClass}><Link to={step.to} className={buttonClass(tour.state === 'READY' || tour.state === 'RUNNING' ? 'primary' : 'secondary', 'sm')}>{step.label}</Link></td>
      </tr>
    })}</tbody>
  </table></div>
}
