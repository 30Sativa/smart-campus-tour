import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bot, ChevronRight, CircleAlert, CircleCheck, Eye, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { useAcknowledgeAlert, useStaffDashboard, useTourSession } from '../../features/staff/staff-hooks'
import { ErrorPanel, LoadingPanel, PageHeader } from '../../features/staff/StaffUi'
import { buildAttentionQueue, groupFleet, isOpenTour, type AttentionItem, type FleetBand } from '../../features/staff/attention'
import { statusInfo, statusLabel, type StatusTone } from '../../features/staff/status'
import { formatBattery, formatCountdown, formatElapsed, formatTime } from '../../features/staff/formatters'
import type { AmrStatus, StaffScheduleItem, TourSessionSummary } from '../../api/contracts/staff'

const shell = 'min-h-full bg-[#eef2f8] px-4 py-6 font-sans sm:px-6 lg:px-8 lg:py-7'

/**
 * One surface style for the whole console: a hairline border, a 12px radius and
 * no shadow. The page used to float every block on its own drop-shadowed card,
 * which gave six unrelated things the same visual weight and made the screen
 * read as a stack of widgets rather than one workspace.
 */
const surface = 'rounded-xl border border-[#e1e8f2] bg-white'

/** How often the "26 phút" labels are recomputed between refetches. */
const TICK_MS = 30_000

const UPCOMING_LIMIT = 3
const ATTENTION_PREVIEW = 3

/** The one place a tone becomes a colour, so a dot and a word never disagree. */
const dotClass: Record<StatusTone, string> = {
  ok: 'bg-[#2f8f6b]',
  info: 'bg-[#5b91ed]',
  warn: 'bg-[#d69412]',
  danger: 'bg-[#c9534a]',
  muted: 'bg-[#a8b6c9]',
}

const textTone: Record<StatusTone, string> = {
  ok: 'text-[#1f7a55]',
  info: 'text-[#2f62b8]',
  warn: 'text-[#8a5a06]',
  danger: 'text-[#b23e31]',
  muted: 'text-[#5d7085]',
}

/**
 * Staff operations console.
 *
 * Laid out as a workspace, not a report. On a desktop the two things an
 * operator holds in their head at once sit side by side above the fold:
 *
 *   ┌──────────────────────────────┬──────────────┐
 *   │ Tour đang vận hành  (2fr)    │ Cần xử lý    │
 *   │ the anchor: what the tours   │ (1fr, rail)  │
 *   │ are doing right now          │ what is wrong│
 *   ├───────────────────────┬──────┴──────────────┤
 *   │ Sắp bắt đầu    (7)    │ Tình trạng đội (5)  │
 *   └───────────────────────┴─────────────────────┘
 *
 * The previous version stacked all five sections full width. Everything was
 * legible and nothing was adjacent: seeing that a tour was paused AND that a
 * robot had dropped off meant scrolling between them. Width is the whole reason
 * an operator uses a desktop for this.
 *
 * The attention rail is FIRST in the DOM and placed into the right column at
 * `lg`. That keeps the urgent list first on a phone and first for a screen
 * reader, which is the order that matters when something is wrong.
 *
 * Progress is stops, not a percentage. `Mission.progressPercent` exists in the
 * contract and is deliberately not shown: "62%" of a campus tour is a number
 * without a definition, and it answered none of the questions an operator has.
 * `Mission.currentWaypoint`/`nextWaypoint` are real, so the card shows the leg
 * being travelled. No endpoint returns the route's full stop list, so no full
 * stepper is drawn - two honest nodes instead of five invented ones.
 */
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

  if (dashboard.isPending) return <div className={shell}><LoadingPanel /></div>
  if (dashboard.isError) return <div className={shell}><ErrorPanel error={dashboard.error} onRetry={dashboard.refetch} /></div>

  const view = dashboard.data
  const active = view.activeSessions ?? []
  const ready = fleet.find((band) => band.id === 'ready')?.units.length ?? 0

  return (
    <div className={shell}>
      <div className="mx-auto w-full max-w-[1440px]">
        <PageHeader
          scale="console"
          eyebrow="Vận hành tour"
          title="Tình hình điều hành"
          description="Tour đang chạy và việc cần xử lý nằm cạnh nhau. Lịch sắp tới và đội AMR ở bên dưới."
          action={
            <Link
              to="/staff/schedule"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#5b91ed] px-5 text-[15px] font-bold text-white hover:bg-[#407bd8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2"
            >
              Xem lịch tour
            </Link>
          }
        />

        <StatusStrip today={view.todayTours} operating={active.length} ready={ready} attention={queue.length} />

        {/* Primary workspace. Rail first in the DOM, right-hand at lg. */}
        <div className="mt-6 grid items-start gap-5 min-[1200px]:grid-cols-[minmax(0,2fr)_minmax(330px,1fr)]">
          <AttentionRail items={queue} now={now} className="min-[1200px]:col-start-2 min-[1200px]:row-start-1" />
          <OperatingSection sessions={active} amrBySession={amrBySession} now={now} className="min-[1200px]:col-start-1 min-[1200px]:row-start-1" />
        </div>

        {/* Secondary workspace. Fleet is grouped 2x2 so it stays wide and short
            instead of towering over a three-row schedule beside it. */}
        <div className="mt-6 grid items-start gap-5 min-[1200px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <UpcomingSection tours={upcoming} now={now} />
          <FleetSection bands={fleet} />
        </div>
      </div>
    </div>
  )
}

