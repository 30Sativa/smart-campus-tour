import type { RouteDetails } from '../routes/types'
import type { VersionedRoute } from '../routes/versioned-api'

export type TourState = 'SCHEDULED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
export type TourInput = {
  name: string; description: string | null; routeId: string
  scheduledStartAt: string; fallbackVideoUrl: string | null
}
export type CreateTourInput = {
  name: string; description: string | null; routeRevisionId: string; robotCode: string
  operatorUserId: string; scheduledStartAt: string; fallbackVideoUrl: string | null
}
export type TourOperator = { userId: string; fullName: string; username: string }
export type TourRobotOption = { robotCode: string; displayName: string | null; usable: boolean; blockReason: string | null }
export type TourReservation = { robotCode: string; startsAt: string; endsAt: string; measuredDurationSeconds: number; expectedDurationSeconds: number; releasedAt: string | null }
export type TourSummary = {
  id: string; name: string; description: string | null; routeId: string; routeName: string; activeRouteId: string
  scheduledStartAt: string; state: TourState; createdByUserId: string; createdAt: string; updatedAt: string | null
  rowVersion: string; registrationCount: number; invitationCount: number; routeRevisionId: string | null
  /** The active robot hold. Null for a legacy Tour and once a Tour is cancelled. */
  reservation?: TourReservation | null
}
export type TourDetails = {
  tour: TourSummary
  /** Null when the Tour was scheduled from `routeRevision`. */
  route: RouteDetails | null; activeRoute: RouteDetails | null
  routeRevision: VersionedRoute | null; operator: TourOperator | null; reservation: TourReservation | null
  fallbackVideoUrl: string | null; startedAt: string | null; endedAt: string | null; endReason: string | null
  usage: { hasRegistrations: boolean; hasAllowedBranches: boolean; hasOperationalHistory: boolean; hasRobotOwnership: boolean }
  permissions: { canEditMetadata: boolean; canChangeScheduleAndRoute: boolean; canCancel: boolean }
}
export type TourPhase = 'UPCOMING' | 'RUNNING' | 'FINISHED'
export type TourListQuery = { search?: string; state?: TourState; phase?: TourPhase; from?: string; to?: string; sort?: string; page: number; size: number }
export type TourSlotReason = 'LEAD_TIME_TOO_SHORT' | 'RESERVATION_OVERLAP' | 'ROUTE_TOO_LONG_FOR_GAP' | 'ROUTE_TEST_REMEASURE_REQUIRED'
export type TourSlot = {
  time: string; startsAt: string; available: boolean; reasonCode: TourSlotReason | null; reason: string | null
  reservationStartsAt: string | null; reservationEndsAt: string | null; registrationClosesAt: string
}
export type TourSlots = {
  routeRevisionId: string; robotCode: string; measuredDurationSeconds: number | null; expectedDurationSeconds: number | null
  days: { date: string; slots: TourSlot[] }[]
  customStartEarliest: string; customStartLatest: string
}
