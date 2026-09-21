/**
 * The derived views of the console: each Tour's next step, the overview
 * counts, what needs a person right now, and route progress.
 *
 * Pure functions: no React, no fetching. None of this decides whether an
 * action is ALLOWED - that is the server's `allowedActions`. This only decides
 * what to show first and where the operator goes next.
 */
import type { AmrStatus, RouteStop, TourOperation } from '../../api/contracts/staff'
import { REASON_SHORT } from './reason'

/* ── Tour next step ───────────────────────────────────────────────────────── */

export type TourAction = { label: string; to: string; kind: 'primary' | 'secondary' }

/**
 * The one action a Tour row offers. Start itself is never on a list: it lives
 * on the pre-start check, next to the reasons it is (not) enabled.
 */
export function tourAction(tour: Pick<TourOperation, 'id' | 'state' | 'operationalStatus'>): TourAction {
  const detail = `/staff/tours/${tour.id}`
  switch (tour.state) {
    case 'Ready':
      return { label: 'Kiểm tra & bắt đầu', to: `${detail}/start`, kind: 'primary' }
    case 'Running':
      return tour.operationalStatus === 'NeedsAssistance'
        ? { label: 'Xử lý hỗ trợ', to: `/staff/live/${tour.id}`, kind: 'primary' }
        : { label: 'Điều hành', to: `/staff/live/${tour.id}`, kind: 'secondary' }
    case 'Completed':
    case 'Cancelled':
      return { label: 'Xem nhật ký', to: detail, kind: 'secondary' }
    default:
      return { label: 'Xem chi tiết', to: detail, kind: 'secondary' }
  }
}

/* ── Counts ───────────────────────────────────────────────────────────────── */

export type OperationsCounts = {
  toursToday: number
  running: number
  ready: number
  scheduled: number
  finished: number
  needsAssistance: number
  groupsToday: number
}

export function operationsCounts(tours: TourOperation[]): OperationsCounts {
  const live = tours.filter((tour) => tour.state !== 'Cancelled' || tour.startedAt)
  return {
    toursToday: live.length,
    running: tours.filter((tour) => tour.state === 'Running').length,
    ready: tours.filter((tour) => tour.state === 'Ready').length,
    scheduled: tours.filter((tour) => tour.state === 'Scheduled').length,
    finished: tours.filter((tour) => tour.state === 'Completed' || (tour.state === 'Cancelled' && tour.startedAt)).length,
    needsAssistance: tours.filter((tour) => tour.operationalStatus === 'NeedsAssistance').length,
    groupsToday: live.reduce((sum, tour) => sum + tour.registrations.filter((reg) => reg.state === 'Approved').length, 0),
  }
}

/** Seconds after which a pose is not shown as live (display policy, not a robot rule). */
export const POSE_STALE_SECONDS = 5

/**
 * A robot needs a look when it cannot be reached, is not localized, reports a
 * head fault, is held after a cancelled Tour, or its pose has gone stale.
 */
export function robotIssues(robot: AmrStatus): string[] {
  const issues: string[] = []
  if (robot.connectionState !== 'Live') issues.push('Mất kết nối')
  if (robot.localized === false) issues.push('Chưa định vị')
  if (robot.headFault) issues.push('Lỗi đầu xoay')
  if (robot.needsCheck) issues.push('Chờ xác nhận kiểm tra')
  if (robot.connectionState === 'Live' && robot.poseAgeSeconds != null && robot.poseAgeSeconds > POSE_STALE_SECONDS) issues.push('Vị trí cũ')
  return issues
}

/* ── Needs attention ──────────────────────────────────────────────────────── */

export type AttentionItem = {
  id: string
  tone: 'danger' | 'warn' | 'info'
  subject: string
  headline: string
  detail?: string
  since?: string
  to: string
  toLabel: string
  rank: number
}

const DUE_MS = 15 * 60_000
const SOON_MS = 60 * 60_000

