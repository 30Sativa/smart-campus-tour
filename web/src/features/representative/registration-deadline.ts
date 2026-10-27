import type { ActionGate, RepresentativeRegistration, RepresentativeTour } from './api/types'
import { formatDateTime } from './rep-format'

/** SRS v1.9 §3.2.b: registration closes 48 hours before the Tour starts. */
export const REGISTRATION_CLOSE_HOURS = 48

export function registrationClosesAt(scheduledStartAt: string): Date {
  return new Date(new Date(scheduledStartAt).getTime() - REGISTRATION_CLOSE_HOURS * 3_600_000)
}

/**
 * Closes a server gate once the deadline has passed. The server stays the real
 * enforcement; this keeps the button and its reason honest in the meantime.
 */
export function applyRegistrationDeadline(gate: ActionGate, scheduledStartAt: string, now = Date.now()): ActionGate {
  const closesAt = registrationClosesAt(scheduledStartAt)
  if (!gate.allowed || now < closesAt.getTime()) return gate
  return { allowed: false, reason: `Đã đóng đăng ký lúc ${formatDateTime(closesAt.toISOString())}, ${REGISTRATION_CLOSE_HOURS} giờ trước giờ bắt đầu.` }
}

export function withTourDeadline(tour: RepresentativeTour, now = Date.now()): RepresentativeTour {
  return { ...tour, register: applyRegistrationDeadline(tour.register, tour.scheduledStartAt, now) }
}

/** Edit and resubmit close with registration; cancelling stays a server decision. */
export function withRegistrationDeadline(registration: RepresentativeRegistration, now = Date.now()): RepresentativeRegistration {
  const start = registration.summary.tourScheduledStartAt
  const { edit, resubmit, cancel } = registration.allowedActions
  return { ...registration, allowedActions: { edit: applyRegistrationDeadline(edit, start, now), resubmit: applyRegistrationDeadline(resubmit, start, now), cancel } }
}
