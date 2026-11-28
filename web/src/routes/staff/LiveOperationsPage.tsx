import { CalendarDays, Camera, ChevronDown, CircleCheck, Info, LifeBuoy, MessagesSquare, OctagonAlert, RefreshCw, TriangleAlert, UserRound, Vote, WifiOff } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { LoadingPanel, PageHeader, PanelHead, panelClass } from '../../components/ui/ConsolePrimitives'
import { EmptyState } from '../../components/ui/EmptyState'
import { campusDateKey, formatDateTime, formatDurationBetween, formatTime } from '../../components/ui/date-time'
import { buttonClass } from '../../components/ui/ui-classes'
import { usePageTitle } from '../../components/ui/use-page-title'
import type { TourDetails } from '../../features/administration/tours/types'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { useNow } from '../../features/staff/use-now'
import { useFleetConnection, useFleetRobot } from '../../features/staff/operations/fleet-telemetry'
import { isTourStale, useDayTours, useOperationTour, useRunningTours, useUpcomingTours } from '../../features/staff/operations/hooks'
import { HeadControlPanel } from '../../features/staff/operations/live/HeadControlPanel'
import { LiveCamera } from '../../features/staff/operations/live/LiveCamera'
import { LiveMiniMap } from '../../features/staff/operations/live/LiveMiniMap'
import { ControlTabs, type ControlTab } from '../../features/staff/operations/live/ControlTabs'
import { useStaffTalkFeed } from '../../features/staff/operations/live/tour-talk'
import { TourTalkPanel } from '../../features/staff/operations/live/TourTalkPanel'
import { CommandCard, ExecutionPanel, RobotStatusCard, RobotTelemetryPanel, RouteStopList, TourStateBadge } from '../../features/staff/operations/OperationParts'
import { actionGate, tourSituation, type ConsoleAction, type Situation } from '../../features/staff/operations/situation'
import { AutoAdvanceToggle, ConsoleActionButton, EndEarlyAction, VideoModePanel } from '../../features/staff/operations/TourActions'
import { TourStepper } from '../../features/staff/operations/TourStepper'
import { VotePanel } from '../../features/staff/operations/VotePanel'
import { voteOpen } from '../../features/staff/operations/ballot-live'
import { useAuthStore } from '../../stores/auth-store'

