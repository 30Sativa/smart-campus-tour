import { campusTime } from './tour-calendar'
import type { TourReservation, TourSummary } from './types'

/** Start is accepted until 15 minutes after the scheduled start (backend FleetCommands:StartLateLimitMinutes). */
const START_LATE_LIMIT_MS = 15 * 60_000

/**
 * A SCHEDULED/READY Tour past its Start window: when the server will cancel it (ADR-0047). Display only; the server
 * decides. The time is the robot hold's end, never earlier than the close of the Start window.
 */
export function overdueStartLabel(tour: Pick<TourSummary, 'state' | 'scheduledStartAt'>,
  reservation: Pick<TourReservation, 'endsAt'> | null | undefined, now: number): string | null {
  if (tour.state !== 'SCHEDULED' && tour.state !== 'READY') return null
  const lastStart = new Date(tour.scheduledStartAt).getTime() + START_LATE_LIMIT_MS
  if (now <= lastStart) return null
  const holdEnd = reservation ? Math.max(new Date(reservation.endsAt).getTime(), lastStart) : lastStart
  return `Quá giờ bắt đầu · tự huỷ lúc ${campusTime(new Date(holdEnd).toISOString())}`
}
