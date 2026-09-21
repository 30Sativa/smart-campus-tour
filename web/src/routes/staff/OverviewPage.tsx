
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
  Star,
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
import {
  TourActivityChart,
  RobotStatusDonut,
  TourStatusDistribution,
  VisitorFeedbackCard,
} from '../../features/staff/components/StaffCharts'

/**
 * Staff Dashboard for Smart Campus Tour Operations Center.
 * Minimal Smart Operations Dashboard style: clean, light, data-focused.
 */
export default function OverviewPage() {
  const tours = useTours()
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
  const readyRobots = robots.data.filter(
    (robot) => robot.connectionState === 'Live' && !robot.needsCheck && !robot.headFault,
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
          trend="+2 so với hôm qua"
          trendTone="ok"
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
          label="Robot hoạt động"
          value={`${readyRobots} / ${robots.data.length}`}
          trend={`${readyRobots} sẵn sàng nhận tour`}
          trendTone="ok"
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
          to="/staff/history"
          icon={Star}
          label="Đánh giá trung bình"
          value="4.8 / 5"
          trend="97% đánh giá tích cực"
          trendTone="ok"
        />
      </section>

      {/* ── 4 Essential Dashboard Charts ────────────────────────────────────── */}
      <section aria-label="Biểu đồ phân tích vận hành" className="mt-6">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0f172a]">Báo cáo & Phân tích Trực quan</h2>
          <span className="text-xs text-[#64748b]">Cập nhật liên tục</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
            <TourActivityChart tours={tours.data} />
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
            <RobotStatusDonut robots={robots.data} />
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
            <TourStatusDistribution tours={tours.data} />
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-xs">
            <VisitorFeedbackCard averageRating={4.8} totalReviews={64} />
          </div>
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

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, CircleCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useAcknowledgeAlert, useStaffDashboard, useTourSession } from '../../features/staff/staff-hooks'
import { ErrorPanel, LoadingPanel } from '../../features/staff/StaffUi'
import { buildAttentionQueue, groupFleet, isOpenTour, type AttentionItem, type FleetBand } from '../../features/staff/attention'
import { statusInfo, statusLabel, toneClass, type StatusTone } from '../../features/staff/status'
import { formatBattery, formatCountdown, formatElapsed, formatTime } from '../../features/staff/formatters'
import type { AmrStatus, StaffScheduleItem, TourSessionSummary } from '../../api/contracts/staff'

/**
 * OPERATIONS WORKSPACE — visual language
 *
 * This screen is not a dashboard and must not be built like one. Administration
 * (`/admin`) is the reporting surface: blue ground, KPI tiles, panels. Operations
 * is a console someone watches during a shift, and it earns a different grammar:
 *
 *   ground      neutral #f4f6f9, not tinted blue. Blue is the CampusTour accent,
 *               used on links and focus, never as a wash over the whole screen.
 *   chrome      one graphite command bar carries the title and the running
 *               readout. It is the thing that makes a /staff screenshot
 *               unmistakable next to an /admin screenshot before a word is read.
 *   surfaces    FOUR, not a wall of cards. Every list lives inside a shared
 *               surface and is separated by dividers; a row never gets a card,
 *               a border and a shadow of its own.
 *   emphasis    type and space carry hierarchy. Badges are reserved for the five
 *               states that mean "act" (critical, warning, disconnected, paused,
 *               live); plain metadata is plain text.
 *
 * Layout at >=1280px:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ command bar: title · readout · Xem lịch tour             │  graphite
 *   ├─────────────────────────────────────┬────────────────────┤
 *   │ TOUR ĐANG VẬN HÀNH          ~70%    │ CẦN XỬ LÝ    ~30%  │  ONE surface,
 *   │ ─ tour ─────────────────────────────│ ─ việc ────────────│  one border,
 *   │ ─ tour ─────────────────────────────│ ─ việc ────────────│  internal rules
 *   ├─────────────────────────────────────┴────────────────────┤
 *   │ SẮP BẮT ĐẦU — timeline                                   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ SẴN SÀNG │ ĐANG TOUR │ CẦN THEO DÕI │ MẤT KẾT NỐI        │  readiness board
 *   └──────────────────────────────────────────────────────────┘
 *
 * The queue is FIRST in the DOM and placed into the right column at `xl`, so a
 * phone and a screen reader both get "what is wrong" before "what is running".
 *
 * Progress is stops, not a percentage. `Mission.progressPercent` exists in the
 * contract and is deliberately not shown: "62%" of a campus tour is a number
 * without a definition. `currentWaypoint`/`nextWaypoint` are real, so the leg is
 * drawn as a two-node stepper. No endpoint returns a route's full stop list, so
 * the stepper stops at two nodes rather than inventing three more.
 */

