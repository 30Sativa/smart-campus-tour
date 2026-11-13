import { ArrowRight, CalendarDays, LifeBuoy, Plus, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { campusDateKey, formatDate, formatTime } from '../../components/ui/date-time'
import { ReviewDrawer } from '../../features/administration/registrations/components/ReviewDrawer'
import { useReviewParam } from '../../features/administration/use-review-param'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { WorkQueue } from '../../features/staff/WorkQueue'
import { useFleetConnection, useFleetTelemetry } from '../../features/staff/operations/fleet-telemetry'
import { RECONCILE_HEADLINE, RECONCILE_HINT } from '../../features/staff/operations/attention'
import { isTourStale, useDayTours, useRunningTours, useToursNeedingReconcile } from '../../features/staff/operations/hooks'
import { useNow } from '../../features/staff/use-now'
import { TodayTours, UpcomingTours } from '../../features/staff/operations/DayTours'
import { STEP_LABEL, assistanceInfo, commandStateInfo } from '../../features/staff/operations/operation-labels'
import { ToneBadge } from '../../features/staff/operations/OperationParts'
import { noTourToday, operatorLabel, useMineFilter } from '../../features/staff/operations/mine'
import type { TourSummary } from '../../features/administration/tours/types'

const CONNECTION_TEXT = { connecting: 'Đang kết nối cập nhật trực tiếp…', connected: 'Đã kết nối cập nhật trực tiếp.', reconnecting: 'Đang kết nối lại cập nhật trực tiếp…', disconnected: 'Mất kết nối cập nhật trực tiếp, đang thử lại.' } as const

type Read = { isRefetchError: boolean; dataUpdatedAt: number }

/**
 * When the Tour data on this page was last read, and whether it may be out of
 * date. Tours are polled, not pushed, so the live connection's state says nothing
 * about them. Uses the oldest of the reads the page is built from.
 */
function freshness(reads: Read[], now: number): { text: string; stale: boolean } | null {
  const done = reads.filter(read => read.dataUpdatedAt > 0)
  if (done.length === 0) return null
  const at = formatTime(Math.min(...done.map(read => read.dataUpdatedAt)))
  return reads.some(read => isTourStale(read, now))
    ? { text: `Dữ liệu Tour có thể đã cũ: lần đọc thành công cuối lúc ${at}. Đang thử lại.`, stale: true }
    : { text: `Dữ liệu Tour đọc lúc ${at}, tự cập nhật.`, stale: false }
}

/**
 * The page's one status line: what runs now (when nothing does), the next Tour of
 * the day, how fresh the Tour data is and, only when it is not connected, the live
 * connection. One sentence after another, so the page opens on a single line.
 */
function StatusLine({ parts, warn }: { parts: Array<string | null | false | undefined>; warn: boolean }) {
  const text = parts.filter(Boolean).join(' ')
  if (!text) return null
  return <p role="status" className={`rounded-xl border bg-white px-4 py-3 text-[13px] ${warn ? 'border-[#f1dcb0] font-semibold text-[#7d5310]' : 'border-[#e2e8f0] text-[#475569]'}`}>{text}</p>
}

/**
 * The Staff home: one page for the whole working day, ordered by how soon a
 * person has to act. "Bây giờ" (Tours needing assistance or a reconcile, the
 * running Tours), then today's Tours beside the preparation queue
 * (registrations, Tours not READY, POIs), then the next seven days. The former
 * preparation overview (`/staff/manage`) redirects here. Everything is read from
 * the system; nothing is seeded.
 */
export default function OverviewPage() {
  const today = campusDateKey(new Date())
  const tours = useDayTours(today)
  const running = useRunningTours()
  const ended = useToursNeedingReconcile()
  const now = useNow(5_000)
  const { reviewId, close } = useReviewParam()
  const { mine, setMine, keep, isMine } = useMineFilter()
  const list = (tours.data?.data ?? []).filter(keep)
  // Alerts are never filtered: whoever sees one first can call the Operator.
  const assistance = running.tours.filter(detail => detail.execution?.operationalStatus === 'NEEDS_ASSISTANCE')
  const next = list.find(tour => tour.state === 'READY' || tour.state === 'SCHEDULED')
  const urgent = assistance.length > 0 || ended.tours.length > 0
  const who = (tour: TourSummary) => operatorLabel(tour, isMine(tour))
  const withOperator = (hint: string, tour: TourSummary) => [hint, who(tour)].filter(Boolean).join(' ')
  const connection = useFleetConnection(store => store.state)
  const noneToday = tours.isSuccess && list.length === 0
  const shownRunning = running.tours.filter(detail => keep(detail.tour))
  const idle = !running.isError && !running.isPending && shownRunning.length === 0
  const fresh = freshness([running.list, tours], now)
  const status = [
    idle && (mine ? 'Bạn không vận hành Tour nào đang chạy.' : 'Không có Tour nào đang chạy.'),
    idle && (noneToday ? noTourToday(mine) : next ? `Tour kế tiếp hôm nay: ${next.name} lúc ${formatTime(next.scheduledStartAt)}.` : tours.isSuccess && 'Hôm nay không còn Tour nào chờ bắt đầu.'),
    !idle && noneToday && noTourToday(mine),
    fresh?.text,
    connection !== 'connected' && CONNECTION_TEXT[connection],
  ]
  const queue = <div className="grid items-start gap-4">
    <WorkQueue urgent={urgent} />
    <RobotReports />
  </div>

  return (
    <StaffPage>
      <PageHeader eyebrow="Vận hành" title="Tổng quan" description={`Ngày ${formatDate(`${today}T05:00:00Z`)}.`}
        action={<>
          <button type="button" aria-pressed={mine} onClick={() => setMine(!mine)} className={buttonClass(mine ? 'primary' : 'ghost')}>
            <UserRound size={15} aria-hidden="true" />Chỉ Tour tôi vận hành
          </button>
          <Link to="/staff/schedule" className={buttonClass('secondary')}><CalendarDays size={15} aria-hidden="true" />Xem lịch</Link>
          <Link to="/staff/manage/tours/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo Tour</Link>
        </>} />

      <section aria-label="Bây giờ" className="mb-4 space-y-2">
        {assistance.map(detail => {
          const reason = assistanceInfo(detail.execution?.assistanceReason)
          return <Alert key={detail.tour.id} title={`${detail.tour.name} cần hỗ trợ: ${reason.label}`} hint={withOperator(reason.hint, detail.tour)} to={`/staff/live/${detail.tour.id}`} action="Mở điều hành" />
        })}
        {ended.tours.map(tour => <Alert key={tour.id} title={`${tour.name}: ${RECONCILE_HEADLINE}`} hint={withOperator(RECONCILE_HINT, tour)} to={`/staff/live/${tour.id}`} action="Mở để đối soát" />)}
        <StatusLine parts={status} warn={Boolean(fresh?.stale) || connection !== 'connected'} />
        <RunningTours running={running} shown={shownRunning} who={who} />
      </section>

      {noneToday ? <>
        {/* No Tour today: the status line says so, then the coming days, then the queue. */}
        <UpcomingTours />
        <div className="mt-4">{queue}</div>
      </> : <>
        <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <TodayTours />
          {queue}
        </div>
        <UpcomingTours />
      </>}
      {reviewId && <ReviewDrawer key={reviewId} id={reviewId} onClose={close} />}
    </StaffPage>
  )
}

function Alert({ title, hint, to, action }: { title: string; hint: string; to: string; action: string }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f5c8c2] bg-[#fff4f2] px-4 py-3 text-[13px] text-[#9d3428]">
    <span className="flex min-w-0 items-start gap-2"><LifeBuoy size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span><span className="block font-bold">{title}</span><span className="block">{hint}</span></span></span>
    <Link to={to} className={buttonClass('danger', 'sm')}>{action}</Link>
  </div>
}

/** The running Tours with their step and command. With none running the status line says so. */
function RunningTours({ running, shown, who }: {
  running: ReturnType<typeof useRunningTours>; shown: ReturnType<typeof useRunningTours>['tours']; who: (tour: TourSummary) => string | null
}) {
  if (running.isError) return <ErrorPanel error={running.list.error} onRetry={() => void running.list.refetch()} />
  if (running.isPending) return <LoadingPanel />
  if (shown.length === 0) return null
  return <section className={panelClass} aria-label="Tour đang chạy">
    <PanelHead title={`Đang chạy (${shown.length})`} />
    <ul className="divide-y divide-[#f1f5f9] px-4">{shown.map(detail => {
      const command = detail.execution?.commandState
      return <li key={detail.tour.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#0f172a]">{detail.tour.name}</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {detail.execution?.operationalStatus === 'NEEDS_ASSISTANCE' && <ToneBadge tone="danger">Cần hỗ trợ</ToneBadge>}
            {detail.execution?.currentStep && <ToneBadge tone="info">{STEP_LABEL[detail.execution.currentStep] ?? 'Bước khác'}</ToneBadge>}
            {command && <ToneBadge tone={commandStateInfo(command).tone}>Lệnh: {commandStateInfo(command).label}</ToneBadge>}
            {detail.tour.reservation?.robotCode && <ToneBadge tone="muted">{detail.tour.reservation.robotCode}</ToneBadge>}
          </span>
          {who(detail.tour) && <span className="mt-1 block text-xs text-[#64748b]">{who(detail.tour)}</span>}
        </span>
        <Link to={`/staff/live/${detail.tour.id}`} className={buttonClass('primary', 'sm')}>Mở điều hành<ArrowRight size={14} aria-hidden="true" /></Link>
      </li>
    })}</ul>
  </section>
}

/** What each robot itself reported over the robot channel. A recent report is not readiness for a Tour. */
function RobotReports() {
  const fleet = useFleetTelemetry()
  return <section className={panelClass} aria-label="Robot">
    <PanelHead title="Robot" description="Báo cáo gần đây không có nghĩa robot đã sẵn sàng." action={<Link to="/staff/robot" className={buttonClass('ghost', 'sm')}>Robot & thiết bị</Link>} />
    <div className="space-y-2 p-4">
      {!fleet ? <p className="text-sm text-[#64748b]">Chưa nhận được báo cáo nào.</p>
        : fleet.robots.length === 0 ? <p className="text-sm text-[#64748b]">Chưa có robot nào gửi báo cáo tới máy chủ.</p>
        : <ul className="divide-y divide-[#f1f5f9]">{fleet.robots.map(robot => <li key={robot.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
          <span className="min-w-0"><span className="block font-semibold text-[#0f172a]">{robot.name}</span><span className="block font-mono text-[11px] text-[#64748b]">{robot.id}</span></span>
          <ToneBadge tone={robot.syncFresh ? 'ok' : 'warn'}>{robot.syncFresh ? 'Đang báo cáo' : 'Báo cáo cũ'}</ToneBadge>
        </li>)}</ul>}
    </div>
  </section>
}
