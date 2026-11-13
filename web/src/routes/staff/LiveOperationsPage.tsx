import { CalendarDays, CircleCheck, Info, LifeBuoy, OctagonAlert, RefreshCw, TriangleAlert, UserRound, WifiOff } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { EmptyState } from '../../components/ui/EmptyState'
import { campusDateKey, formatDateTime, formatDurationBetween, formatTime } from '../../components/ui/date-time'
import { buttonClass } from '../../components/ui/ui-classes'
import type { TourDetails } from '../../features/administration/tours/types'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { useNow } from '../../features/staff/use-now'
import { useFleetConnection } from '../../features/staff/operations/fleet-telemetry'
import { isTourStale, useDayTours, useOperationTour, useRunningTours, useUpcomingTours } from '../../features/staff/operations/hooks'
import { HeadControlPanel } from '../../features/staff/operations/live/HeadControlPanel'
import { LiveCamera } from '../../features/staff/operations/live/LiveCamera'
import { LiveMiniMap } from '../../features/staff/operations/live/LiveMiniMap'
import { CommandCard, ExecutionPanel, RobotTelemetryPanel, RouteStopList, TourStateBadge } from '../../features/staff/operations/OperationParts'
import { tourSituation, type ConsoleAction, type Situation } from '../../features/staff/operations/situation'
import { ConsoleActionButton, EndEarlyAction } from '../../features/staff/operations/TourActions'
import { TourStepper } from '../../features/staff/operations/TourStepper'
import { useAuthStore } from '../../stores/auth-store'

/**
 * Live operations of one Tour: while it runs, everything the Operator needs is
 * on this page. The main column holds the camera, then what is happening and
 * the one suggested step; the side column the camera head, the map, the robot
 * and End Early. Below 1024px the page reads in DOM order: camera, situation,
 * head, End Early, map, robot, route. Without an id it opens the running Tour,
 * the one needing help first.
 */
export default function LiveOperationsPage() {
  const { tourId } = useParams()
  return tourId ? <TourConsole tourId={tourId} /> : <RunningPicker />
}

