import { Link, useSearchParams } from 'react-router'
import { FilterChips, LoadingPanel, PanelHead, panelClass } from '../../../components/ui/ConsolePrimitives'
import { campusDateKey, formatDate, formatTime } from '../../../components/ui/date-time'
import { EmptyState } from '../../../components/ui/EmptyState'
import { buttonClass, rowClass, thClass } from '../../../components/ui/ui-classes'
import { tourError } from '../../administration/tours/tour-messages'
import type { TourState, TourSummary } from '../../administration/tours/types'
import { ErrorPanel } from '../StaffUi'
import { useFleetTelemetry, type FleetSnapshot } from './fleet-telemetry'
import { useDayTours, type useUpcomingTours } from './hooks'
import { noTourToday, operatorLabel, useMineFilter } from './mine'
import { ToneBadge, TourStateBadge } from './OperationParts'
import { nextStep } from './next-step'

type View = 'all' | 'SCHEDULED' | 'READY' | 'RUNNING' | 'ended'
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'all', label: 'Tất cả' }, { value: 'SCHEDULED', label: 'Chưa chốt' }, { value: 'READY', label: 'Đã chốt' },
  { value: 'RUNNING', label: 'Đang diễn ra' }, { value: 'ended', label: 'Đã xong / hủy' },
]
const ENDED: TourState[] = ['COMPLETED', 'CANCELLED']
const matches = (tour: TourSummary, view: View) => view === 'all' || (view === 'ended' ? ENDED.includes(tour.state) : tour.state === view)

/** Today's Tours, filtered by state (`?view=`), each with its robot's own report and its one next step. */
export function TodayTours() {
  const [params, setParams] = useSearchParams()
  const today = campusDateKey(new Date())
  const tours = useDayTours(today)
  const { keep, mine } = useMineFilter()
  const asked = params.get('view') as View | null
  const view: View = asked && VIEWS.some(item => item.value === asked) ? asked : 'all'
  const all = (tours.data?.data ?? []).filter(keep)
  const rows = all.filter(tour => matches(tour, view))
  const options = VIEWS.map(item => tours.isSuccess ? { ...item, label: `${item.label} (${all.filter(tour => matches(tour, item.value)).length})` } : item)
  const setView = (value: View) => setParams(current => { const next = new URLSearchParams(current); if (value === 'all') next.delete('view'); else next.set('view', value); return next }, { replace: true })

  // No Tour today: one line, no empty frame and no row of "(0)" filters.
  if (tours.isSuccess && all.length === 0) return <p role="status" aria-label="Tour hôm nay" className="rounded-xl border border-[#e2e8f0] bg-white px-4 py-3 text-[13px] text-[#475569]">{noTourToday(mine)}</p>

  return <section className={panelClass} aria-label="Tour hôm nay">
    <PanelHead title={`Hôm nay, ${formatDate(`${today}T05:00:00Z`)}`} />
    <div className="border-b border-[#f1f5f9] px-3.5 py-3">
      <FilterChips label="Lọc theo trạng thái" value={view} options={options}
        onChange={setView} />
    </div>
    {tours.isPending ? <div className="p-4"><LoadingPanel /></div>
      : tours.isError ? <div className="p-4"><ErrorPanel error={new Error(tourError(tours.error))} onRetry={() => void tours.refetch()} /></div>
      : rows.length === 0 ? <EmptyState variant="noMatch" title="Không có Tour nào ở trạng thái này hôm nay." onClear={() => setView('all')} />
      : <TourTable label="Tour hôm nay" tours={rows} />}
  </section>
}

/** The not-ended Tours of the next week, so a Tour on a later day is still one click away. */
export function UpcomingTours({ upcoming }: { upcoming: ReturnType<typeof useUpcomingTours> }) {
  const { keep } = useMineFilter()
  const ahead = (upcoming.data?.data ?? []).filter(tour => !ENDED.includes(tour.state) && keep(tour))
  return <section className={panelClass} aria-label="Tour sắp tới">
    <PanelHead title="Sắp tới" description="Tour chưa kết thúc trong 7 ngày tới."
      action={<Link to="/staff/schedule" className={buttonClass('ghost', 'sm')}>Xem lịch</Link>} />
    {upcoming.isPending ? <div className="p-4"><LoadingPanel /></div>
      : upcoming.isError ? <div className="p-4"><ErrorPanel error={new Error(tourError(upcoming.error))} onRetry={() => void upcoming.refetch()} /></div>
      : ahead.length === 0 ? <EmptyState variant="empty" title="Chưa có Tour nào trong 7 ngày tới." />
      : <TourTable label="Tour sắp tới" tours={ahead} dated />}
  </section>
}

