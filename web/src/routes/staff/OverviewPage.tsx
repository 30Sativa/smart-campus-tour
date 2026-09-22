import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Bot,
  CalendarCheck2,
  CheckCheck,
  ChevronRight,
  MonitorPlay,
  PlayCircle,
  ShieldAlert,
  Hourglass,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { AmrStatus, TourOperation } from '../../api/contracts/staff'
import { useStaffAmrs, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, LoadingPanel, PageHeader, StaffPage } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { buildAttentionQueue, groupSummary, operationsCounts, tourAction, type AttentionItem } from '../../features/staff/attention'
import { formatCountdown, formatElapsed, formatTime } from '../../features/staff/formatters'
import { useNow } from '../../features/staff/use-now'
import { RunStatus } from '../../features/staff/components/RunStatus'
import { TourStateBadges } from '../../features/staff/components/TourParts'
import { RobotHeader, RobotTelemetry } from '../../features/staff/components/RobotParts'
import { OverviewAnalytics } from '../../features/staff/components/OverviewAnalytics'
import { TourActivityChart, TourStatusDistribution } from '../../features/staff/components/StaffCharts'

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

  const counts = operationsCounts(tours.data)
  const queue = buildAttentionQueue({ tours: tours.data, robots: robots.data }, now)
  const running = tours.data.find((tour) => tour.state === 'Running')
  const physical = robots.data.find((robot) => robot.assignable) ?? robots.data[0]
  const next = tours.data.find((tour) => tour.state === 'Ready')

  // Calculate total students and healthy robots
  const totalStudents = tours.data.reduce((sum, tour) => sum + groupSummary(tour).students, 0)
  // Only physical robots serve Tours (scope §11.6); Gazebo / emulator units are labelled elsewhere, never counted here.
  const physicalRobots = robots.data.filter((robot) => robot.assignable !== false && robot.source !== 'Gazebo' && robot.source !== 'Emulator')
  const readyRobots = physicalRobots.filter(
    (robot) => robot.connectionState === 'Live' && !robot.needsCheck && !robot.headFault && !robot.currentSessionId,
  ).length

  return (
    <StaffPage className="!bg-[#f8fafc]">
      <Header running={running} />

      {/* ── 6 KPI Cards ──────────────────────────────────────────────────────── */}
      <section aria-label="Số liệu hôm nay" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          to="/staff/tours"
          icon={CalendarCheck2}
          label="Buổi hôm nay"
          value={counts.toursToday}
          trend={`${counts.ready} sẵn sàng, ${counts.scheduled} chờ chốt`}
        />
        <KpiCard
          to="/staff/live"
          icon={PlayCircle}
          label="Tour đang chạy"
          value={counts.running}
          trend={counts.running ? 'Đang hoạt động' : 'Tạm nghỉ'}
          tone={counts.running ? 'info' : undefined}
          live={counts.running > 0}
        />
        <KpiCard
          to="/staff/robot"
          icon={Bot}
          label="Robot rảnh"
          value={`${readyRobots} / ${physicalRobots.length}`}
          trend={readyRobots ? 'Sẵn sàng nhận buổi kế' : 'Đang phục vụ hoặc chờ kiểm tra'}
          trendTone={readyRobots ? 'ok' : undefined}
        />
        <KpiCard
          to="/staff/tours"
          icon={Users}
          label="Khách tham quan"
          value={totalStudents}
          trend={`${counts.groupsToday} đoàn đã duyệt`}
        />
        <KpiCard
          to="/staff/live"
          icon={ShieldAlert}
          label="Sự cố & Hỗ trợ"
          value={counts.needsAssistance}
          trend={counts.needsAssistance > 0 ? 'Cần xử lý ngay' : 'Hệ thống ổn định'}
          tone={counts.needsAssistance > 0 ? 'danger' : undefined}
          trendTone={counts.needsAssistance > 0 ? 'danger' : 'ok'}
        />
        <KpiCard
          to="/staff/tours"
          icon={Hourglass}
          label="Chờ Admin chốt"
          value={counts.scheduled}
          trend={counts.scheduled ? 'Chưa bắt đầu được' : 'Không có buổi chờ'}
        />
      </section>

      {/* ── Charts: only counts the API returned (no seeded series, no ratings:
          feedback is PENDING GVHD in the scope). ─────────────────────────── */}
      <section aria-label="Biểu đồ vận hành" className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
          <TourActivityChart tours={tours.data} history={history.data ?? []} now={now} />
        </div>
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
          <TourStatusDistribution tours={tours.data} />
        </div>
      </section>

      {/* ── Device Telemetry & Attendance Metrics ────────────────────────────── */}
      <OverviewAnalytics tours={tours.data} robots={robots.data} />

      {/* ── Operations & Attention Split ─────────────────────────────────────── */}
      <div className="mt-6 grid items-start gap-5 min-[1200px]:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.85fr)]">
        <section className="min-w-0" aria-label="Buổi đang chạy">
          <SectionHeading
            title="Vận hành trực tiếp"
            action={
              running ? (
                <Link to={`/staff/live/${running.id}`} className={buttonClass('ghost', 'sm')}>
                  Mở điều hành<ChevronRight size={14} aria-hidden="true" />
                </Link>
              ) : undefined
            }
          />
          {running ? (
            <RunningPanel tour={running} robot={robots.data.find((robot) => robot.id === running.robotId)} now={now} />
          ) : (
            <div className="rounded-2xl border border-[#e2e8f0] bg-white px-5 py-8 text-center shadow-xs">
              <p className="text-[14px] font-semibold text-[#64748b]">Hiện tại không có buổi nào đang chạy.</p>
              {next && (
                <Link to={`/staff/tours/${next.id}/start`} className={`${buttonClass('primary')} mt-4`}>
                  Kiểm tra & bắt đầu {next.code} · {formatTime(next.scheduledAt)}
                </Link>
              )}
            </div>
          )}
        </section>
        <AttentionRail items={queue} now={now} />
      </div>

      {/* ── Today's Tours & Robot Overview ──────────────────────────────────── */}
      <div className="mt-6 grid items-start gap-5 min-[1200px]:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.85fr)]">
        <section className="min-w-0" aria-label="Buổi hôm nay">
          <SectionHeading
            title="Danh sách buổi hôm nay"
            action={
              <Link to="/staff/tours" className={buttonClass('ghost', 'sm')}>
                Xem đầy đủ<ChevronRight size={14} aria-hidden="true" />
              </Link>
            }
          />
          <ul className="divide-y divide-[#f1f5f9] rounded-2xl border border-[#e2e8f0] bg-white shadow-xs">
            {tours.data.map((tour) => (
              <TourRow key={tour.id} tour={tour} now={now} />
            ))}
          </ul>
        </section>
        {physical && (
          <section className="min-w-0" aria-label="Robot">
            <SectionHeading
              title="Đội robot"
              action={
                <Link to="/staff/robot" className={buttonClass('ghost', 'sm')}>
                  Xem tất cả<ChevronRight size={14} aria-hidden="true" />
                </Link>
              }
            />
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
              <RobotHeader robot={physical} />
              <div className="mt-3">
                <RobotTelemetry robot={physical} now={now} />
              </div>
            </div>
          </section>
        )}
      </div>
    </StaffPage>
  )
}