/* ── Status strip ─────────────────────────────────────────────────────────── */

function StatusStrip({ today, operating, ready, attention }: { today: number; operating: number; ready: number; attention: number }) {
  const stats = [
    { label: 'tour hôm nay', value: today, tone: 'text-[#1f314d]' },
    { label: 'đang vận hành', value: operating, tone: 'text-[#2f62b8]' },
    { label: 'AMR sẵn sàng', value: ready, tone: ready > 0 ? 'text-[#1f7a55]' : 'text-[#8a5a06]' },
    { label: 'việc cần xử lý', value: attention, tone: attention > 0 ? 'text-[#b23e31]' : 'text-[#1f7a55]' },
  ]
  return (
    <div className={`${surface} grid grid-cols-2 sm:grid-cols-4`}>
      {stats.map(({ label, value, tone }, index) => (
        <div
          key={label}
          className={`flex items-baseline gap-2 px-5 py-4 ${index % 2 === 1 ? 'border-l border-[#eef2f8]' : ''} ${index >= 2 ? 'border-t border-[#eef2f8] sm:border-t-0' : ''} ${index === 2 ? 'sm:border-l' : ''}`}
        >
          <span className={`text-[19px] leading-none font-extrabold tracking-[-0.02em] ${tone}`}>{value}</span>
          <span className="text-[13px] text-[#71819a]">{label}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Section chrome ───────────────────────────────────────────────────────── */

function SectionHeading({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-[#1f314d]">{title}</h2>
        {note && <p className="truncate text-[13px] text-[#8a98ac]">{note}</p>}
      </div>
      {action}
    </div>
  )
}

const sectionLink =
  'inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-[13px] font-bold text-[#2f62b8] hover:bg-[#e7effc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2'

/* ── Tour đang vận hành ───────────────────────────────────────────────────── */

function OperatingSection({ sessions, amrBySession, now, className = '' }: {
  sessions: TourSessionSummary[]; amrBySession: Map<string, AmrStatus>; now: number; className?: string
}) {
  return (
    <section className={`min-w-0 ${className}`} aria-label="Tour đang vận hành">
      <SectionHeading title="Tour đang vận hành" note={sessions.length > 0 ? `${sessions.length} tour` : undefined} />
      {sessions.length === 0 ? (
        <div className={`${surface} px-5 py-10 text-center text-[15px] font-medium text-[#8a98ac]`}>
          Không có tour nào đang chạy.
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <OperatingTourCard key={session.id} session={session} amr={amrBySession.get(session.id)} now={now} />
          ))}
        </div>
      )}
    </section>
  )
}

function OperatingTourCard({ session, amr, now }: { session: TourSessionSummary; amr?: AmrStatus; now: number }) {
  /*
   * The dashboard payload has no waypoints; `Mission` does, and it is one call
   * per running tour on a key the session detail page already uses, so opening
   * that tour is warm. This is the whole reason the card can say where the tour
   * is going instead of printing a percentage.
   */
  const detail = useTourSession(session.id)
  const mission = detail.data?.mission

  const state = session.missionState || session.status
  const tone = statusInfo(state).tone
  const elapsed = formatElapsed(session.startTime, now)
  const paused = statusInfo(session.missionState || session.status).tone === 'warn'

  const current = mission?.currentWaypoint || amr?.currentPoi || null
  const next = mission?.nextWaypoint || null

  const connection = amr ? statusInfo(amr.connectionState) : null
  const lowBattery = amr?.batteryPercent != null && amr.batteryPercent < 20

  return (
    <article className={`${surface} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-[19px] leading-7 font-extrabold tracking-[-0.02em] text-[#1f314d]">{session.routeName}</h3>
          {/* Time, duration and robot as one metadata line, not three pills. */}
          <p className="mt-1 text-[13px] text-[#71819a]">
            {formatTime(session.startTime)}
            {elapsed ? ` · ${elapsed}` : ''}
            {session.amrName ? ` · ${session.amrName}` : ' · chưa gán AMR'}
          </p>
        </div>
        {/* The single badge on this card: what the tour is doing. */}
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-bold ${tone === 'warn' ? 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]' : tone === 'danger' ? 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]' : 'border-[#cfe1fb] bg-[#eef5ff] text-[#2f62b8]'}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass[tone]}`} />
          {statusLabel(state)}
        </span>
      </div>

      <TourLeg current={current} next={next} loading={detail.isPending} tone={tone} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#eef2f8] pt-4">
        {/* Robot facts as text. The band on the fleet panel carries state; a
            second pill here would say the same thing twice. */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-[#647793]">
          <span className="flex items-center gap-1.5 font-bold text-[#40546f]">
            <Bot size={16} className="shrink-0 text-[#a8b6c9]" aria-hidden="true" />
            {session.amrName || 'Chưa gán AMR'}
          </span>
          {connection && (
            <>
              <span aria-hidden="true" className="text-[#c3cad6]">·</span>
              <span className={`flex items-center gap-1.5 font-semibold ${textTone[connection.tone]}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass[connection.tone]}`} />
                {connection.label}
              </span>
            </>
          )}
          {amr && (
            <>
              <span aria-hidden="true" className="text-[#c3cad6]">·</span>
              <span className={lowBattery ? 'font-bold text-[#b23e31]' : ''}>
                {amr.batteryPercent == null ? 'Chưa có số liệu pin' : `Pin ${formatBattery(amr.batteryPercent)}`}
              </span>
            </>
          )}
          {!amr && <span className="text-[13px] text-[#8a98ac]">Chưa nhận được telemetry cho tour này.</span>}
        </p>

        {/*
          One action, worded for the state it is in. Pause/resume/recall/cancel
          live on the tour screen, behind a confirmation that records a reason;
          this points at that screen rather than duplicating a flow that writes
          to the audit log.
        */}
        <Link
          to={`/staff/tours/${session.id}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#1f314d] px-5 text-[14px] font-bold text-white hover:bg-[#2f4768] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2"
        >
          {paused ? 'Xử lý tạm dừng' : 'Mở tour'}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}

/**
 * The leg being travelled: where the tour is, and where it goes next.
 *
 * Two nodes, because two is what the contract knows. A five-stop chain would
 * need the route's POI list and no endpoint returns one, so drawing it would be
 * drawing fiction on an operations screen.
 */
function TourLeg({ current, next, loading, tone }: { current: string | null; next: string | null; loading: boolean; tone: StatusTone }) {
  return (
    <div className="mt-5 rounded-lg bg-[#f5f8fd] p-4">
      <p className="text-[12px] font-bold tracking-[0.06em] text-[#8a98ac] uppercase">Chặng hiện tại</p>

      {loading && !current ? (
        <p className="mt-2 text-[15px] text-[#8a98ac]" aria-busy="true">Đang lấy vị trí…</p>
      ) : !current ? (
        <p className="mt-2 text-[15px] text-[#8a98ac]">Chưa có dữ liệu điểm dừng cho tour này.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${dotClass[tone]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] leading-6 font-bold text-[#1f314d]">{current}</span>
              <span className="block text-[12px] text-[#8a98ac]">đang ở đây</span>
            </span>
          </div>

          <ArrowRight size={18} className="hidden shrink-0 text-[#b9c6d8] sm:block" aria-hidden="true" />

          <div className="flex min-w-0 items-center gap-2.5 border-t border-[#e4ebf5] pt-3 sm:border-t-0 sm:pt-0">
            <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-[#c3cad6] bg-white" />
            <span className="min-w-0">
              <span className={`block truncate text-[16px] leading-6 font-bold ${next ? 'text-[#40546f]' : 'text-[#9aa8bd]'}`}>
                {next || 'Chưa có điểm kế tiếp'}
              </span>
              <span className="block text-[12px] text-[#8a98ac]">điểm tiếp theo</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Cần xử lý (right rail) ───────────────────────────────────────────────── */

function AttentionRail({ items, now, className = '' }: { items: AttentionItem[]; now: number; className?: string }) {
  const acknowledge = useAcknowledgeAlert()
  const [seen, setSeen] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)

  const shown = expanded ? items : items.slice(0, ATTENTION_PREVIEW)
  const hidden = items.length - shown.length
  const critical = items.filter((item) => item.tone === 'danger').length

  return (
    <section className={`min-w-0 ${className}`} aria-label="Việc cần xử lý">
      <SectionHeading
        title="Cần xử lý"
        note={items.length === 0 ? undefined : critical > 0 ? `${critical}/${items.length} nghiêm trọng` : `${items.length} mục`}
      />

      {items.length === 0 ? (
        <div className={`${surface} flex items-center gap-2.5 px-5 py-4 text-[14px] font-semibold text-[#1f7a55]`}>
          <CircleCheck size={18} aria-hidden="true" />
          Không có việc cần xử lý.
        </div>
      ) : (
        <div className={surface}>
          <ul className="divide-y divide-[#eef2f8]">
            {shown.map((item) => (
              <RailItem
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
              className="flex min-h-11 w-full items-center justify-center border-t border-[#eef2f8] px-4 text-[13px] font-bold text-[#2f62b8] hover:bg-[#f7faff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4f8df7]"
            >
              {expanded ? 'Thu gọn' : `Xem thêm ${hidden} vấn đề`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function RailItem({ item, now, acknowledged, busy, onAcknowledge }: {
  item: AttentionItem; now: number; acknowledged: boolean; busy: boolean; onAcknowledge: (id: string) => void
}) {
  const elapsed = formatElapsed(item.since, now)
  const danger = item.tone === 'danger'
  const accent = danger ? 'text-[#b23e31]' : 'text-[#8a5a06]'

  return (
    <li className={`border-l-[3px] p-4 ${danger ? 'border-l-[#c9534a]' : 'border-l-[#d69412]'}`}>
      <div className="flex gap-2.5">
        <span className={`mt-0.5 shrink-0 ${accent}`}>
          {danger ? <CircleAlert size={17} aria-hidden="true" /> : <TriangleAlert size={17} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-[#1f314d]">{item.subject}</p>
          <p className={`mt-0.5 text-[14px] font-bold ${accent}`}>{item.headline}</p>
          {/* One context line. The tour's full state lives on its own card; the
              rail only has to get the operator to the right object. */}
          {item.detail && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#71819a]">{item.detail}</p>}
          {elapsed && <p className="mt-1 text-[12px] text-[#9aa8bd]">{elapsed}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to={item.to}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#dce9fb] bg-white px-3 text-[13px] font-bold text-[#2f62b8] hover:bg-[#eff6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2"
            >
              {item.toLabel}<ChevronRight size={14} aria-hidden="true" />
            </Link>
            {/*
              The API behind this is `acknowledgeAlert`, which records who looked
              and when. "Xác nhận" did not say what was being confirmed, so the
              button says what it actually does.
            */}
            {item.alertId && !acknowledged && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAcknowledge(item.alertId as string)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-[#1f7a55] hover:bg-[#effbf5] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2"
              >
                <Eye size={14} aria-hidden="true" />Đã xem
              </button>
            )}
            {acknowledged && <span role="status" className="text-[13px] font-bold text-[#1f7a55]">Đã ghi nhận</span>}
          </div>
        </div>
      </div>
    </li>
  )
}

/* ── Sắp bắt đầu ──────────────────────────────────────────────────────────── */

function UpcomingSection({ tours, now }: { tours: StaffScheduleItem[]; now: number }) {
  return (
    <section className="min-w-0" aria-label="Tour sắp bắt đầu">
      <SectionHeading
        title="Sắp bắt đầu"
        action={<Link to="/staff/schedule" className={sectionLink}>Mở lịch đầy đủ</Link>}
      />
      {tours.length === 0 ? (
        <div className={`${surface} px-5 py-6 text-[14px] font-medium text-[#8a98ac]`}>
          Không còn tour nào chờ khởi hành hôm nay.
        </div>
      ) : (
        <ul className={`${surface} divide-y divide-[#eef2f8]`}>
          {tours.map((tour) => {
            const countdown = formatCountdown(tour.startTime, now)
            const unassigned = !tour.amrName
            return (
              <li key={tour.sessionId} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-4">
                <span className="shrink-0">
                  <span className="block text-[16px] leading-none font-extrabold text-[#1f314d]">{formatTime(tour.startTime)}</span>
                  {countdown && <span className="mt-1 block text-[12px] whitespace-nowrap text-[#9aa8bd]">{countdown}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-[#40546f]">{tour.routeName}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-[#8a98ac]">{tour.visitorName || 'Khách chưa công khai'}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${unassigned ? 'text-[#8a5a06]' : 'text-[#647793]'}`}>
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${unassigned ? dotClass.warn : dotClass.ok}`} />
                    {unassigned ? 'Chưa có AMR' : tour.amrName}
                  </span>
                  <Link
                    to={`/staff/tours/${tour.sessionId}`}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-3.5 text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] focus-visible:ring-offset-2 ${unassigned ? 'border border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06] hover:bg-[#fff3d4]' : 'border border-[#dce9fb] bg-white text-[#2f62b8] hover:bg-[#eff6ff]'}`}
                  >
                    {unassigned ? 'Gán AMR' : 'Mở tour'}<ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ── Tình trạng đội AMR ───────────────────────────────────────────────────── */

/**
 * Readiness, not inventory.
 *
 * Four groups in a 2x2, so the panel stays wide and short beside the schedule
 * rather than growing a row per robot and towering over it. The group heading
 * carries the state, so no robot needs a badge of its own.
 */
function FleetSection({ bands }: { bands: FleetBand[] }) {
  return (
    <section className="min-w-0" aria-label="Tình trạng đội AMR">
      <SectionHeading
        title="Tình trạng đội AMR"
        action={<Link to="/staff/amr" className={sectionLink}>Theo dõi AMR</Link>}
      />
      {bands.length === 0 ? (
        <div className={`${surface} px-5 py-6 text-[14px] font-medium text-[#8a98ac]`}>Chưa có AMR nào được đăng ký.</div>
      ) : (
        <div className={`${surface} grid sm:grid-cols-2`}>
          {bands.map((band, index) => (
            <div
              key={band.id}
              className={`px-5 py-4 ${index % 2 === 1 ? 'sm:border-l sm:border-[#eef2f8]' : ''} ${index > 0 ? 'border-t border-[#eef2f8]' : ''} ${index === 1 ? 'sm:border-t-0' : ''}`}
            >
              <p className="flex items-center gap-2 text-[13px] font-bold text-[#516783]">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass[band.tone]}`} />
                {band.label}
                <span className="font-semibold text-[#9aa8bd]">{band.units.length}</span>
              </p>
              <ul className="mt-2.5 space-y-2.5">
                {band.units.map((amr) => (
                  <li key={amr.id} className="min-w-0">
                    <p className="text-[14px] font-bold break-words text-[#40546f]">{amr.name}</p>
                    {/* Wraps rather than truncates: a 2x2 cell is ~220px wide and
                        an operator reading "Khu thí nghi…" has to open another
                        screen to finish the sentence. */}
                    <p className="mt-0.5 text-[13px] leading-5 break-words text-[#8a98ac]">
                      {amr.currentSessionId ? 'Đang chạy tour' : statusLabel(amr.operationalState)}
                      {amr.currentPoi ? ` · ${amr.currentPoi}` : ''}
                      {amr.batteryPercent == null ? ' · chưa có số liệu pin' : ` · pin ${formatBattery(amr.batteryPercent)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
