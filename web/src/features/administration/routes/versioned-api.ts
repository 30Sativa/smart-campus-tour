import { apiClient } from '../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../api/contracts/shared'

export type RouteTestRun = {
  id: string; routeRevisionId: string; robotCode: string; checkedByUserId: string; participatingStaffUserId: string
  resultCode: 'PASS' | 'FAIL'; allStopsReached: boolean; safelyStopped: boolean; localizationPassed: boolean
  /** The estimate stored when the run was recorded (older runs: what was typed). Not shown; dropped with the column later. */
  measuredDurationSeconds: number; failureReason: string | null; evidenceNote: string; checkedAt: string
  /** Null for a run from before ADR-0035. No longer read: the length is estimated from the revision. */
  measurementBasis: string | null
  /** Who recorded the run and who went with the robot; an older server omits them. */
  checkedByName?: string | null; participatingStaffName?: string | null
  /** ADR-0065: the revision stop ids in the order driven, on a route where Viewers choose the next stop. */
  traversedStopIds?: string[] | null
}
/** ADR-0065: one directed leg a voting route still has to drive in a PASS run. Null ids are the start and the end. */
export type RouteMissingLeg = { fromStopId: string | null; fromName: string; toStopId: string | null; toName: string }
export type RouteLegCoverage = { requiredCount: number; coveredCount: number; missingLegs: RouteMissingLeg[] }
/** ADR-0023 addendum: another submitted save with the same path, which the applied result also covers. */
export type RouteSharedResultRevision = { revisionId: string; revisionNumber: number; createdAt: string; scheduledTours: RouteScheduledTour[] }
export type RouteScheduleFit = 'UNKNOWN' | 'FITS' | 'OVER_RECOMMENDED' | 'TOO_LONG_FOR_SHIFT'
export type VersionedRoute = {
  routeId: string; revisionId: string; revisionNumber: number; name: string; description: string | null
  mapVersionId: string; mapKey: string; mapPackageSha256: string; startX: number; startY: number; startYaw: number
  endMode: 'POSE' | 'LAST_POI'; endX: number | null; endY: number | null; endYaw: number | null
  configurationFingerprint: string; isSubmitted: boolean; verificationStatus: string; effectiveTestRunId: string | null
  durationStatus: string; dwellDurationSeconds: number; stops: Array<{ /** `RouteRevisionStops.Id`; an older server omits it. */ id?: string; poiRevisionId: string; sourcePoiVerificationRecordId: string; stopOrder: number; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }>; name: string; x: number; y: number; yaw: number; cameraPreset: string
    /** ADR-0061: the POI the stop's revision belongs to; an older server omits it. */
    poiProposalId?: string | null }>
  /** Open for new Tours. Off does not affect Tours already scheduled. */
  isActive: boolean
  /** Opaque concurrency token for deactivate/activate. */
  rowVersion: string
  /** docs/lich-tour-theo-ca.md §4: how the expected length sits against the shifts. An older server omits it. */
  scheduleFit?: RouteScheduleFit; expectedDurationSeconds?: number | null
  /** ADR-0062: stops whose POI is retired or discarded now; no new Tour on this revision. An older server omits it. */
  retiredPoiNames?: string[]
  /** Other submitted saves with this path, and the Tours still to run on this save. An older server omits them. */
  sharedResultRevisions?: RouteSharedResultRevision[]; scheduledTours?: RouteScheduledTour[]
  /** ADR-0065: Viewers vote for the next POI; the order after the first POI is not fixed. An older server omits it. */
  viewerChoosesNextStop?: boolean
  /** ADR-0065: the legs the PASS runs since the newest FAIL drove; only on a voting route. */
  legCoverage?: RouteLegCoverage | null
  testRuns: RouteTestRun[]; revisionHistory: Array<{ revisionId: string; revisionNumber: number; mapVersionId: string; mapPackageSha256: string; configurationFingerprint: string; isSubmitted: boolean; verificationStatus: string; effectiveTestRunId: string | null; createdAt: string }>; eligibilityIssues: string[]
}
export type VersionedRouteDraft = {
  requestId: string; expectedCurrentRevision: number; name: string; description: string | null; mapVersionId: string
  startX: number; startY: number; startYaw: number; endMode: 'POSE' | 'LAST_POI'
  endX: number | null; endY: number | null; endYaw: number | null
  /** ADR-0065: an older server ignores it. */
  viewerChoosesNextStop: boolean
  stops: Array<{ poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }> }>
}

export type RouteScheduledTour = {
  id: string; name: string; scheduledStartAt: string; state: 'SCHEDULED' | 'READY'
  /** When registration closes; an older server omits it, see `registrationClosesAtOf`. */
  registrationClosesAt?: string | null
  isShortNotice?: boolean
  /** The save the Tour runs; an older server omits it. */
  routeRevisionId?: string | null
}
export type RouteAvailabilityResult = { routeId: string; isActive: boolean; scheduledTours: RouteScheduledTour[] }

export const versionedRoutesApi = {
  list: (page = 1, isActive?: boolean) => apiClient<PagedApiResponse<VersionedRoute>>(`/api/routes?page=${page}&size=100&sort=name${isActive === undefined ? '' : `&isActive=${isActive}`}`),
  scheduledTours: (routeId: string) => apiClient<ApiResponse<RouteScheduledTour[]>>(`/api/staff/routes/${routeId}/scheduled-tours`).then(result => result.data ?? []),
  setAvailability: (route: Pick<VersionedRoute, 'routeId' | 'rowVersion'>, requestId: string, active: boolean) =>
    apiClient<ApiResponse<RouteAvailabilityResult>>(`/api/staff/routes/${route.routeId}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', json: { requestId, expectedRowVersion: route.rowVersion } }).then(result => result.data!),
  get: (routeId: string, revisionId?: string) => apiClient<ApiResponse<VersionedRoute>>(`/api/routes/${routeId}/revisions${revisionId ? `?revisionId=${revisionId}` : ''}`).then(result => result.data!),
  create: (draft: VersionedRouteDraft) => apiClient<ApiResponse<VersionedRoute>>('/api/staff/routes', { method: 'POST', json: draft }).then(result => result.data!),
  revise: (routeId: string, draft: VersionedRouteDraft) => apiClient<ApiResponse<VersionedRoute>>(`/api/staff/routes/${routeId}/revisions`, { method: 'POST', json: draft }).then(result => result.data!),
  submit: (route: VersionedRoute) => apiClient<ApiResponse<VersionedRoute>>(`/api/staff/routes/${route.routeId}/revisions/${route.revisionId}/submit`, { method: 'POST', json: { requestId: crypto.randomUUID(), expectedCurrentRevision: route.revisionNumber } }).then(result => result.data!),
}