function Header({ running }: { running?: TourOperation }) {
  const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return (
    <PageHeader
      scale="console"
      eyebrow="Trung tâm Điều hành Smart Campus Tour"
      title="Tình hình điều hành"
      description={`${today.charAt(0).toUpperCase()}${today.slice(1)}. Học sinh tham quan từ xa qua web; một robot thật chạy một buổi tại một thời điểm. Luồng bình thường tự chạy, Staff can thiệp khi cần.`}
      action={
        <Link to={running ? `/staff/live/${running.id}` : '/staff/live'} className={buttonClass('primary', 'md')}>
          <MonitorPlay size={17} aria-hidden="true" />
          Điều hành trực tiếp
        </Link>
      }
    />
  )
}

/* ── KPI Tile Component ───────────────────────────────────────────────────── */

const TILE_TONE = {
  info: 'text-[#2563eb]',
  danger: 'text-[#dc2626]',
  ok: 'text-[#16a34a]',
} as const

function KpiCard({
  to,
  icon: Icon,
  label,
  value,
  trend,
  tone,
  trendTone,
  live = false,
}: {
  to: string
  icon: LucideIcon
  label: string
  value: ReactNode
  trend?: string
  tone?: keyof typeof TILE_TONE
  trendTone?: keyof typeof TILE_TONE
  live?: boolean
}) {
  return (
    <Link
      to={to}
      className="flex flex-col justify-between rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#cbd5e1] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#64748b] truncate">{label}</span>
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-lg ${
            tone === 'danger'
              ? 'bg-[#fef2f2] text-[#dc2626]'
              : tone === 'info'
              ? 'bg-[#eff6ff] text-[#2563eb]'
              : 'bg-[#f8fafc] text-[#64748b]'
          }`}
        >
          <Icon size={15} aria-hidden="true" />
        </span>
      </div>

      <div className="my-2 flex items-baseline gap-2">
        {live && <span className="size-2 rounded-full bg-[#10b981] animate-pulse" />}
        <span
          className={`text-[26px] font-black tracking-tight tabular-nums leading-none ${
            tone ? TILE_TONE[tone] : 'text-[#0f172a]'
          }`}
        >
          {value}
        </span>
      </div>

      {trend && (
        <span
          className={`text-[11px] font-semibold truncate ${
            trendTone ? TILE_TONE[trendTone] : 'text-[#94a3b8]'
          }`}
        >
          {trend}
        </span>
      )}
    </Link>
  )
}

function SectionHeading({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 className="text-[16px] font-bold tracking-tight text-[#0f172a]">{title}</h2>
        {note && <p className="truncate text-xs text-[#94a3b8]">{note}</p>}
      </div>
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
      className={`rounded-2xl border bg-white p-5 shadow-xs transition-colors duration-200 ${
        assist ? 'border-[#fca5a5] ring-1 ring-[#f87171]' : 'border-[#e2e8f0]'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[#2563eb] bg-[#eff6ff] px-2 py-0.5 rounded-md">
              {tour.code}
            </span>
            <span className="size-1.5 rounded-full bg-[#10b981]" />
            <span className="text-xs font-bold text-[#16a34a]">Đang chạy</span>
          </div>
          <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-[#0f172a]">{tour.name}</h3>
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
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3.5 transition-colors hover:bg-[#f8fafc]">
      <span className="w-[84px] shrink-0">
        <span className="block text-[15px] font-extrabold text-[#0f172a] tabular-nums leading-none">
          {formatTime(tour.scheduledAt)}
        </span>
        {countdown && <span className="mt-1 block text-[11px] whitespace-nowrap text-[#94a3b8]">{countdown}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-[#0f172a]">{tour.name}</span>
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

/* ── Cần xử lý / Recent Incidents ─────────────────────────────────────────── */

const RAIL_EDGE = {
  danger: 'border-l-[#ef4444]',
  warn: 'border-l-[#f59e0b]',
  info: 'border-l-[#3b82f6]',
} as const

const RAIL_TEXT = {
  danger: 'text-[#dc2626]',
  warn: 'text-[#d97706]',
  info: 'text-[#2563eb]',
} as const

function AttentionRail({ items, now }: { items: AttentionItem[]; now: number }) {
  return (
    <section className="min-w-0" aria-label="Việc cần xử lý">
      <SectionHeading title="Cần chú ý / Sự cố" note={items.length ? `${items.length} việc` : undefined} />
      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-[#e2e8f0] bg-white px-5 py-4 text-sm font-semibold text-[#16a34a] shadow-xs">
          <CheckCheck size={18} aria-hidden="true" />
          Hệ thống hoạt động bình thường, không có sự cố.
        </div>
      ) : (
        <ul className="divide-y divide-[#f1f5f9] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-xs">
          {items.map((item) => {
            const since = item.since ? formatElapsed(item.since, now) : null
            return (
              <li
                key={item.id}
                className={`border-l-4 p-4 transition-colors duration-200 hover:bg-[#f8fafc] ${RAIL_EDGE[item.tone]}`}
              >
                <div className="flex gap-2.5">
                  <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${RAIL_TEXT[item.tone]}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#0f172a]">{item.subject}</p>
                    <p className={`mt-0.5 text-xs font-semibold ${RAIL_TEXT[item.tone]}`}>{item.headline}</p>
                    {item.detail && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#64748b]">{item.detail}</p>
                    )}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#94a3b8]">{since ?? ''}</span>
                      <Link
                        to={item.to}
                        className={buttonClass(item.tone === 'danger' ? 'danger' : 'secondary', 'sm')}
                      >
                        {item.toLabel}
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