/**
 * Live operations of one Tour: while it runs, everything the Operator needs is
 * on this page, most needed first. A short header (back, the Tour's steps, its
 * name and state), then the situation with the one suggested step across the
 * page. Below it two columns: the camera, the route with the map and the
 * technical details on the left; one tabbed card (vote, camera head, talk), the
 * robot and End Early on the right, each column running on without waiting for
 * the other. Below 1024px: situation, camera, the tabbed card, robot, End Early,
 * route and map, technical details. Without an id it opens the running Tour,
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
    <PageHeader eyebrow="Vận hành" title="Điều hành trực tiếp" description="Không có Tour nào đang chạy." />
    <section className={panelClass} aria-label="Tour đã chốt kế tiếp">
      {next ? <>
        <PanelHead title="Tour đã chốt kế tiếp" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0"><span className="block text-sm font-semibold text-[#0f172a]">{next.name}</span>
            <span className="block text-xs text-muted">{formatDateTime(next.scheduledStartAt)} · {next.routeName}</span></span>
          <span className="flex flex-wrap gap-2">
            <Link to={`/staff/tours/${next.id}/start`} className={buttonClass('primary', 'sm')}>Mở Tour</Link>
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
  const started = Boolean(tour.data && (tour.data.tour.state === 'RUNNING' || tour.data.startedAt))
  // The same feed the talk panel polls (one query); its size marks the talk tab when a message arrives unseen.
  const talkCount = useStaffTalkFeed(tourId, started).data?.messages.length
  usePageTitle(tour.data?.tour.name ?? '')
  if (tour.isPending) return <StaffPage wide><LoadingPanel /></StaffPage>
  // A failed poll keeps the last answer on screen, marked as old; only a first load that fails has nothing to show.
  if (!tour.data) return <StaffPage wide><ErrorPanel error={tour.error} onRetry={() => void tour.refetch()} /></StaffPage>
  const detail = tour.data
  const { tour: summary, reservation, operator } = detail
  const running = summary.state === 'RUNNING'
  // Only a Tour that is polled can fall behind; an ended one is read once and stays true.
  const live = running || summary.state === 'READY'
  const stale = live && isTourStale(tour, now)
  const isOperator = Boolean(operator && viewerId && operator.userId === viewerId)
  const refresh = () => void tour.refetch()

  // ADR-0065 vote first (it opens on it), the camera head while the robot runs, and ADR-0070 talk with the Viewers.
  const tabs: ControlTab[] = [
    ...(detail.routeRevision?.viewerChoosesNextStop ? [{ id: 'vote', label: 'Bầu chọn', icon: Vote, urgent: voteOpen(detail),
      content: <section aria-label="Viewer chọn điểm tiếp theo"><VotePanel detail={detail} isOperator={isOperator} now={now} /></section> }] : []),
    ...(running ? [{ id: 'head', label: 'Đầu camera', icon: Camera,
      content: <section aria-label="Đầu camera" className="p-4"><HeadControlPanel tourId={summary.id} isOperator={isOperator} operatorName={operator?.fullName} step={detail.execution?.currentStep ?? null} /></section> }] : []),
    { id: 'talk', label: 'Trò chuyện', icon: MessagesSquare, count: talkCount,
      content: <section aria-label="Trò chuyện với người xem">
        <p className="px-4 pt-3 text-xs text-muted">Nói hoặc nhắn cho cả đoàn; người xem trả lời bằng chữ.</p>
        <TourTalkPanel tourId={summary.id} operatorName={operator?.fullName} />
      </section> },
  ]

  return (
    <StaffPage wide>
      <TourStepper detail={detail} page="live" compact />
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[22px] leading-tight font-bold tracking-[-0.02em] text-[#0f172a]">{summary.name}<TourStateBadge tour={summary} /></h1>
          <p className="mt-1 text-[13px] text-[#64748b]">{formatDateTime(summary.scheduledStartAt)} · {detail.routeRevision?.name ?? summary.routeName} · robot {reservation?.robotCode ?? '-'} · người vận hành {operator?.fullName ?? '-'}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {!stale && <Freshness stale={false} updatedAt={tour.dataUpdatedAt} now={now} live={live} fetching={tour.isFetching} onRefresh={refresh} />}
          <Link to={`/staff/manage/tours/${summary.id}`} className={buttonClass('secondary', 'sm')}>Thông tin Tour</Link>
        </div>
      </header>
      {stale && <Freshness stale updatedAt={tour.dataUpdatedAt} now={now} live={live} fetching={tour.isFetching} onRefresh={refresh} />}

      {!started ? <div className={`${panelClass} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-[#334155]">{summary.state === 'READY' ? 'Tour đã chốt nhưng chưa mở.' : summary.state === 'SCHEDULED' ? 'Tour chưa được chốt.' : 'Tour không chạy.'}</p>
        <Link to={summary.state === 'READY' ? `/staff/tours/${summary.id}/start` : `/staff/manage/tours/${summary.id}`} className={buttonClass('primary', 'sm')}>{summary.state === 'READY' ? 'Mở Tour' : 'Mở trang chuẩn bị Tour'}</Link>
      </div> : <>
        <SituationCard detail={detail} isOperator={isOperator} stale={stale} now={now} />
        {/* DOM order is the narrow-screen order. From 1024px the side column is one block spanning every row of
            the main column, so neither column waits for the other's height; its last row is flexible and takes
            whatever the side column needs beyond the main one. */}
        <div data-testid="live-layout" className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)] lg:grid-rows-[auto_auto_1fr]">
          {running && <section className={`${panelClass} min-w-0 p-3 lg:col-start-1`} aria-label="Camera">
            <LiveCamera robotCode={reservation?.robotCode} />
            <div className="mt-3"><VideoModePanel detail={detail} isOperator={isOperator} disabled={stale} /></div>
          </section>}
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-3 lg:row-start-1">
            <ControlTabs label="Bảng điều khiển trong Tour" tabs={tabs} />
            <section className={panelClass} aria-label="Robot"><RobotStatusCard robotCode={reservation?.robotCode} /></section>
            {/* End Early stays apart from the forward step, beside the robot; the web page is not an Emergency Stop. */}
            {running && isOperator && <section id="ket-thuc-som" className={`${panelClass} scroll-mt-4 border-[#f5c8c2]`} aria-label="Kết thúc sớm">
              <PanelHead title="Kết thúc sớm" description="Khi Tour không thể hoặc không nên đi tiếp." />
              <div className="p-4"><EndEarlyAction detail={detail} /></div>
            </section>}
            <p className="-mt-1 flex gap-2 rounded-xl border border-[#f5c8c2] bg-[#fff4f2] px-3 py-2.5 text-xs leading-5 font-semibold text-[#9d3428]">
              <OctagonAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />Trang web không phải nút dừng khẩn cấp. Khi nguy hiểm, bấm nút dừng khẩn cấp trên robot.
            </p>
          </div>
          <div className={`${panelClass} grid min-w-0 md:grid-cols-2 lg:col-start-1`}>
            <section aria-label="Tuyến của Tour" className="min-w-0 border-b border-[#f1f5f9] md:border-r md:border-b-0">
              <h2 className="px-4 pt-3 text-[15px] font-semibold text-[#0f172a]">Tuyến</h2>
              <div className="px-4 pb-3 pt-1"><RouteStopList detail={detail} /></div>
              {/* How the robot leaves each stop: a setting for the whole run (READY or RUNNING on the server), kept
                  beside the stops it applies to rather than in the situation band. Only the Operator may change it. */}
              {running && isOperator && <div className="px-4 pb-4"><AutoAdvanceToggle detail={detail} disabled={stale} /></div>}
            </section>
            <section aria-label="Bản đồ" className="min-w-0">
              <h2 className="px-4 pt-3 text-[15px] font-semibold text-[#0f172a]">Bản đồ</h2>
              <div className="p-3 pt-2"><LiveMiniMap detail={detail} /></div>
            </section>
          </div>
          {/* For whoever debugs a run: the Tour's execution, the leg's command and the robot's raw report, folded away. */}
          <details className={`${panelClass} group/tech min-w-0 lg:col-start-1`} aria-label="Chi tiết kỹ thuật">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] [&::-webkit-details-marker]:hidden">
              <span className="flex-1 text-[14px] font-semibold text-[#0f172a]">Chi tiết kỹ thuật</span>
              <span className="hidden text-xs text-muted sm:inline">Trạng thái Tour, lệnh robot, báo cáo của robot</span>
              <ChevronDown size={16} aria-hidden="true" className="text-muted transition-transform duration-150 group-open/tech:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="grid gap-4 border-t border-[#f1f5f9] p-4 md:grid-cols-2">
              <section aria-label="Trạng thái Tour"><h3 className="mb-2 text-[13px] font-semibold">Trạng thái Tour</h3><ExecutionPanel detail={detail} now={now} /></section>
              <section aria-label="Lệnh robot"><h3 className="mb-2 text-[13px] font-semibold">Lệnh robot của chặng</h3>
                <CommandCard command={detail.execution?.command} legId={detail.execution?.currentLegId} robotCode={reservation?.robotCode} /></section>
              <section className="md:col-span-2" aria-label="Báo cáo của robot"><h3 className="mb-2 text-[13px] font-semibold">Báo cáo của robot</h3>
                <RobotTelemetryPanel robotCode={reservation?.robotCode} /></section>
            </div>
          </details>
        </div>
      </>}
    </StaffPage>
  )
}