const SHELL = 'min-h-full bg-[#f4f6f9] px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-6'

/** The one surface style: hairline, 12px radius, no shadow. */
const SURFACE = 'rounded-xl border border-[#dfe5ec] bg-white'

/** Every internal divider on the page, so no two lists rule themselves apart. */
const RULE = 'border-[#eceff4]'

/** How often the "26 phút" labels are recomputed between refetches. */
const TICK_MS = 30_000

const UPCOMING_LIMIT = 4
const ATTENTION_PREVIEW = 3

/** The one place a tone becomes a colour, so a dot and a word never disagree. */
const dotClass: Record<StatusTone, string> = {
  ok: 'bg-[#2f8f6b]',
  info: 'bg-[#3d7ada]',
  warn: 'bg-[#cc8a0c]',
  danger: 'bg-[#c9453a]',
  muted: 'bg-[#a3aebe]',
}

const textTone: Record<StatusTone, string> = {
  ok: 'text-[#1f7a55]',
  info: 'text-[#2f62b8]',
  warn: 'text-[#8a5a06]',
  danger: 'text-[#b23e31]',
  muted: 'text-[#66748a]',
}

/** Severity as a rail on the edge of a row, which is what replaces the badges. */
const railClass: Record<StatusTone, string> = {
  ok: 'border-l-[#2f8f6b]',
  info: 'border-l-[#3d7ada]',
  warn: 'border-l-[#d69412]',
  danger: 'border-l-[#c9453a]',
  muted: 'border-l-[#ccd4e0]',
}