function RunningPicker() {
  const running = useRunningTours()
  const day = campusDateKey(useNow(60_000))
  const today = useDayTours(day)
  const upcoming = useUpcomingTours(day)
  if (running.isError && !running.list.data) return <StaffPage><ErrorPanel error={running.list.error} onRetry={() => void running.list.refetch()} /></StaffPage>
  if (running.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  const first = running.tours.find(tour => tour.execution?.operationalStatus === 'NEEDS_ASSISTANCE') ?? running.tours[0]
  if (first) return <Navigate to={`/staff/live/${first.tour.id}`} replace />
  // Both lists come in start order, today first.
  const next = [...(today.data?.data ?? []), ...(upcoming.data?.data ?? [])].find(tour => tour.state === 'READY')
  const schedule = <Link to="/staff/schedule" className={buttonClass('secondary', 'sm')}><CalendarDays size={14} aria-hidden="true" />Xem lịch</Link>
  return <StaffPage>
    <PageHeader eyebrow="Điều hành" title="Điều hành trực tiếp" description="Không có Tour nào đang chạy." />
    <section className={panelClass} aria-label="Tour đã chốt kế tiếp">
      {next ? <>
        <PanelHead title="Tour đã chốt kế tiếp" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0"><span className="block text-sm font-semibold text-[#0f172a]">{next.name}</span>
            <span className="block text-xs text-muted">{formatDateTime(next.scheduledStartAt)} · {next.routeName}</span></span>
          <span className="flex flex-wrap gap-2">
            <Link to={`/staff/tours/${next.id}/start`} className={buttonClass('primary', 'sm')}>Kiểm tra trước khi bắt đầu</Link>
            {schedule}
          </span>
        </div>
      </> : today.isPending || upcoming.isPending ? <LoadingPanel />
        : <EmptyState variant="empty" title="Chưa có Tour nào đã chốt trong 7 ngày tới" action={schedule} />}
    </section>
  </StaffPage>
}

function TourConsole({ tourId }: { tourId: string }) {
  const tour = useOperationTour(tourId)
  const now = useNow(1000)
  const viewerId = useAuthStore(store => store.user?.userId ?? null)
  if (tour.isPending) return <StaffPage wide><LoadingPanel /></StaffPage>
  // A failed poll keeps the last answer on screen, marked as old; only a first load that fails has nothing to show.
  if (!tour.data) return <StaffPage wide><ErrorPanel error={tour.error} onRetry={() => void tour.refetch()} /></StaffPage>
  const detail = tour.data
  const { tour: summary, reservation, operator } = detail
  const started = summary.state === 'RUNNING' || Boolean(detail.startedAt)
  const running = summary.state === 'RUNNING'
  // Only a Tour that is polled can fall behind; an ended one is read once and stays true.
  const live = running || summary.state === 'READY'
  const stale = live && isTourStale(tour, now)
  const isOperator = Boolean(operator && viewerId && operator.userId === viewerId)

  return (
    <StaffPage wide>
      <TourStepper detail={detail} page="live" />
      <PageHeader eyebrow="Điều hành trực tiếp" title={summary.name}
        description={`${formatDateTime(summary.scheduledStartAt)} · ${detail.routeRevision?.name ?? summary.routeName} · robot ${reservation?.robotCode ?? '-'} · người vận hành ${operator?.fullName ?? '-'}`}
        action={<><TourStateBadge tour={summary} /><Link to={`/staff/manage/tours/${summary.id}`} className={buttonClass('secondary', 'sm')}>Thông tin Tour</Link></>} />

      <Freshness stale={stale} updatedAt={tour.dataUpdatedAt} now={now} live={live} fetching={tour.isFetching} onRefresh={() => void tour.refetch()} />

      {!started ? <div className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-[#334155]">{summary.state === 'READY' ? 'Tour đã chốt nhưng chưa bắt đầu.' : summary.state === 'SCHEDULED' ? 'Tour chưa được chốt.' : 'Tour không chạy.'}</p>
        <Link to={summary.state === 'READY' ? `/staff/tours/${summary.id}/start` : `/staff/manage/tours/${summary.id}`} className={buttonClass('primary', 'sm')}>{summary.state === 'READY' ? 'Kiểm tra trước khi bắt đầu' : 'Mở trang chuẩn bị Tour'}</Link>
      </div> : <div data-testid="live-layout" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        {/* DOM order is the narrow-screen order; from 1024px the grid and `order` place the two columns. */}
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          {running && <section className={panelClass} aria-label="Camera">
            <div className="p-3"><LiveCamera robotCode={reservation?.robotCode} /></div>
          </section>}
          <SituationCard detail={detail} isOperator={isOperator} stale={stale} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {running && <section className={`${panelClass} lg:order-1`} aria-label="Đầu camera">
            <PanelHead title="Đầu camera" />
            <div className="p-4"><HeadControlPanel tourId={summary.id} isOperator={isOperator} operatorName={operator?.fullName} /></div>
          </section>}
          {running && isOperator && <section className={`${panelClass} border-[#f5c8c2] lg:order-4`} aria-label="Kết thúc sớm">
            <PanelHead title="Kết thúc sớm" description="Khi Tour không thể hoặc không nên tiếp tục." />
            <div className="p-4"><EndEarlyAction detail={detail} /></div>
          </section>}
          <section className={`${panelClass} lg:order-2`} aria-label="Bản đồ">
            <PanelHead title="Bản đồ" />
            <div className="p-3"><LiveMiniMap detail={detail} /></div>
          </section>
          <section className={`${panelClass} lg:order-3`} aria-label="Robot">
            <PanelHead title="Robot" />
            <div className="p-4"><RobotTelemetryPanel robotCode={reservation?.robotCode} /></div>
          </section>
          <p className="flex gap-2 rounded-xl border border-[#f5c8c2] bg-[#fff4f2] px-3 py-2.5 text-xs leading-5 font-semibold text-[#9d3428] lg:order-5">
            <OctagonAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Trang web không phải nút dừng khẩn cấp. Khi nguy hiểm, bấm nút dừng khẩn cấp trên robot.
          </p>
        </aside>
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
          <section className={panelClass} aria-label="Tuyến của Tour">
            <PanelHead title="Tuyến" />
            <div className="p-4"><RouteStopList detail={detail} /></div>
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <section className={panelClass} aria-label="Trạng thái Tour">
              <PanelHead title="Trạng thái Tour" />
              <div className="p-4"><ExecutionPanel detail={detail} now={now} /></div>
            </section>
            <section className={panelClass} aria-label="Lệnh robot">
              <PanelHead title="Lệnh robot của chặng" />
              <div className="p-4"><CommandCard command={detail.execution?.command} legId={detail.execution?.currentLegId} robotCode={reservation?.robotCode} /></div>
            </section>
          </div>
        </div>
      </div>}
    </StaffPage>
  )
}

/**
 * Says how current the Tour on screen is. A failed or paused poll is shown,
 * never hidden behind the last good answer.
 */
function Freshness({ stale, updatedAt, now, live, fetching, onRefresh }: { stale: boolean; updatedAt: number; now: number; live: boolean; fetching: boolean; onRefresh: () => void }) {
  const at = updatedAt ? formatTime(updatedAt) : '-'
  if (!stale) return <p className="mb-3 text-xs text-muted" role="status">{live ? `Tự cập nhật. Lần cuối lúc ${at}.` : `Cập nhật lúc ${at}.`}</p>
  return (
    <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-4 py-3 text-[13px] text-[#7d5310]">
      <span className="flex min-w-0 items-start gap-2"><WifiOff size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><span className="block font-bold">Không cập nhật được từ máy chủ từ {at}{updatedAt ? ` (${formatDurationBetween(updatedAt, now)} trước)` : ''}</span>
          <span className="block leading-5">Thông tin dưới đây có thể đã cũ. Đi tiếp và Thử lại chặng tạm khóa cho tới khi màn hình cập nhật lại.</span></span></span>
      <button type="button" className={buttonClass('secondary', 'sm')} onClick={onRefresh} disabled={fetching}><RefreshCw size={14} aria-hidden="true" />{fetching ? 'Đang tải…' : 'Tải lại'}</button>
    </div>
  )
}

const SITUATION_STYLE: Record<Situation['tone'], { box: string; icon: typeof Info }> = {
  ok: { box: 'border-[#b8dec9] bg-[#edf8f1] text-[#236344]', icon: CircleCheck },
  info: { box: 'border-[#d8e5f7] bg-[#f5f9ff] text-[#35507a]', icon: Info },
  warn: { box: 'border-[#f1dcb0] bg-[#fffaf0] text-[#7d5310]', icon: TriangleAlert },
  danger: { box: 'border-[#f5c8c2] bg-[#fff4f2] text-[#9d3428]', icon: LifeBuoy },
}

const EXTRA_ACTIONS: ConsoleAction[] = ['next', 'retryLeg', 'reconcile']

/**
 * What is happening and the one step it calls for. Only the Tour's Operator gets
 * buttons; anyone else reads the same situation and is told who acts. An action
 * the server allows that the situation did not expect is still offered, so the
 * screen cannot hide a way forward the server opened.
 */
function SituationCard({ detail, isOperator, stale }: { detail: TourDetails; isOperator: boolean; stale: boolean }) {
  const situation = tourSituation(detail)
  const style = SITUATION_STYLE[situation.tone]
  const connection = useFleetConnection(store => store.state)
  const running = detail.tour.state === 'RUNNING'
  const extras = EXTRA_ACTIONS.filter(action => action !== situation.action && detail.allowedActions?.[action]?.allowed)
  const actions = situation.action ? [situation.action, ...extras] : extras
  // The Operator's console presence is a movement check (ADR-0042); it is this browser's operations-hub connection.
  const consoleOffline = running && isOperator && connection !== 'connected' && actions.some(action => action === 'next' || action === 'retryLeg')
  const frozen = stale ? 'Màn hình chưa cập nhật được từ máy chủ, nên thao tác làm robot di chuyển tạm khóa.' : null

  return (
    <section className={panelClass} aria-label="Tình hình hiện tại">
      <div className={`m-3 flex items-start gap-3 rounded-xl border px-4 py-3 ${style.box}`} role={situation.tone === 'danger' ? 'alert' : 'status'}>
        <style.icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{situation.title}</p>
          <p className="mt-0.5 text-[13px] leading-5">{situation.body}</p>
        </div>
      </div>
      {(actions.length > 0 || situation.onlyEndEarly || consoleOffline || (!isOperator && (running || situation.action))) && <div className="space-y-3 px-4 pb-4">
        {!isOperator ? <p className="flex gap-2 text-[13px] leading-5 text-[#475569]"><UserRound size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Bạn đang xem Tour này. Chỉ {detail.operator?.fullName ?? 'người vận hành được giao'} mới thao tác được.</p>
          : <>
            {consoleOffline && <p className="text-[13px] leading-5 font-semibold text-[#7d5310]">Trang điều hành của bạn chưa kết nối với máy chủ, nên máy chủ chặn lệnh di chuyển mới cho tới khi kết nối lại.</p>}
            {actions.length > 0 && <div className="grid gap-3 sm:max-w-md">{actions.map(action => <ConsoleActionButton key={action} action={action} detail={detail} frozen={action === 'reconcile' ? null : frozen} />)}</div>}
            {situation.onlyEndEarly && actions.length === 0 && running && <p className="text-[13px] leading-5 text-[#475569]">Không có thao tác nào khác tiếp tục được Tour. Dùng mục Kết thúc sớm.</p>}
          </>}
      </div>}
    </section>
  )
}