export function buildAttentionQueue({ tours, robots }: { tours: TourOperation[]; robots: AmrStatus[] }, now: number = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = []

  for (const tour of tours) {
    const start = new Date(tour.scheduledAt).getTime()
    const subject = `${tour.code} · ${tour.name}`
    if (tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance') {
      items.push({ id: `tour:${tour.id}`, tone: 'danger', subject, headline: tour.reason ? `Cần hỗ trợ · ${REASON_SHORT[tour.reason] ?? tour.reason}` : 'Cần hỗ trợ', detail: tour.reasonDetail ?? undefined, to: `/staff/live/${tour.id}`, toLabel: 'Xử lý hỗ trợ', rank: 0 })
    } else if (tour.state === 'Running' && tour.progress?.hold) {
      items.push({ id: `tour:${tour.id}`, tone: 'info', subject, headline: 'Đang giữ tại POI', detail: 'Bấm Đi tiếp khi muốn rời điểm.', to: `/staff/live/${tour.id}`, toLabel: 'Điều hành', rank: 3 })
    } else if (tour.state === 'Ready' && start - now <= DUE_MS) {
      items.push({ id: `tour:${tour.id}`, tone: start < now ? 'warn' : 'info', subject, headline: start < now ? 'Đã tới giờ, chưa bắt đầu' : 'Sắp tới giờ bắt đầu', detail: tour.allowedActions.start.allowed ? 'Đủ điều kiện kiểm tra để bắt đầu.' : tour.allowedActions.start.reason ?? undefined, since: tour.scheduledAt, to: `/staff/tours/${tour.id}/start`, toLabel: 'Kiểm tra & bắt đầu', rank: 2 })
    } else if (tour.state === 'Scheduled' && start - now <= SOON_MS) {
      items.push({ id: `tour:${tour.id}`, tone: 'warn', subject, headline: 'Chưa được Admin chốt buổi', detail: tour.readyBlockers.join(' · ') || undefined, since: tour.scheduledAt, to: `/staff/tours/${tour.id}`, toLabel: 'Xem chi tiết', rank: 4 })
    }
  }

  for (const robot of robots) {
    if (!robot.assignable) continue
    const issues = robotIssues(robot)
    if (issues.length === 0 || robot.currentSessionId) continue
    items.push({ id: `robot:${robot.id}`, tone: robot.connectionState === 'Live' ? 'warn' : 'danger', subject: robot.name, headline: issues.join(' · '), detail: robot.needsCheck ? 'Robot bị giữ sau buổi trước; kiểm tra tại chỗ rồi xác nhận sẵn sàng.' : undefined, to: '/staff/robot', toLabel: 'Mở trang robot', rank: 1 })
  }

  return items.sort((a, b) => a.rank - b.rank)
}

/* ── Route progress ───────────────────────────────────────────────────────── */

export function routeProgress(tour: Pick<TourOperation, 'stops' | 'progress'>): { done: number; total: number; current: RouteStop | null; next: RouteStop | null } {
  const done = tour.stops.filter((stop) => stop.status === 'Completed' || stop.status === 'Skipped').length
  const index = tour.progress?.stopIndex
  const current = index != null ? tour.stops[index] ?? null : null
  const next = index != null ? tour.stops[index + 1] ?? null : null
  return { done, total: tour.stops.length, current, next }
}


/** Approved groups and students of a Tour, for this screen's labels. */
export function groupSummary(tour: Pick<TourOperation, 'registrations'>) {
  const approved = tour.registrations.filter((reg) => reg.state === 'Approved')
  return {
    groups: approved.length,
    students: approved.reduce((sum, reg) => sum + reg.studentCount, 0),
    pending: tour.registrations.filter((reg) => reg.state === 'Submitted').length,
  }

/* ── Fleet readiness ──────────────────────────────────────────────────────── */

/**
 * The fleet as four readiness states, ordered best to worst: free, busy, worth
 * watching, broken.
 *
 * Grouped rather than listed alphabetically because a flat device list makes
 * the reader do the triage. `id` is stable so the UI can key on it.
 *
 * Empty bands are RETURNED, not filtered out. The overview renders this as a
 * four-column readiness board, and a board that drops a column when it happens
 * to be empty moves every other column sideways - an operator who has learnt
 * that "mất kết nối" is the far right has to re-read the labels on every
 * refresh. The count reads 0; the column stays.
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
    { id: 'ready', label: 'Sẵn sàng', tone: 'ok' },
    { id: 'busy', label: 'Đang tour', tone: 'info' },
    { id: 'watch', label: 'Cần theo dõi', tone: 'warn' },
    { id: 'down', label: 'Mất kết nối / lỗi', tone: 'danger' },
  ]

  return order.map((band) => ({
    ...band,
    units: bands[band.id].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
  }))

}
