/**
 * The two derived operational views of the dashboard payload: what needs a
 * person right now, and how ready the fleet is.
 *
 * Pure functions: no React, no fetching. The overview renders whatever this
 * returns, so what counts as urgent is decided in one place and can be tested
 * without a browser.
 *
 * EVERY signal below is computed from a field that exists in
 * `api/contracts/staff.ts`. The operator vocabulary this console would
 * ideally speak - WAITING_FOR_ROBOT, WAITING_FOR_STAFF_CONFIRMATION, AT_POI,
 * NEEDS_ASSISTANCE - is NOT in the contract, so none of it is invented here.
 * Where a real field carries the same meaning it is used instead:
 *
 *   "no robot yet"      StaffScheduleItem.amrName == null on a Scheduled tour
 *   "running late"      StaffScheduleItem.startTime < now while still Scheduled
 *   "needs a decision"  TourSessionSummary.status/missionState === Paused
 *   "robot in trouble"  AmrStatus.connectionState / operationalState
 *
 * When the backend grows the real lifecycle states, add them here and the
 * screen follows without changing.
 */
import type { AmrStatus, StaffAlert, StaffDashboard, StaffScheduleItem } from '../../api/contracts/staff'
import { statusInfo } from './status'

/** Only two tones reach this queue: everything in it is something to act on. */
export type AttentionTone = 'danger' | 'warn'

export type AttentionItem = {
  id: string
  tone: AttentionTone
  /** Who or what this is about, e.g. "AMR Lotus-03" or "Tour 14:30". */
  subject: string
  /** What is wrong, in three or four words. */
  headline: string
  /** Supporting context. Omitted rather than padded when there is none. */
  detail?: string
  /** When it started, so the row can show how long it has been waiting. */
  since?: string
  /** Where the operator goes to deal with it. Always a route that exists. */
  to: string
  toLabel: string
  /** Set only when this row is an alert that can be acknowledged in place. */
  alertId?: string
  /** Sort key. Lower is more urgent; ties break on `since`. */
  rank: number
}

/** A tour is "starting soon" inside this window, which raises its urgency. */
const SOON_MS = 15 * 60_000

const isOpen = (alert: StaffAlert) => !alert.acknowledgedAt
const toneOf = (value?: string | null) => statusInfo(value).tone
const isTrouble = (value?: string | null) => toneOf(value) === 'danger'
const needsWatching = (value?: string | null) => toneOf(value) === 'warn'

/**
 * Rank bands, so the ordering is a stated policy rather than an accident of the
 * order the pushes happen to run in. Within a band the oldest thing wins,
 * because the thing that has been waiting longest is the thing going wrong.
 */
const RANK = {
  criticalAlert: 0,
  robotDown: 1,
  tourLate: 2,
  tourUnassigned: 3,
  tourPaused: 4,
  warningAlert: 5,
  robotDegraded: 6,
} as const

const tourLabel = (item: { startTime: string }) =>
  `Tour ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.startTime))}`

/** A tour that has not run yet and has not been called off. */
export const isOpenTour = (status: string) => {
  const key = status.trim().toLowerCase()
  return key === 'scheduled' || key === 'pending' || key === 'confirmed' || key === 'upcoming'
}
const isOpenTourStatus = isOpenTour

