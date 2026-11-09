import type { ActionGate, RepresentativeRegistration, RepresentativeTour } from './api/types'
import { formatDateTime } from './rep-format'

/** SRS v1.9 §3.2.b: registration closes 48 hours before the Tour starts. Used only for a server that does not send the deadline. */
export const REGISTRATION_CLOSE_HOURS = 48

/** A Tour's start and, from a current server, its own deadline: a short-notice Tour has no 48-hour close (ADR-0050). */
export type TourTiming = string | { scheduledStartAt: string; registrationClosesAt?: string | null }

export function registrationClosesAt(tour: TourTiming): Date {
  if (typeof tour !== 'string' && tour.registrationClosesAt) return new Date(tour.registrationClosesAt)
  const start = typeof tour === 'string' ? tour : tour.scheduledStartAt
  return new Date(new Date(start).getTime() - REGISTRATION_CLOSE_HOURS * 3_600_000)
}

/**
 * Closes a server gate once the deadline has passed. The server stays the real
 * enforcement; this keeps the button and its reason honest in the meantime.
 */
export function applyRegistrationDeadline(gate: ActionGate, tour: TourTiming, now = Date.now()): ActionGate {
  const closesAt = registrationClosesAt(tour)
  if (!gate.allowed || now < closesAt.getTime()) return gate
  const start = typeof tour === 'string' ? tour : tour.scheduledStartAt
  const before = closesAt.getTime() < new Date(start).getTime() ? `, ${REGISTRATION_CLOSE_HOURS} giờ trước giờ bắt đầu` : ''
  return { allowed: false, reason: `Đã đóng đăng ký lúc ${formatDateTime(closesAt.toISOString())}${before}.` }
}

export function withTourDeadline(tour: RepresentativeTour, now = Date.now()): RepresentativeTour {
  return { ...tour, register: applyRegistrationDeadline(tour.register, tour, now) }
}

/** Existing-row changes and cancellation follow server gates, including after the new-row cutoff. */
export function withRegistrationDeadline(registration: RepresentativeRegistration): RepresentativeRegistration {
  return registration
}

export function newRosterRowsAllowed(tour: TourTiming, now = Date.now()): boolean {
  return now < registrationClosesAt(tour).getTime()
}
