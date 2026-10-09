import type { TourOperation, TourState } from '../../api/contracts/staff'
import { groupSummary } from './attention'

/**
 * Figures behind the overview charts. Every value is counted from the Tours the
 * operations API returned (today plus history); nothing is seeded or projected
 * except the clearly labelled "theo lịch" line, which is the schedule itself.
 */

/** Admin dashboard's chart tones: what happened, the rest, and the flat white card. */
export const DONE = '#2d719e'
export const REST = '#8cc6ea'
export const NAVY = '#173b59'
export const CARD = 'min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05),0_0_0_1px_rgba(16,24,40,0.05)]'

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (value: string | number | Date) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** A Tour that never started and was cancelled is not part of the day's work. */
export const tookPlace = (tour: TourOperation) => tour.state !== 'Cancelled' || Boolean(tour.startedAt)
const joined = (tour: TourOperation) => tour.state === 'Running' || tour.state === 'Completed' || (tour.state === 'Cancelled' && Boolean(tour.startedAt))

export type DayResult = { key: string; label: string; completed: number; cancelled: number; total: number; rate: number | null }

/** Last 7 days, today included: completed vs ended early / cancelled, per day. */
export function lastSevenDays(tours: TourOperation[], history: TourOperation[], now: number): DayResult[] {
  const today = dayKey(now)
  const all = new Map<string, TourOperation>()
  for (const tour of [...history, ...tours]) all.set(tour.id, tour)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (6 - i))
    const key = dayKey(d)
    const onDay = [...all.values()].filter((tour) => dayKey(tour.scheduledAt) === key)
    const completed = onDay.filter((tour) => tour.state === 'Completed').length
    const cancelled = onDay.filter((tour) => tour.state === 'Cancelled').length
    const total = completed + cancelled
    return { key, label: key === today ? 'Hôm nay' : `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, completed, cancelled, total, rate: total ? Math.round((completed / total) * 100) : null }
  })
}

export type DayPoint = { at: number; joined?: number; planned?: number }

/**
 * Students through today as a step line: `joined` rises when a Tour actually
 * started (up to now), `planned` continues from now along the schedule.
 */
export function studentsThroughDay(tours: TourOperation[], now: number) {
  const events = tours.filter(tookPlace).map((tour) => ({
    at: new Date(tour.startedAt ?? tour.scheduledAt).getTime(),
    students: groupSummary(tour).students,
    joined: joined(tour),
  }))
  const times = [now, ...events.map((e) => e.at)]
  const start = new Date(Math.min(...times)); start.setMinutes(0, 0, 0); start.setHours(start.getHours() - 1)
  const end = new Date(Math.max(...times)); end.setMinutes(0, 0, 0); end.setHours(end.getHours() + 2)

  let done = 0
  const points: DayPoint[] = [{ at: start.getTime(), joined: 0 }]
  for (const e of events.filter((e) => e.joined).sort((a, b) => a.at - b.at)) {
    done += e.students
    points.push({ at: Math.min(e.at, now), joined: done })
  }
  points.push({ at: now, joined: done, planned: done })
  let planned = done
  for (const e of events.filter((e) => !e.joined).sort((a, b) => a.at - b.at)) {
    planned += e.students
    points.push({ at: Math.max(e.at, now), planned })
  }
  points.push({ at: end.getTime(), planned })
  return { points, joined: done, planned, start: start.getTime(), end: end.getTime() }
}

export const STATE_TONE: Array<{ state: TourState; label: string; color: string }> = [
  { state: 'Completed', label: 'Hoàn thành', color: '#173b59' },
  { state: 'Running', label: 'Đang chạy', color: '#2d719e' },
  { state: 'Ready', label: 'Sẵn sàng', color: '#8cc6ea' },
  { state: 'Scheduled', label: 'Chờ Admin chốt', color: '#cfe3f1' },
  { state: 'Cancelled', label: 'Đã hủy', color: '#e5e7eb' },
]

export function todayByState(tours: TourOperation[]) {
  return STATE_TONE.map((item) => ({ ...item, value: tours.filter((tour) => tour.state === item.state).length }))
}
