import type { ReactNode } from 'react'
import { MonitorPlay } from 'lucide-react'
import { Link } from 'react-router'
import type { AmrStatus, TourOperation } from '../../api/contracts/staff'
import { useStaffAmrs, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { buildAttentionQueue, groupSummary, tourAction } from '../../features/staff/attention'
import { AttentionList } from '../../features/staff/components/AttentionList'
import { formatCountdown, formatTime } from '../../features/staff/formatters'
import { useNow } from '../../features/staff/use-now'
import { RunStatus } from '../../features/staff/components/RunStatus'
import { TourStateBadges } from '../../features/staff/components/TourParts'
import { RobotHeader, RobotTelemetry } from '../../features/staff/components/RobotParts'
import { RunningFunnel, StudentsByTour } from '../../features/staff/components/OverviewAnalytics'
import { AttentionCard, RunResults, SparkCard, StudentsThroughDay, TodayByState } from '../../features/staff/components/StaffCharts'
import { lastSevenDays, studentsThroughDay, tookPlace } from '../../features/staff/overview-data'

/** Flat white card, the same as the admin dashboard. */
const CARD = 'rounded-xl border border-[#e2e8f0] bg-white'

/**
 * Staff Dashboard for Smart Campus Tour Operations Center.
 * Minimal Smart Operations Dashboard style: clean, light, data-focused.
 */
export default function OverviewPage() {
  const tours = useTours()
  const history = useTours({ history: true })
  const robots = useStaffAmrs()
  const now = useNow(1000)

  const failed = [tours, robots].find((query) => query.isError)
  if (failed) return <StaffPage><ErrorPanel error={failed.error} onRetry={failed.refetch} /></StaffPage>
  if (!tours.data || !robots.data) return <StaffPage><Header /><LoadingPanel /></StaffPage>

  const running = tours.data.find((tour) => tour.state === 'Running')
  const physical = robots.data.find((robot) => robot.assignable) ?? robots.data[0]
  const next = tours.data.find((tour) => tour.state === 'Ready')

  // Only physical robots serve Tours (scope §11.6); Gazebo / emulator units are labelled elsewhere, never counted here.
  const physicalRobots = robots.data.filter((robot) => robot.assignable !== false && robot.source !== 'Gazebo' && robot.source !== 'Emulator')
  const readyRobots = physicalRobots.filter(
    (robot) => robot.connectionState === 'Live' && !robot.needsCheck && !robot.headFault && !robot.currentSessionId,
  ).length

  const days = lastSevenDays(tours.data, history.data ?? [], now)
  const ran = days.reduce((sum, day) => sum + day.total, 0)
  const completed = days.reduce((sum, day) => sum + day.completed, 0)
  const today = tours.data.filter(tookPlace)
  const joined = today.filter((tour) => tour.state === 'Running' || tour.state === 'Completed' || tour.state === 'Cancelled')
  const day = studentsThroughDay(tours.data, now)
  const joinedSeries = day.points.flatMap((point) => (point.joined != null ? [point.joined] : []))

  return (
    <StaffPage>
      <Header running={running} />
      <AttentionList items={buildAttentionQueue({ tours: tours.data, robots: robots.data }, now)} />

      {/* ── Figures first, one row ─────────────────────────────────────────── */}
      <section aria-label="Số liệu chính" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SparkCard to="/staff/history" title="Buổi đã chạy" label="7 ngày qua" value={ran} unit="buổi" note={`${completed} hoàn thành · ${ran - completed} kết thúc sớm / hủy`} series={days.map((day) => day.total)} />
        <SparkCard to="/staff/history" title="Tỉ lệ hoàn thành" label="7 ngày qua" value={ran ? Math.round((completed / ran) * 100) : '–'} unit="%" note={`${completed} hoàn thành / ${ran} buổi`} series={days.map((day) => day.rate)} />
        <SparkCard to="/staff/tours" title="Học sinh đã tham gia" label="Hôm nay" value={day.joined} unit={`/ ${day.planned} HS`} note={`${joined.length} buổi đã chạy · còn ${today.length - joined.length} buổi`} series={joinedSeries} />
        <AttentionCard tours={tours.data} readyRobots={readyRobots} robotCount={physicalRobots.length} />
      </section>

      {/* ── The day's work: sessions on the left, what is running and the robot on the right ── */}
      <div className="mt-3 grid items-start gap-3 min-[1200px]:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className={`${CARD} min-w-0`} aria-label="Buổi hôm nay">
          <PanelTitle
            title="Danh sách buổi hôm nay"
            action={<Link to="/staff/tours" className="text-xs font-semibold text-[#2d719e] hover:underline">Xem theo trạng thái</Link>}
          />
          <ul className="divide-y divide-[#eef1f4]">
            {tours.data.map((tour) => (
              <TourRow key={tour.id} tour={tour} now={now} />
            ))}
          </ul>
        </section>

        <div className="grid min-w-0 gap-3">
          <section className="min-w-0" aria-label="Buổi đang chạy">
            {running ? (
              <RunningPanel tour={running} robot={robots.data.find((robot) => robot.id === running.robotId)} now={now} />
            ) : (
              <div className={CARD}>
                <PanelTitle title="Vận hành trực tiếp" />
                <div className="px-3.5 py-4 text-center">
                  <p className="text-[13px] font-semibold text-[#64748b]">Hiện không có buổi nào đang chạy.</p>
                  {next && (
                    <Link to={`/staff/tours/${next.id}/start`} className={`${buttonClass('primary')} mt-3`}>
                      Kiểm tra & bắt đầu {next.code} · {formatTime(next.scheduledAt)}
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>
          {physical && (
            <section className={CARD} aria-label="Robot">
              <PanelTitle title="Đội robot" action={<Link to="/staff/robot" className="text-xs font-semibold text-[#2d719e] hover:underline">Robot & thiết bị</Link>} />
              <div className="px-3.5 py-3">
                <RobotHeader robot={physical} />
                <div className="mt-2.5">
                  <RobotTelemetry robot={physical} now={now} />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Analysis: only counts the API returned (no seeded series, no ratings:
          feedback is PENDING GVHD in the scope). ─────────────────────────── */}
      <section aria-label="Biểu đồ vận hành" className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <StudentsThroughDay tours={tours.data} now={now} />
        <TodayByState tours={tours.data} />
        <RunResults days={days} />
        <RunningFunnel tours={tours.data} robots={robots.data} now={now} />
      </section>
      <div className="mt-3">
        <StudentsByTour tours={tours.data} />
      </div>
    </StaffPage>
  )
}

function Header({ running }: { running?: TourOperation }) {
  const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return (
    <PageHeader
            eyebrow="Trong ngày"
      title="Tổng quan vận hành"
      description={`${today.charAt(0).toUpperCase()}${today.slice(1)}. Học sinh tham quan từ xa qua web; một robot thật chạy một buổi tại một thời điểm. Luồng bình thường tự chạy, Staff can thiệp khi cần.`}
      action={
        <Link to={running ? `/staff/live/${running.id}` : '/staff/live'} className={buttonClass('primary', 'md')}>
          <MonitorPlay size={15} aria-hidden="true" />
          Điều hành trực tiếp
        </Link>
      }
    />
  )
}

function PanelTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[#eef1f4] px-3.5 py-2.5">
      <h2 className="text-[13px] font-semibold text-[#0f172a]">{title}</h2>
      {action}
    </div>
  )
}

/* ── Running now ──────────────────────────────────────────────────────────── */

function RunningPanel({ tour, robot, now }: { tour: TourOperation; robot?: AmrStatus; now: number }) {
  const groups = groupSummary(tour)
  const assist = tour.operationalStatus === 'NeedsAssistance'
  return (
    <article
      className={`rounded-xl border bg-white px-3.5 py-3 transition-colors duration-200 ${assist ? 'border-[#f87171]' : 'border-[#e2e8f0]'}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[#f1f8fe] px-2 py-0.5 font-mono text-xs font-bold text-[#2d719e]">
              {tour.code}
            </span>
            <span className="size-1.5 rounded-full bg-[#10b981]" />
            <span className="text-xs font-bold text-[#16a34a]">Đang chạy</span>
          </div>
          <h3 className="mt-1 text-[15px] font-bold tracking-tight text-[#0f172a]">{tour.name}</h3>
          <p className="text-xs text-[#64748b]">
            {tour.routeName} · {groups.groups} đoàn · {groups.students} học sinh · {tour.robotName}
          </p>
        </div>
        <Link to={`/staff/live/${tour.id}`} className={buttonClass(assist ? 'danger' : 'primary', 'sm')}>
          {assist ? 'Xử lý hỗ trợ' : 'Mở điều hành'}
        </Link>
      </div>
      <RunStatus tour={tour} robot={robot} now={now} compact />
    </article>
  )
}

/* ── Today ────────────────────────────────────────────────────────────────── */

function TourRow({ tour, now }: { tour: TourOperation; now: number }) {
  const action = tourAction(tour)
  const groups = groupSummary(tour)
  const countdown = tour.state === 'Scheduled' || tour.state === 'Ready' ? formatCountdown(tour.scheduledAt, now) : null
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 transition-colors hover:bg-[#fafcfe]">
      <span className="w-[72px] shrink-0">
        <span className="block text-sm font-bold text-[#0f172a] tabular-nums leading-none">
          {formatTime(tour.scheduledAt)}
        </span>
        {countdown && <span className="mt-1 block text-[11px] whitespace-nowrap text-[#94a3b8]">{countdown}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-[#0f172a]">{tour.name}</span>
          <span className="shrink-0 font-mono text-[11px] font-semibold text-[#64748b] bg-[#f1f5f9] px-1.5 py-0.2 rounded">
            {tour.code}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-[#64748b]">
          {tour.routeName} · {groups.groups} đoàn · {groups.students} học sinh
          {groups.pending ? ` · ${groups.pending} chờ duyệt` : ''}
        </span>
      </span>
      <TourStateBadges tour={tour} />
      <Link to={action.to} className={buttonClass(action.kind === 'primary' ? 'primary' : 'secondary', 'sm')}>
        {action.label}
      </Link>
    </li>
  )
}