/**
 * The held robot's own report, for a Tour that has not ended: whether the robot
 * channel has a recent report from it. Says nothing before the first broadcast,
 * and never "ready": a report is not readiness (that is the pre-start check).
 */
function RobotReport({ robotCode, snapshot }: { robotCode: string; snapshot: FleetSnapshot | null }) {
  if (!snapshot) return null
  const robot = snapshot.robots.find(item => item.id === robotCode)
  if (!robot) return <ToneBadge tone="warn">Chưa báo cáo</ToneBadge>
  return robot.syncFresh ? <ToneBadge tone="ok">Đang báo cáo</ToneBadge> : <ToneBadge tone="warn">Báo cáo cũ</ToneBadge>
}

/** One row per Tour with its next step. `dated` adds the day, for Tours that are not today. */
function TourTable({ label, tours, dated = false }: { label: string; tours: TourSummary[]; dated?: boolean }) {
  const snapshot = useFleetTelemetry()
  const { isMine } = useMineFilter()
  const cell = 'min-w-0 text-[13px] align-middle @min-[660px]:px-3 @min-[660px]:py-3'
  return <div className="@container"><table role="table" className="block w-full text-left @min-[660px]:table" aria-label={label}>
    <thead role="rowgroup" className="sr-only border-b border-slate-200 @min-[660px]:not-sr-only">
      <tr role="row">{[dated ? 'Ngày giờ' : 'Giờ', 'Tour', 'Robot', 'Đoàn', 'Trạng thái', 'Bước tiếp theo'].map(head => <th role="columnheader" key={head} scope="col" className={thClass}>{head}</th>)}</tr>
    </thead>
    <tbody role="rowgroup" className="block divide-y divide-slate-100 @min-[660px]:table-row-group">{tours.map(tour => {
      const step = nextStep(tour)
      const robotCode = tour.reservation?.robotCode
      return <tr key={tour.id} role="row" className={`${rowClass} grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-3 @min-[660px]:table-row`}>
        <td role="cell" className={`${cell} font-semibold tabular-nums whitespace-nowrap`}>
          {dated && <span className="mr-1 block text-xs text-slate-600 @min-[660px]:inline">{formatDate(tour.scheduledStartAt).slice(0, 5)}</span>}
          {formatTime(tour.scheduledStartAt)}
        </td>
        <td role="cell" className={`${cell} col-span-2 break-words`}>
          <Link to={`/staff/manage/tours/${tour.id}`} className="block font-semibold text-slate-900 underline-offset-2 hover:text-sky-800 hover:underline focus-visible:outline-2 focus-visible:outline-sky-800">{tour.name}</Link>
          {tour.routeName && <span className="block text-xs text-slate-600">{tour.routeName}</span>}
          <span className="block text-xs text-slate-600">{operatorLabel(tour, isMine(tour))}</span>
        </td>
        <td role="cell" className={`${cell} col-span-2`}>{robotCode ? <span className="flex flex-wrap items-center gap-1 @min-[660px]:flex-col @min-[660px]:items-start"><span className="text-xs font-medium">{robotCode}</span>{!dated && !ENDED.includes(tour.state) && <RobotReport robotCode={robotCode} snapshot={snapshot} />}</span> : '-'}</td>
        <td role="cell" className={`${cell} text-right tabular-nums whitespace-nowrap @min-[660px]:text-left`}>{tour.registrationCount} đoàn</td>
        <td role="cell" className={`${cell} col-span-2 self-center`}><TourStateBadge tour={tour} /></td>
        <td role="cell" className={`${cell} text-right`}><Link to={step.to} className={buttonClass(tour.state === 'READY' || tour.state === 'RUNNING' ? 'primary' : 'secondary', 'sm')}>{step.label}</Link></td>
      </tr>
    })}</tbody>
  </table></div>
}
