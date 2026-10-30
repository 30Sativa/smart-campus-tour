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
export type TourReservation = { robotCode: string; startsAt: string; endsAt: string; measuredDurationSeconds: number; releasedAt: string | null }
export type TourSummary = {
  id: string; name: string; description: string | null; routeId: string; routeName: string; activeRouteId: string
  scheduledStartAt: string; state: TourState; createdByUserId: string; createdAt: string; updatedAt: string | null
  rowVersion: string; registrationCount: number; invitationCount: number; routeRevisionId: string | null
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
export type TourListQuery = { search?: string; state?: TourState; page: number; size: number }
