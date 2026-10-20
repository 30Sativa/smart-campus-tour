import type { RouteDetails } from '../routes/types'

export type TourState = 'SCHEDULED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
export type TourInput = {
  name: string; description: string | null; routeId: string
  scheduledStartAt: string; fallbackVideoUrl: string | null
}
export type TourSummary = {
  id: string; name: string; description: string | null; routeId: string; routeName: string; activeRouteId: string
  scheduledStartAt: string; state: TourState; createdByUserId: string; createdAt: string; updatedAt: string | null
  rowVersion: string; registrationCount: number; invitationCount: number
}
export type TourDetails = {
  tour: TourSummary; route: RouteDetails; activeRoute: RouteDetails
  fallbackVideoUrl: string | null; startedAt: string | null; endedAt: string | null; endReason: string | null
  usage: { hasRegistrations: boolean; hasAllowedBranches: boolean; hasOperationalHistory: boolean; hasRobotOwnership: boolean }
  permissions: { canEditMetadata: boolean; canChangeScheduleAndRoute: boolean; canCancel: boolean }
}
export type TourListQuery = { search?: string; state?: TourState; page: number; size: number }