/**
 * Says how current the Tour on screen is. A failed or paused poll is shown,
 * never hidden behind the last good answer.
 */
function Freshness({ stale, updatedAt, now, live, fetching, onRefresh }: { stale: boolean; updatedAt: number; now: number; live: boolean; fetching: boolean; onRefresh: () => void }) {
  const at = updatedAt ? formatTime(updatedAt) : '-'
  if (!stale) return <p className="text-xs text-muted" role="status">{live ? `Tự cập nhật. Lần cuối lúc ${at}.` : `Cập nhật lúc ${at}.`}</p>
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

/** Actions the server may open that the situation did not expect; still offered, so the screen cannot hide a way forward. */
const EXTRA_ACTIONS: ConsoleAction[] = ['next', 'retryLeg', 'reconcile']
const MOVES: ConsoleAction[] = ['depart', 'next', 'retryLeg', 'skip']

/** "còn 1:05" until the planned stop ends, then "đã hết giờ dừng". */
function dwellText(deadline: string | null | undefined, now: number): string | null {
  if (!deadline) return null
  const left = Math.ceil((new Date(deadline).getTime() - now) / 1000)
  return left > 0 ? `Còn ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} thời gian dừng.` : 'Đã hết thời gian dừng gợi ý.'
}

/**
 * What is happening and the one step it calls for, then the smaller ways forward
 * (Skip). Only the Tour's Operator gets buttons; anyone else reads the same
 * situation and is told who acts.
 */
function SituationCard({ detail, isOperator, stale, now }: { detail: TourDetails; isOperator: boolean; stale: boolean; now: number }) {
  const { robot } = useFleetRobot(detail.reservation?.robotCode)
  const situation = tourSituation(detail, robot ? { localized: robot.localized, motionReady: robot.motionReady, faultCode: robot.faultCode } : null)
  const style = SITUATION_STYLE[situation.tone]
  const connection = useFleetConnection(store => store.state)
  const running = detail.tour.state === 'RUNNING'
  const observing = running && detail.execution?.currentStep === 'OBSERVING'
  // The departure is Next from the start, carrying the on-site confirmations: offering Next beside it would be a second
  // way to leave the start without them.
  const extras = EXTRA_ACTIONS.filter(action => action !== situation.action && !situation.secondary.includes(action) &&
    !(action === 'next' && situation.action === 'depart') && actionGate(detail, action)?.allowed)
  // Pause comes from servers with the demo flow; an older one sends no gate for it, and it is not offered.
  const primary = situation.action && !(situation.action === 'pause' && !actionGate(detail, 'pause')) ? situation.action : null
  const actions = primary ? [primary, ...extras] : extras
  // An older server sends no gate for Skip; then it is not offered.
  const secondary = situation.secondary.filter(action => actionGate(detail, action) !== null)
  // The Operator's console presence is a movement check (ADR-0042); it is this browser's operations-hub connection.
  const consoleOffline = running && isOperator && connection !== 'connected' && [...actions, ...secondary].some(action => MOVES.includes(action))
  const frozen = stale ? 'Màn hình chưa cập nhật được từ máy chủ, nên thao tác làm robot di chuyển tạm khóa.' : null
  const dwell = observing ? dwellText(detail.execution?.dwellDeadlineAt, now) : null

  const hasControls = actions.length > 0 || secondary.length > 0 || consoleOffline || (!isOperator && (running || situation.action))
  const endEarlyOnly = situation.onlyEndEarly && actions.length === 0 && running && isOperator
  // The departure's four on-site confirmations are too tall for a side column: they go in one row under the message.
  const departing = isOperator && actions[0] === 'depart'
  // One band across the page: what is happening, and the step it calls for on the right (stacked below 1024px).
  // With nothing to press the message takes the whole band.
  return (
    <section className={`${panelClass} flex flex-col gap-3 p-3 ${departing ? '' : 'lg:flex-row lg:items-start'}`} aria-label="Tình hình hiện tại">
      <div className={`flex min-w-0 flex-1 items-start gap-3 self-stretch rounded-xl border px-4 py-3 ${style.box}`} role={situation.tone === 'danger' ? 'alert' : 'status'}>
        <style.icon size={22} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[16px] font-bold">{situation.title}</p>
          <p className="mt-0.5 text-[13px] leading-5">{situation.body}</p>
          {dwell && <p className="mt-1 text-[14px] font-bold tabular-nums">{dwell}</p>}
          {endEarlyOnly && <p className="mt-1.5 text-[13px] leading-5">Không còn thao tác nào tiếp tục được Tour. <a href="#ket-thuc-som" className="font-semibold underline underline-offset-2 hover:no-underline">Dùng mục Kết thúc sớm</a>.</p>}
        </div>
      </div>
      {hasControls && <div className={`w-full min-w-0 space-y-3 ${departing ? 'px-1' : 'sm:max-w-md lg:w-[380px] lg:max-w-none lg:shrink-0'}`}>
        {!isOperator ? <p className="flex gap-2 px-1 text-[13px] leading-5 text-[#475569]"><UserRound size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Bạn đang xem Tour này. Chỉ {detail.operator?.fullName ?? 'người vận hành được giao'} mới thao tác được.</p>
          : <>
            {consoleOffline && <p className="text-[13px] leading-5 font-semibold text-[#7d5310]">Trang điều hành của bạn chưa kết nối với máy chủ, nên máy chủ chặn lệnh di chuyển mới cho tới khi kết nối lại.</p>}
            {actions.length > 0 && <div className="grid gap-3">{actions.map(action => <ConsoleActionButton key={action} action={action} detail={detail} frozen={action === 'reconcile' ? null : frozen} />)}</div>}
            {secondary.length > 0 && <div className="grid gap-3">{secondary.map(action => <ConsoleActionButton key={action} action={action} detail={detail} frozen={frozen} />)}</div>}
          </>}
      </div>}
    </section>
  )
}