const PRIMARY_ACTION =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-[#16202f] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#2b3a52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2'

/** Secondary is a text action, not a second bordered button. */
const TEXT_ACTION =
  'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[14px] font-bold text-[#2f62b8] transition-colors hover:bg-[#eef3fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]'

export default function OverviewPage() {
  const dashboard = useStaffDashboard()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const data = dashboard.data

  const queue = useMemo(() => (data ? buildAttentionQueue(data, now) : []), [data, now])
  const fleet = useMemo(() => groupFleet(data?.activeAmrsList ?? []), [data])

  /** `AmrStatus.currentSessionId` is the join back to the tour it is running. */
  const amrBySession = useMemo(() => {
    const map = new Map<string, AmrStatus>()
    for (const amr of data?.activeAmrsList ?? []) if (amr.currentSessionId) map.set(amr.currentSessionId, amr)
    return map
  }, [data])

  const upcoming = useMemo(
    () =>
      (data?.todaySchedule ?? [])
        .filter((tour) => isOpenTour(tour.status) && new Date(tour.startTime).getTime() >= now)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, UPCOMING_LIMIT),
    [data, now],
  )

  if (dashboard.isPending) return <div className={SHELL}><LoadingPanel /></div>
  if (dashboard.isError) return <div className={SHELL}><ErrorPanel error={dashboard.error} onRetry={dashboard.refetch} /></div>

  const view = dashboard.data
  const active = view.activeSessions ?? []
  const ready = fleet.find((band) => band.id === 'ready')?.units.length ?? 0

  return (
    <div className={SHELL}>
      <div className="mx-auto w-full max-w-[1400px] space-y-4">
        <CommandBar today={view.todayTours} operating={active.length} ready={ready} attention={queue.length} />

        {/*
          ONE surface, two panes. The two things an operator holds in their head
          at once share a border and a heading system instead of floating apart
          as two cards; the rule between them is what says they are one console.
        */}
        <div className={`${SURFACE} grid overflow-hidden xl:grid-cols-[minmax(0,7fr)_minmax(330px,3fr)]`}>
          <ActionQueue items={queue} now={now} className={`border-t ${RULE} xl:col-start-2 xl:row-start-1 xl:border-t-0 xl:border-l`} />
          <ActiveTours sessions={active} amrBySession={amrBySession} now={now} className="xl:col-start-1 xl:row-start-1" />
        </div>

        <UpcomingTimeline tours={upcoming} now={now} />
        <FleetBoard bands={fleet} />

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
      description={`${today.charAt(0).toUpperCase()}${today.slice(1)}. Giám sát hạm đội robot tự hành, lộ trình tour và can thiệp kịp thời khi có sự cố kỹ thuật.`}
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

/* ── Command bar ──────────────────────────────────────────────────────────── */

/**
 * Title, one supporting line, and the shift readout on one graphite band.
 *
 * The readout replaces the four-cell KPI row. Those counts are context an
 * operator glances at, not the content of the screen, and giving each of them a
 * bordered cell made them compete with the tours underneath.
 */
function CommandBar({ today, operating, ready, attention }: { today: number; operating: number; ready: number; attention: number }) {
  return (
    <header className="overflow-hidden rounded-xl bg-[#16202f]">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <p className="text-[12px] font-bold tracking-[0.18em] text-[#8db0ea] uppercase">Vận hành tour</p>
          <h1 className="mt-1.5 text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] text-white sm:text-[32px]">
            Tình hình điều hành
          </h1>
          <p className="mt-1.5 text-[14px] text-[#9aa8bd]">Tour đang chạy và việc cần xử lý nằm cạnh nhau.</p>
        </div>
        <Link
          to="/staff/schedule"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.07] px-4 text-[14px] font-bold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8db0ea] focus-visible:ring-offset-2 focus-visible:ring-offset-[#16202f]"
        >
          Xem lịch tour
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/10 px-5 py-3 sm:px-6">
        <Readout value={today} label="tour hôm nay" />
        <Separator />
        <Readout value={operating} label="đang vận hành" tone={operating > 0 ? 'info' : undefined} />
        <Separator />
        <Readout value={ready} label="AMR sẵn sàng" tone={ready > 0 ? 'ok' : 'warn'} />
        <Separator />
        <Readout value={attention} label="việc cần xử lý" tone={attention > 0 ? 'danger' : 'ok'} />
      </div>
    </header>
  )
}

/** Numbers on the dark band get their own light tones; `toneClass` is for paper. */
const READOUT_TONE: Record<'ok' | 'info' | 'warn' | 'danger', string> = {
  ok: 'text-[#6ed2a8]',
  info: 'text-[#8db0ea]',
  warn: 'text-[#e9bd6a]',
  danger: 'text-[#f0938a]',
}

function Readout({ value, label, tone }: { value: number; label: string; tone?: 'ok' | 'info' | 'warn' | 'danger' }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-[17px] leading-none font-extrabold tabular-nums ${tone ? READOUT_TONE[tone] : 'text-white'}`}>{value}</span>
      <span className="text-[13.5px] text-[#93a1b6]">{label}</span>
    </span>
  )
}

const Separator = () => <span aria-hidden="true" className="text-[#46536a]">·</span>

/* ── Surface chrome ───────────────────────────────────────────────────────── */

/**
 * The heading bar every surface wears: a tinted strip with an uppercase title.
 *
 * Shared deliberately. Four panes with the same header bar read as four panes of
 * one console; four floating `<h2>`s above four white boxes read as four
 * unrelated widgets, which is what this screen used to be.
 */
function SurfaceHead({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-[#f1f4f9] px-5 py-2.5 ${RULE}`}>
      <h2 className="text-[14px] font-extrabold tracking-[0.09em] text-[#334257] uppercase">{title}</h2>
      <div className="flex min-h-11 items-center gap-3">
        {meta && <p className="text-[13px] text-[#77839a]">{meta}</p>}
        {action}

      </div>
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

/** A status dot; the running one carries a slow halo and nothing else moves. */
function StateDot({ tone, live = false }: { tone: StatusTone; live?: boolean }) {
  return (
    <span aria-hidden="true" className="relative grid size-2.5 shrink-0 place-items-center">
      {live && <span className={`absolute inset-0 rounded-full opacity-30 motion-safe:animate-pulse ${dotClass[tone]}`} />}
      <span className={`relative size-2 rounded-full ${dotClass[tone]}`} />
    </span>
  )
}

/* ── Tour đang vận hành ───────────────────────────────────────────────────── */

function ActiveTours({ sessions, amrBySession, now, className = '' }: {
  sessions: TourSessionSummary[]; amrBySession: Map<string, AmrStatus>; now: number; className?: string
}) {
  return (
    <section className={`min-w-0 ${className}`} aria-label="Tour đang vận hành">
      <SurfaceHead title="Tour đang vận hành" meta={sessions.length > 0 ? `${sessions.length} tour` : undefined} />
      {sessions.length === 0 ? (
        <p className="px-5 py-14 text-center text-[15px] font-medium text-[#8d99ab]">Không có tour nào đang chạy.</p>
      ) : (
        <ul className={`divide-y ${RULE}`}>
          {sessions.map((session) => (
            <ActiveTourRow key={session.id} session={session} amr={amrBySession.get(session.id)} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * One running tour. A row of the operating surface, not a card: the left rail
 * carries its state, dividers separate it from the next tour, and the leg it is
 * travelling is the largest thing on it.
 */
function ActiveTourRow({ session, amr, now }: { session: TourSessionSummary; amr?: AmrStatus; now: number }) {
  /*
   * The dashboard payload has no waypoints; `Mission` does, and it is one call
   * per running tour on the key the session detail page already uses, so opening
   * that tour is warm. This is the whole reason the row can say where the tour is
   * going instead of printing a percentage.
   */
  const detail = useTourSession(session.id)
  const mission = detail.data?.mission

  const state = session.missionState || session.status
  const { tone, label } = statusInfo(state)
  const elapsed = formatElapsed(session.startTime, now)
  const paused = tone === 'warn'

  const current = mission?.currentWaypoint || amr?.currentPoi || null
  const next = mission?.nextWaypoint || null

  const connection = amr ? statusInfo(amr.connectionState) : null
  const lowBattery = amr?.batteryPercent != null && amr.batteryPercent < 20

  return (
    <li className={`border-l-[3px] px-5 py-5 transition-colors hover:bg-[#fbfcfe] sm:px-6 ${railClass[tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="text-[19px] leading-7 font-extrabold tracking-[-0.02em] text-[#16202f]">{session.routeName}</h3>
          {/* Time, duration and robot as one metadata line, not three pills. */}
          <p className="mt-0.5 text-[13px] text-[#77839a]">
            Khởi hành {formatTime(session.startTime)}
            {elapsed ? ` · ${elapsed}` : ''}
          </p>
        </div>
        {/* A badge only when the state means "act". Running is a dot and a word. */}
        {paused || tone === 'danger' ? (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-bold ${toneClass[tone]}`}>
            {label}
          </span>
        ) : (
          <span className={`flex shrink-0 items-center gap-2 text-[14px] font-bold ${textTone[tone]}`}>
            <StateDot tone={tone} live={tone === 'info'} />
            {label}
          </span>
        )}
      </div>

      <TourLeg current={current} next={next} loading={detail.isPending} tone={tone} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {/* Robot facts as text on one readout line. The fleet board carries fleet
            state; a pill here would say the same thing twice. */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-[#5b6a80]">
          <span className="font-bold text-[#3d4b5f]">{session.amrName || 'Chưa gán AMR'}</span>
          {connection && (
            <span className={`flex items-center gap-1.5 font-semibold ${textTone[connection.tone]}`}>
              <StateDot tone={connection.tone} />
              {connection.label}
            </span>
          )}
          {amr && (
            <span className={lowBattery ? 'font-bold text-[#b23e31]' : ''}>
              {amr.batteryPercent == null ? 'Chưa có số liệu pin' : `Pin ${formatBattery(amr.batteryPercent)}`}
            </span>
          )}
          {!amr && <span className="text-[13px] text-[#8d99ab]">Chưa nhận được telemetry cho tour này.</span>}
        </p>

        {/*
          One action, worded for the state it is in. Pause/resume/recall/cancel
          live on the tour screen, behind a confirmation that records a reason;
          this points at that screen rather than duplicating a flow that writes to
          the audit log.
        */}
        <Link to={`/staff/tours/${session.id}`} className={PRIMARY_ACTION}>
          {paused ? 'Xử lý tour' : 'Mở tour'}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </li>
  )
}

/**
 * The leg being travelled: where the tour is, and where it goes next.
 *
 * Two nodes, because two is what the contract knows. A five-stop chain would
 * need the route's POI list and no endpoint returns one, so drawing it would be
 * drawing fiction on an operations screen. It is set in the largest body type on
 * the page because "which building is it at, and which is next" is the question
 * this screen exists to answer.
 */
function TourLeg({ current, next, loading, tone }: { current: string | null; next: string | null; loading: boolean; tone: StatusTone }) {
  return (
    <div className="mt-4">
      <p className="text-[12px] font-bold tracking-[0.11em] text-[#8d99ab] uppercase">Chặng hiện tại</p>

      {loading && !current ? (
        <p className="mt-2.5 text-[15px] text-[#8d99ab]" aria-busy="true">Đang lấy vị trí…</p>
      ) : !current ? (
        <p className="mt-2.5 text-[15px] text-[#8d99ab]">Chưa có dữ liệu điểm dừng cho tour này.</p>
      ) : (
        <ol className="mt-3">
          <li className="relative flex gap-3.5 pb-4">
            {/* The rail between the two nodes: the movement, drawn. */}
            <span aria-hidden="true" className="absolute top-4 bottom-0 left-[7px] w-0.5 bg-[#dfe5ec]" />
            <span aria-hidden="true" className={`relative mt-1 grid size-4 shrink-0 place-items-center rounded-full ${dotClass[tone]}`}>
              <span className="size-1.5 rounded-full bg-white" />
            </span>
            <span className="min-w-0">
              <span className="block text-[20px] leading-7 font-extrabold tracking-[-0.02em] text-[#16202f]">{current}</span>
              <span className="block text-[13px] text-[#8d99ab]">đang ở đây</span>
            </span>
          </li>
          <li className="flex gap-3.5">
            <span aria-hidden="true" className="mt-1 size-4 shrink-0 rounded-full border-2 border-[#c3ccda] bg-white" />
            <span className="min-w-0">
              <span className={`block text-[18px] leading-6 font-bold tracking-[-0.01em] ${next ? 'text-[#3d4b5f]' : 'text-[#9aa5b6]'}`}>
                {next || 'Chưa có điểm kế tiếp'}
              </span>
              <span className="block text-[13px] text-[#8d99ab]">điểm tiếp theo</span>
            </span>
          </li>
        </ol>
      )}
    </div>
  )
}

/* ── Cần xử lý (action queue) ─────────────────────────────────────────────── */

/**
 * An action queue, not an inbox.
 *
 * Each row answers three questions in reading order — what it is about, what is
 * wrong, what to do — and exposes exactly one primary next action. Severity is a
 * rail on the row edge plus a small caps label; the coloured badge it replaced
 * was the loudest thing on a screen where the tours should be.
 */
function ActionQueue({ items, now, className = '' }: { items: AttentionItem[]; now: number; className?: string }) {
  const acknowledge = useAcknowledgeAlert()
  const [seen, setSeen] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)

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

    <section className={`min-w-0 ${className}`} aria-label="Việc cần xử lý">
      <SurfaceHead
        title="Cần xử lý"
        meta={items.length === 0 ? undefined : critical > 0 ? `${items.length} việc · ${critical} nghiêm trọng` : `${items.length} việc`}
      />

      {items.length === 0 ? (
        <p className="flex items-center gap-2.5 px-5 py-6 text-[14px] font-semibold text-[#1f7a55]">
          <CircleCheck size={18} aria-hidden="true" />
          Không có việc cần xử lý.
        </p>
      ) : (
        <>
          <ul className={`divide-y ${RULE}`}>
            {shown.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                now={now}
                acknowledged={item.alertId ? seen.includes(item.alertId) : false}
                busy={acknowledge.isPending}
                onAcknowledge={(id) => acknowledge.mutate({ id }, { onSuccess: () => setSeen((prev) => [...prev, id]) })}
              />
            ))}
          </ul>
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className={`flex min-h-11 w-full items-center justify-center border-t px-4 text-[13px] font-bold text-[#2f62b8] transition-colors hover:bg-[#f6f9fd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4f8df7] ${RULE}`}
            >
              {expanded ? 'Thu gọn' : `Xem thêm ${hidden} việc`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function QueueRow({ item, now, acknowledged, busy, onAcknowledge }: {
  item: AttentionItem; now: number; acknowledged: boolean; busy: boolean; onAcknowledge: (id: string) => void
}) {
  const elapsed = formatElapsed(item.since, now)
  const danger = item.tone === 'danger'

  return (
    <li className={`border-l-[3px] px-5 py-4 transition-colors hover:bg-[#fbfcfe] ${railClass[item.tone]}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-[12px] font-extrabold tracking-[0.11em] uppercase ${danger ? 'text-[#b23e31]' : 'text-[#8a5a06]'}`}>
          {danger ? 'Nghiêm trọng' : 'Cảnh báo'}
        </p>
        {elapsed && <p className="shrink-0 text-[13px] whitespace-nowrap text-[#8d99ab]">{elapsed}</p>}
      </div>

      {/* WHAT it is about. */}
      <p className="mt-1.5 text-[15px] leading-6 font-extrabold text-[#16202f]">{item.subject}</p>
      {/* WHY it is here. */}
      <p className="text-[14px] leading-6 font-semibold text-[#3d4b5f]">{item.headline}</p>
      {/* Context an operator can act on, at most two lines. */}
      {item.detail && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#77839a]">{item.detail}</p>}

      {/* WHAT TO DO: one primary action. Acknowledging stays a quiet text button,
          because `acknowledgeAlert` records that someone looked — it does not
          resolve anything, so it must not read as the way out of the row. */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3">
        <Link to={item.to} className={`${TEXT_ACTION} -ml-2`}>
          {item.toLabel}
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
        {item.alertId && !acknowledged && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAcknowledge(item.alertId as string)}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-bold text-[#66748a] transition-colors hover:bg-[#f2f4f8] hover:text-[#3d4b5f] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7]"
          >
            Đã xem
          </button>
        )}
        {acknowledged && <span role="status" className="text-[13px] font-bold text-[#1f7a55]">Đã ghi nhận</span>}
      </div>
    </li>
  )
}

/* ── Sắp bắt đầu ──────────────────────────────────────────────────────────── */

/**
 * The next departures as a departure manifest: a time gutter whose rule runs
 * down the list, then what is leaving, who it is for, which robot has it, and
 * the one action it still needs.
 *
 * Columnar from `lg` up. A single flexible row put the action a thousand pixels
 * from the tour it belonged to on a wide screen; aligned columns let an operator
 * scan "which of these has no robot" straight down one axis instead.
 */
function UpcomingTimeline({ tours, now }: { tours: StaffScheduleItem[]; now: number }) {
  return (
    <section className={`${SURFACE} overflow-hidden`} aria-label="Tour sắp bắt đầu">
      <SurfaceHead
        title="Sắp bắt đầu"
        meta={tours.length > 0 ? `${tours.length} tour` : undefined}
        action={<Link to="/staff/schedule" className={TEXT_ACTION}>Mở lịch đầy đủ</Link>}
      />
      {tours.length === 0 ? (
        <p className="px-5 py-8 text-[14px] font-medium text-[#8d99ab]">Không còn tour nào chờ khởi hành hôm nay.</p>
      ) : (
        <ul className={`divide-y ${RULE}`}>
          {tours.map((tour) => {
            const countdown = formatCountdown(tour.startTime, now)
            const unassigned = !tour.amrName
            // Below `sm` the time gutter becomes a line above the row: 104px of
            // clock plus an action leaves a phone nothing to put the name in.
            return (
              <li key={tour.sessionId} className="flex flex-col transition-colors hover:bg-[#fbfcfe] sm:flex-row sm:items-stretch">
                <div className={`flex items-baseline gap-2.5 border-b px-5 pt-3.5 pb-2 sm:w-[104px] sm:shrink-0 sm:flex-col sm:justify-center sm:gap-0 sm:border-r sm:border-b-0 sm:py-4 sm:pr-4 sm:pl-5 ${RULE}`}>
                  <p className="text-[17px] leading-none font-extrabold tabular-nums text-[#16202f]">{formatTime(tour.startTime)}</p>
                  {countdown && <p className="text-[13px] whitespace-nowrap text-[#8d99ab] sm:mt-1.5">{countdown}</p>}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-4 px-5 py-3.5 sm:py-4 sm:pr-5 sm:pl-4">
                  <StateDot tone={unassigned ? 'warn' : 'ok'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-6 font-bold text-[#2a3648]">{tour.routeName}</span>
                    {/* Below lg the two columns on the right fold under the name. */}
                    <span className="block truncate text-[13px] text-[#77839a] lg:hidden">
                      {tour.visitorName || 'Khách chưa công khai'}
                      {' · '}
                      <span className={unassigned ? 'font-semibold text-[#8a5a06]' : ''}>{tour.amrName || 'Chưa có AMR'}</span>
                    </span>
                  </span>
                  <span className="hidden w-[190px] shrink-0 truncate text-[13.5px] text-[#77839a] lg:block">
                    {tour.visitorName || 'Khách chưa công khai'}
                  </span>
                  <span className={`hidden w-[170px] shrink-0 truncate text-[13.5px] lg:block ${unassigned ? 'font-semibold text-[#8a5a06]' : 'text-[#5b6a80]'}`}>
                    {tour.amrName || 'Chưa có AMR'}
                  </span>
                  <Link to={`/staff/tours/${tour.sessionId}`} className={`${TEXT_ACTION} shrink-0 lg:w-[112px] lg:justify-end`}>
                    {unassigned ? 'Gán AMR' : 'Mở tour'}
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>

                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}



/* ── Tình trạng đội AMR ───────────────────────────────────────────────────── */

/** The top edge that names a readiness column without a badge in sight. */
const edgeClass: Record<FleetBand['tone'], string> = {
  ok: 'border-t-[#2f8f6b]',
  info: 'border-t-[#3d7ada]',
  warn: 'border-t-[#d69412]',
  danger: 'border-t-[#c9453a]',
}

/**
 * Readiness, not inventory.
 *
 * Four fixed columns, best state to worst, so the board keeps its shape between
 * refreshes and an operator learns where to look rather than re-reading labels.
 * The column heading carries the state, so no robot needs a badge of its own.
 *
 * `gap-px` over the rule colour draws every divider in one declaration, in both
 * directions, at both breakpoints - no per-cell border arithmetic.
 */
function FleetBoard({ bands }: { bands: FleetBand[] }) {
  const total = bands.reduce((sum, band) => sum + band.units.length, 0)

  return (
    <section className={`${SURFACE} overflow-hidden`} aria-label="Tình trạng đội AMR">
      <SurfaceHead
        title="Tình trạng đội AMR"
        meta={total > 0 ? `${total} AMR` : undefined}
        action={<Link to="/staff/amr" className={TEXT_ACTION}>Theo dõi AMR</Link>}
      />
      {total === 0 ? (
        <p className="px-5 py-8 text-[14px] font-medium text-[#8d99ab]">Chưa có AMR nào được đăng ký.</p>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-[#eceff4] lg:grid-cols-4">
          {bands.map((band) => (
            <div key={band.id} className={`border-t-2 bg-white px-5 py-4 ${edgeClass[band.tone]}`}>
              <p className="flex items-center gap-2 text-[12.5px] font-extrabold tracking-[0.08em] text-[#66748a] uppercase">
                <StateDot tone={band.tone} />
                {band.label}
              </p>
              <p className={`mt-2 text-[28px] leading-none font-extrabold tabular-nums ${band.units.length === 0 ? 'text-[#c3ccda]' : 'text-[#16202f]'}`}>
                {band.units.length}
              </p>
              {band.units.length === 0 ? (
                <p className="mt-2.5 text-[13px] text-[#a3aebe]">Không có AMR</p>
              ) : (
                <ul className="mt-2.5 space-y-2">
                  {band.units.map((amr) => (
                    <li key={amr.id} className="min-w-0">
                      <p className="text-[14px] font-bold break-words text-[#2a3648]">{amr.name}</p>
                      {/* Wraps rather than truncates: an operator reading
                          "Khu thí nghi…" has to open another screen to finish
                          the sentence. */}
                      <p className="mt-0.5 text-[13px] leading-5 break-words text-[#8d99ab]">
                        {amr.currentPoi || statusLabel(amr.operationalState)}
                        {amr.batteryPercent == null ? ' · chưa có số liệu pin' : ` · pin ${formatBattery(amr.batteryPercent)}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

