/**
 * The day board of "Buổi hôm nay": where each Tour sits on the day's lanes,
 * the one line the agenda says about it, and which Tour opens first.
 *
 * Pure functions (no React, no fetching). Nothing here decides whether an
 * action is allowed; that stays with the server's `allowedActions`.
 */
import type { TourOperation, TourState } from '../../api/contracts/staff'
import { groupSummary, routeProgress } from './attention'
import { formatCountdown, formatDuration, formatTime } from './formatters'
import { REASON_SHORT } from './reason'
import { stepLabel } from './status'

export type TodayFilter = TourState | 'all'

/** The day as a flow, and each state's colour on the board. */
export const TODAY_STAGES: Array<{ key: TourState; label: string; color: string }> = [
  { key: 'Scheduled', label: 'Chờ Admin chốt', color: '#94a3b8' },
  { key: 'Ready', label: 'Sẵn sàng', color: '#4d93bd' },
  { key: 'Running', label: 'Đang chạy', color: '#2563eb' },
  { key: 'Completed', label: 'Hoàn thành', color: '#16a34a' },
  { key: 'Cancelled', label: 'Đã hủy', color: '#dc2626' },
]

const ASSISTANCE_COLOR = '#dc2626'

/** A Running Tour that asked for help is drawn red, whatever its state colour. */
export function tourColor(tour: Pick<TourOperation, 'state' | 'operationalStatus'>): string {
  if (tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance') return ASSISTANCE_COLOR
  return TODAY_STAGES.find((stage) => stage.key === tour.state)?.color ?? '#94a3b8'
}

export type Lane = 'running' | 'upcoming' | 'done'

export const LANES: Array<{ key: Lane; label: string }> = [
  { key: 'running', label: 'Đang chạy' },
  { key: 'upcoming', label: 'Sắp tới' },
  { key: 'done', label: 'Xong / hủy' },
]

export function laneOf(state: TourState): Lane {
  if (state === 'Running') return 'running'
  if (state === 'Completed' || state === 'Cancelled') return 'done'
  return 'upcoming'
}

/** Minutes since local midnight. */
export function minuteOfDay(value: string | number | Date): number {
  const date = new Date(value)
  return date.getHours() * 60 + date.getMinutes()
}

/** Where a Tour sits on the day: its scheduled start to its real or estimated end. */
export function tourSpan(tour: Pick<TourOperation, 'scheduledAt' | 'estimatedEndAt' | 'endedAt'>): { start: number; end: number } {
  const start = minuteOfDay(tour.scheduledAt)
  const end = minuteOfDay(tour.endedAt ?? tour.estimatedEndAt)
  return { start, end: end > start ? end : start + 30 }
}

export type DayWindow = { from: number; to: number }

/** 07:00–22:00, widened to whole hours so that every Tour of the day fits. */
export function dayWindow(tours: Array<Pick<TourOperation, 'scheduledAt' | 'estimatedEndAt' | 'endedAt'>>): DayWindow {
  let from = 7 * 60
  let to = 22 * 60
  for (const tour of tours) {
    const span = tourSpan(tour)
    from = Math.min(from, Math.floor(span.start / 60) * 60)
    to = Math.max(to, Math.ceil(span.end / 60) * 60)
  }
  return { from: Math.max(0, from), to: Math.min(24 * 60, to) }
}

/** A minute of the day as a percentage across the window, clamped to it. */
export function percentOf(minute: number, window: DayWindow): number {
  const value = ((minute - window.from) / (window.to - window.from)) * 100
  return Math.min(100, Math.max(0, value))
}

export function inWindow(minute: number, window: DayWindow): boolean {
  return minute >= window.from && minute <= window.to
}

/** "07:00" for a minute of the day. */
export function clockLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export type TourNote = { tone: 'ok' | 'warn' | 'danger' | 'muted'; text: string }

/** The one line the agenda says about a Tour: what to know about it right now. */
export function tourNote(tour: TourOperation): TourNote {
  switch (tour.state) {
    case 'Running': {
      if (tour.operationalStatus === 'NeedsAssistance') {
        const reason = tour.reason ? REASON_SHORT[tour.reason] ?? tour.reason : null
        return { tone: 'danger', text: reason ? `Cần hỗ trợ · ${reason}` : 'Cần hỗ trợ' }
      }
      const progress = routeProgress(tour)
      const step = tour.progress?.step ? stepLabel(tour.progress.step) : 'Đang chạy'
      return { tone: 'muted', text: progress.current ? `${step} · ${progress.current.name}` : step }
    }
    case 'Ready':
      return tour.allowedActions.start.allowed
        ? { tone: 'ok', text: 'Đủ điều kiện để kiểm tra và bắt đầu' }
        : { tone: 'warn', text: `Chưa bắt đầu được: ${tour.allowedActions.start.reason ?? 'chưa đủ điều kiện'}` }
    case 'Scheduled':
      return tour.readyBlockers.length
        ? { tone: 'warn', text: tour.readyBlockers.join(' · ') }
        : { tone: 'muted', text: 'Chờ Admin chốt buổi' }
    case 'Completed': {
      const progress = routeProgress(tour)
      return { tone: 'ok', text: `Xong lúc ${formatTime(tour.endedAt)} · ${formatDuration(tour.startedAt, tour.endedAt)} · ${progress.done}/${progress.total} POI` }
    }
    default:
      return { tone: 'danger', text: tour.endReason ?? 'Đã hủy' }
  }
}

/** The small line under the time: how long until it starts, or how long it has run. */
export function timeHint(tour: TourOperation, now: number): string {
  if (tour.state === 'Scheduled' || tour.state === 'Ready') return formatCountdown(tour.scheduledAt, now) ?? 'đã tới giờ'
  if (tour.state === 'Running' && tour.startedAt) return `đã chạy ${formatDuration(tour.startedAt, new Date(now).toISOString())}`
  return ''
}

export function byStart(a: Pick<TourOperation, 'scheduledAt'>, b: Pick<TourOperation, 'scheduledAt'>): number {
  return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
}

export function matchesSearch(tour: TourOperation, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [tour.code, tour.name, tour.routeName, ...tour.registrations.map((reg) => reg.schoolName)].some((value) => value.toLowerCase().includes(q))
}

/** What opens first on a wide screen: the running Tour, else the next to start, else the first. */
export function defaultTour<T extends TourOperation>(tours: T[], now: number): T | undefined {
  const sorted = [...tours].sort(byStart)
  return (
    sorted.find((tour) => tour.state === 'Running') ??
    sorted.find((tour) => (tour.state === 'Ready' || tour.state === 'Scheduled') && new Date(tour.scheduledAt).getTime() >= now) ??
    sorted.find((tour) => tour.state === 'Ready' || tour.state === 'Scheduled') ??
    sorted[0]
  )
}

/** Approved students across the day, leaving out cancelled Tours. */
export function studentsToday(tours: TourOperation[]): number {
  return tours.filter((tour) => tour.state !== 'Cancelled').reduce((sum, tour) => sum + groupSummary(tour).students, 0)
}