export function buildAttentionQueue(data: StaffDashboard, now: number = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = []
  const alerts = (data.recentAlerts ?? []).filter(isOpen)

  /*
   * A robot that already has an open alert against it does not also get a
   * derived row: the alert says the same thing with a human-written message and
   * an acknowledge action, and printing both turns one problem into two lines.
   */
  const alertedAmrs = new Set(alerts.map((alert) => alert.amrName).filter(Boolean) as string[])

  for (const alert of alerts) {
    const critical = toneOf(alert.severity) === 'danger'
    items.push({
      id: `alert:${alert.id}`,
      tone: critical ? 'danger' : 'warn',
      subject: alert.amrName || 'Hệ thống',
      headline: critical ? 'Cảnh báo nghiêm trọng' : 'Cảnh báo',
      detail: alert.message,
      since: alert.createdAt,
      to: '/staff/alerts',
      toLabel: 'Mở cảnh báo',
      alertId: alert.id,
      rank: critical ? RANK.criticalAlert : RANK.warningAlert,
    })
  }

  for (const amr of data.activeAmrsList ?? []) {
    if (alertedAmrs.has(amr.name)) continue
    const down = amr.connectionState === 'Disconnected' || isTrouble(amr.operationalState)
    const degraded =
      amr.connectionState === 'Stale' ||
      needsWatching(amr.operationalState) ||
      (amr.batteryPercent != null && amr.batteryPercent < 20)
    if (!down && !degraded) continue

    items.push({
      id: `amr:${amr.id}`,
      tone: down ? 'danger' : 'warn',
      subject: amr.name,
      headline: down ? robotDownHeadline(amr) : robotDegradedHeadline(amr),
      detail: robotDetail(amr),
      since: amr.lastSeenAt ?? undefined,
      to: '/staff/amr',
      toLabel: 'Xem AMR',
      rank: down ? RANK.robotDown : RANK.robotDegraded,
    })
  }

  for (const tour of data.todaySchedule ?? []) {
    if (!isOpenTourStatus(tour.status)) continue
    const start = new Date(tour.startTime).getTime()
    const late = Number.isFinite(start) && start < now
    const soon = Number.isFinite(start) && start - now <= SOON_MS

    if (late) {
      items.push({
        id: `late:${tour.sessionId}`,
        tone: 'danger',
        subject: tourLabel(tour),
        headline: 'Quá giờ khởi hành',
        detail: tourDetail(tour),
        since: tour.startTime,
        to: `/staff/tours/${tour.sessionId}`,
        toLabel: 'Mở tour',
        rank: RANK.tourLate,
      })
      continue
    }

    if (!tour.amrName) {
      items.push({
        id: `unassigned:${tour.sessionId}`,
        tone: soon ? 'danger' : 'warn',
        subject: tourLabel(tour),
        headline: 'Chưa gán AMR',
        detail: tourDetail(tour),
        since: undefined,
        to: `/staff/tours/${tour.sessionId}`,
        toLabel: 'Gán AMR',
        rank: RANK.tourUnassigned,
      })
    }
  }

  for (const session of data.activeSessions ?? []) {
    const paused = toneOf(session.status) === 'warn' || toneOf(session.missionState) === 'warn'
    if (!paused) continue
    items.push({
      id: `paused:${session.id}`,
      tone: 'warn',
      subject: session.routeName,
      headline: 'Tour đang tạm dừng',
      detail: session.amrName ? `${session.amrName} · chờ quyết định của nhân viên` : 'Chờ quyết định của nhân viên',
      since: session.startTime,
      to: `/staff/tours/${session.id}`,
      toLabel: 'Mở tour',
      rank: RANK.tourPaused,
    })
  }

  return items.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    const at = a.since ? new Date(a.since).getTime() : Number.POSITIVE_INFINITY
    const bt = b.since ? new Date(b.since).getTime() : Number.POSITIVE_INFINITY
    return at - bt
  })
}

function robotDownHeadline(amr: AmrStatus): string {
  if (amr.connectionState === 'Disconnected') return 'Mất kết nối'
  return statusInfo(amr.operationalState).label
}

function robotDegradedHeadline(amr: AmrStatus): string {
  if (amr.connectionState === 'Stale') return 'Dữ liệu chậm'
  if (amr.batteryPercent != null && amr.batteryPercent < 20) return 'Pin yếu'
  return statusInfo(amr.operationalState).label
}

/** Context an operator can act on, never a restatement of the headline. */
function robotDetail(amr: AmrStatus): string | undefined {
  const parts: string[] = []
  if (amr.currentPoi) parts.push(amr.currentPoi)
  if (amr.currentSessionId) parts.push('đang gắn với một tour')
  if (amr.batteryPercent != null && amr.batteryPercent < 20) parts.push(`pin ${amr.batteryPercent.toFixed(0)}%`)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function tourDetail(tour: StaffScheduleItem): string {
  const who = tour.visitorName || 'Khách chưa công khai'
  return `${tour.routeName} · ${who}`
}

/* ── Fleet readiness ──────────────────────────────────────────────────────── */

/**
 * The four questions an operator asks about the fleet, in the order they ask
 * them: what is broken, what is worth watching, what is busy, what is free.
 *
 * Grouped rather than listed alphabetically because a flat device list makes
 * the reader do the triage. `id` is stable so the UI can key on it.
 */
export type FleetBandId = 'down' | 'watch' | 'busy' | 'ready'

export type FleetBand = {
  id: FleetBandId
  label: string
  tone: 'danger' | 'warn' | 'info' | 'ok'
  units: AmrStatus[]
}

export function groupFleet(amrs: AmrStatus[]): FleetBand[] {
  const bands: Record<FleetBandId, AmrStatus[]> = { down: [], watch: [], busy: [], ready: [] }

  for (const amr of amrs) {
    if (amr.connectionState === 'Disconnected' || isTrouble(amr.operationalState)) bands.down.push(amr)
    else if (
      amr.connectionState === 'Stale' ||
      needsWatching(amr.operationalState) ||
      needsWatching(amr.sensorHealth) ||
      (amr.batteryPercent != null && amr.batteryPercent < 20)
    ) bands.watch.push(amr)
    else if (amr.currentSessionId) bands.busy.push(amr)
    else bands.ready.push(amr)
  }

  const order: Array<{ id: FleetBandId; label: string; tone: FleetBand['tone'] }> = [
    { id: 'down', label: 'Mất kết nối / lỗi', tone: 'danger' },
    { id: 'watch', label: 'Cần theo dõi', tone: 'warn' },
    { id: 'busy', label: 'Đang chạy tour', tone: 'info' },
    { id: 'ready', label: 'Sẵn sàng', tone: 'ok' },
  ]

  return order
    .map((band) => ({ ...band, units: bands[band.id].sort((a, b) => a.name.localeCompare(b.name, 'vi')) }))
    .filter((band) => band.units.length > 0)
}
