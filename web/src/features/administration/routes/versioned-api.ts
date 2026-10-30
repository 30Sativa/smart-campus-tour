import { apiClient } from '../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../api/contracts/shared'

export type RouteTestRun = {
  id: string; routeRevisionId: string; robotCode: string; checkedByUserId: string; participatingStaffUserId: string
  resultCode: 'PASS' | 'FAIL'; allStopsReached: boolean; safelyStopped: boolean; localizationPassed: boolean
  measuredDurationSeconds: number; failureReason: string | null; evidenceNote: string; checkedAt: string
}
export type VersionedRoute = {
  routeId: string; revisionId: string; revisionNumber: number; name: string; description: string | null
  mapVersionId: string; mapKey: string; mapPackageSha256: string; startX: number; startY: number; startYaw: number
  endMode: 'POSE' | 'LAST_POI'; endX: number | null; endY: number | null; endYaw: number | null
  configurationFingerprint: string; isSubmitted: boolean; verificationStatus: string; effectiveTestRunId: string | null
  durationStatus: string; dwellDurationSeconds: number; stops: Array<{ poiRevisionId: string; sourcePoiVerificationRecordId: string; stopOrder: number; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }>; name: string; x: number; y: number; yaw: number; cameraPreset: string }>
  testRuns: RouteTestRun[]; revisionHistory: Array<{ revisionId: string; revisionNumber: number; mapVersionId: string; mapPackageSha256: string; configurationFingerprint: string; isSubmitted: boolean; verificationStatus: string; effectiveTestRunId: string | null; createdAt: string }>; eligibilityIssues: string[]
}
export type VersionedRouteDraft = {
  requestId: string; expectedCurrentRevision: number; name: string; description: string | null; mapVersionId: string
  startX: number; startY: number; startYaw: number; endMode: 'POSE' | 'LAST_POI'
  endX: number | null; endY: number | null; endYaw: number | null
  stops: Array<{ poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: 'FRONT' | 'LEFT' | 'RIGHT'; holdSeconds: number }> }>
}

export const versionedRoutesApi = {
  list: (page = 1) => apiClient<PagedApiResponse<VersionedRoute>>(`/api/routes?page=${page}&size=100&sort=name`),
  get: (routeId: string, revisionId?: string) => apiClient<ApiResponse<VersionedRoute>>(`/api/routes/${routeId}/revisions${revisionId ? `?revisionId=${revisionId}` : ''}`).then(result => result.data!),
  create: (draft: VersionedRouteDraft) => apiClient<ApiResponse<VersionedRoute>>('/api/staff/routes', { method: 'POST', json: draft }).then(result => result.data!),
  revise: (routeId: string, draft: VersionedRouteDraft) => apiClient<ApiResponse<VersionedRoute>>(`/api/staff/routes/${routeId}/revisions`, { method: 'POST', json: draft }).then(result => result.data!),
  submit: (route: VersionedRoute) => apiClient<ApiResponse<VersionedRoute>>(`/api/staff/routes/${route.routeId}/revisions/${route.revisionId}/submit`, { method: 'POST', json: { requestId: crypto.randomUUID(), expectedCurrentRevision: route.revisionNumber } }).then(result => result.data!),
}
