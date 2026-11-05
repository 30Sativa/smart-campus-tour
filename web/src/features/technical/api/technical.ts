import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'
import type { VersionedRoute } from '../../administration/routes/versioned-api'

export type MapVersion = {
  id: string
  areaKey: string
  areaName: string
  versionNumber: number
  mapKey: string
  packageFileName: string
  packageSha256: string
  imageFileName: string
  imageWidth: number
  imageHeight: number
  resolution: number
  originX: number
  originY: number
  originYaw: number
  negate: boolean
  occupiedThreshold: number
  freeThreshold: number
  frameId: string
  validationStatus: string
  uploadedAt: string
}

export type RobotAffectedTour = { tourId: string; name: string; scheduledStartAt: string; state: string }
export type RobotLifecycleResult = { id: string; robotCode: string; deactivatedAt: string | null; deactivationReason: string | null; rowVersion: string; affectedTours: RobotAffectedTour[] }
export type MapAreaOption = { areaKey: string; displayName: string }
export type PhysicalRobotRegistration = { id: string; robotCode: string; displayName: string | null }
export type PhysicalRobotConnectionStatus = 'UNCONFIRMED' | 'CONNECTED' | 'DISCONNECTED' | 'AWAITING_DATA'
export type PhysicalRobotOption = PhysicalRobotRegistration & {
  deactivatedAt?: string | null
  deactivationReason?: string | null
  firstAcceptedSyncAt: string | null
  firstAcceptedMapKey: string | null
  firstAcceptedFrameId: string | null
  connectionStatus: PhysicalRobotConnectionStatus
  lastSyncReceivedAt: string | null
  rowVersion: string
  assignedMapVersionId: string | null
  assignedAreaName: string | null
  assignedVersionNumber: number | null
  assignedMapKey: string | null
  assignedFrameId: string | null
  mapAssignedAt: string | null
  mapAssignedByName: string | null
  latestDeployedMapKey: string | null
  latestDeployedFrameId: string | null
  latestDeploymentPassed: boolean | null
  /** Set by End Early or Reconcile (ADR-0043 D13); with `currentTourId` it means the robot is held until released on site. */
  needsInspection: boolean
  currentTourId: string | null
  currentTourName: string | null
  currentTourState: string | null
}
export type ReleaseRobotInspectionInput = { id: string; requestId: string; expectedRowVersion: string; reason: string }
export type RobotMapAssignment = Pick<PhysicalRobotOption,
  'id' | 'robotCode' | 'assignedMapVersionId' | 'assignedAreaName' | 'assignedVersionNumber' |
  'assignedMapKey' | 'assignedFrameId' | 'mapAssignedAt' | 'mapAssignedByName' | 'rowVersion'>
export type RobotCredentialAudit = {
  id: number; robotCode: string; action: string; actorUserId: string | null; actorName: string | null
  hint: string | null; reason: string | null; source: 'WEB' | 'CLI'; occurredAt: string; resultCode: string | null
}
export type RobotCredentialView = {
  robotCode: string; status: 'NOT_ISSUED' | 'ACTIVE' | 'REVOKED'; issuedAt: string | null
  issuedByUserId: string | null; issuedByName: string | null; hint: string | null
  revokedAt: string | null; revokedByUserId: string | null; revokedByName: string | null
  rowVersion: string; history: RobotCredentialAudit[]
}
export type RobotCredentialSecret = { secret: string; hint: string; issuedAt: string }

export type DeploymentCheck = {
  id: string
  mapVersionId: string
  robotCode: string
  packageSha256: string
  localizationPassed: boolean
  displayPassed: boolean
  passed: boolean
  evidenceNote: string
  checkedAt: string
}

export type MapVersionItem = {
  map: MapVersion
  latestDeployment: DeploymentCheck | null
  technicalCheckStatus: 'PENDING' | 'FAILED' | 'PASSED'
  canUseForPoiPreparation: boolean
  preparationBlockReasonCode: string | null
  preparationBlockReason: string | null
  preparationEvidence: DeploymentCheck | null
  currentlyDeployedOn: Array<{ robotCode: string; checkedAt: string }>
  poiClearanceMeters: number
}

export type PoiVerificationMethod = 'MANUAL_CHECK' | 'POSE_CAPTURE'

export type PoiRevision = {
  id: string
  revisionNumber: number
  mapVersionId: string
  mapKey: string
  name: string
  purpose: string
  description: string | null
  narrationText: string | null
  fallbackVideoUrl: string | null
  x: number
  y: number
  yaw: number
  cameraPreset: string
  createdAt: string
  isSubmitted: boolean
  submittedAt: string | null
  navigationStatus: string
  verificationSourceRevisionId: string | null
  verificationMethod?: PoiVerificationMethod | null
}

export type PoiProposal = {
  id: string
  currentRevision: number
  rowVersion: string
  revision: PoiRevision
  sourcePoiId?: string | null
}

export type PoiVerificationQueueItem = { proposalId: string; currentRevision: number; rowVersion: string; revision: PoiRevision; sourcePoiId?: string | null }
export type PoiVerification = {
  id: string; proposalId: string; proposalRevisionId: string; revisionNumber: number; mapVersionId: string
  mapKey: string; robotCode: string; resultCode: 'PASS' | 'FAIL'; reached: boolean | null; stopped: boolean | null
  localizationPassed: boolean | null; cameraPresetConfirmed: boolean | null; reason: string | null; evidenceNote: string
  checkedByUserId: string; checkedAt: string; verificationMethod: PoiVerificationMethod; sourceFileSha256: string | null
}

export type PoiImportAction = 'CREATE' | 'NEW_REVISION' | 'NO_CHANGE'
export type PoiImportPreviewFile = {
  fileName: string; fileSha256: string; poiId: string | null; name: string | null
  x: number | null; y: number | null; yaw: number | null; verified: boolean | null
  action: PoiImportAction | null; errorCode: string | null; errorMessage: string | null
}
export type PoiImportPreview = { mapVersionId: string; robotCode: string; canImport: boolean; files: PoiImportPreviewFile[] }
export type PoiImportResult = {
  requestId: string; mapVersionId: string; createdProposalIds: string[]; updatedProposalIds: string[]
  files: { fileName: string; poiId: string; action: PoiImportAction; verified: boolean; proposalId: string; proposalRevisionId: string }[]
}
type PoiImportInput = { mapVersionId: string; robotCode: string; files: File[] }

function poiImportForm({ mapVersionId, robotCode, files }: PoiImportInput) {
  const formData = new FormData()
  formData.set('mapVersionId', mapVersionId)
  formData.set('robotCode', robotCode)
  for (const file of files) formData.append('files', file)
  return formData
}

export type RouteTestParticipant = { userId: string; fullName: string; username: string }
export type RouteTestRunInput = {
  routeId: string; revisionId: string; requestId: string; robotCode: string; participatingStaffUserId: string
  resultCode: 'PASS' | 'FAIL'; allStopsReached: boolean; safelyStopped: boolean; localizationPassed: boolean
  measuredDurationSeconds: number; failureReason: string | null; evidenceNote: string
}

type Envelope<T> = ApiResponse<T>

export const technicalApi = {
  listMaps: () => apiClient<Envelope<MapVersionItem[]>>('/api/maps/versions').then(response => response.data ?? []),
  getMap: (id: string) => apiClient<Envelope<MapVersionItem>>(`/api/maps/versions/${id}`).then(response => response.data!),
  listMapAreas: () => apiClient<Envelope<MapAreaOption[]>>('/api/technical/map-areas').then(response => response.data ?? []),
  listPhysicalRobots: () => apiClient<Envelope<PhysicalRobotOption[]>>('/api/technical/physical-robots').then(response => response.data ?? []),
  listAllPhysicalRobots: () => apiClient<Envelope<PhysicalRobotOption[]>>('/api/technical/physical-robots?includeDeactivated=true').then(response => response.data ?? []),
  listRobotAffectedTours: (id: string, mapVersionId?: string) =>
    apiClient<Envelope<RobotAffectedTour[]>>(`/api/technical/physical-robots/${id}/affected-tours${mapVersionId ? `?mapVersionId=${encodeURIComponent(mapVersionId)}` : ''}`).then(response => response.data ?? []),
  deactivateRobot: ({ id, ...input }: { id: string; requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Envelope<RobotLifecycleResult>>(`/api/technical/physical-robots/${id}/deactivate`, { method: 'POST', json: input }).then(response => response.data!),
  activateRobot: ({ id, ...input }: { id: string; requestId: string; expectedRowVersion: string }) =>
    apiClient<Envelope<RobotLifecycleResult>>(`/api/technical/physical-robots/${id}/activate`, { method: 'POST', json: input }).then(response => response.data!),
  // Picks the body fields explicitly, so a caller passing extra display fields never sends them.
  releaseRobotInspection: ({ id, requestId, expectedRowVersion, reason }: ReleaseRobotInspectionInput) =>
    apiClient<Envelope<{ robotId: string }>>(`/api/technical/physical-robots/${id}/release-inspection`, { method: 'POST', json: { requestId, expectedRowVersion, reason } }).then(response => response.data!),
  assignRobotMap: (id: string, input: { requestId: string; expectedRowVersion: string; mapVersionId: string }) =>
    apiClient<Envelope<RobotMapAssignment>>(`/api/technical/physical-robots/${id}/map-assignment`, { method: 'PUT', json: input }).then(response => response.data!),
  clearRobotMap: (id: string, input: { requestId: string; expectedRowVersion: string }) =>
    apiClient<Envelope<RobotMapAssignment>>(`/api/technical/physical-robots/${id}/map-assignment`, { method: 'DELETE', json: input }).then(response => response.data!),
  registerPhysicalRobot: (input: { robotCode: string; displayName: string }) =>
    apiClient<Envelope<PhysicalRobotRegistration>>('/api/technical/physical-robots', { method: 'POST', json: input }).then(response => response.data!),
  getRobotCredential: (robotCode: string) => apiClient<Envelope<RobotCredentialView>>(`/api/robots/${encodeURIComponent(robotCode)}/credential`).then(response => response.data!),
  issueRobotCredential: (robotCode: string, input: { requestId: string; expectedRowVersion: string; reason?: string }) =>
    apiClient<Envelope<RobotCredentialSecret>>(`/api/technical/robots/${encodeURIComponent(robotCode)}/credential`, { method: 'POST', json: input }).then(response => response.data!),
  rotateRobotCredential: (robotCode: string, input: { requestId: string; expectedRowVersion: string; reason?: string }) =>
    apiClient<Envelope<RobotCredentialSecret>>(`/api/technical/robots/${encodeURIComponent(robotCode)}/credential/rotate`, { method: 'POST', json: input }).then(response => response.data!),
  revokeRobotCredential: (robotCode: string, input: { requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Envelope<{ robotCode: string; status: string; hint: string | null }>>(`/api/robots/${encodeURIComponent(robotCode)}/credential/revoke`, { method: 'POST', json: input }),
  listRobotCredentialAudit: (filter: { action?: string; robotCode?: string; actorUserId?: string; from?: string; to?: string; page: number }) => {
    const query = new URLSearchParams()
    Object.entries(filter).forEach(([key, value]) => { if (value) query.set(key, String(value)) })
    return apiClient<Envelope<{ data: RobotCredentialAudit[]; page: number; pageSize: number; totalItems: number }>>(`/api/admin/audit-logs?${query}`).then(response => response.data!)
  },
  getMapPackage: (id: string) => apiClient<Blob>(`/api/maps/versions/${id}/package`, { responseType: 'blob' }),
  uploadMap: (input: { areaKey: string; areaName: string; requestId: string; package: File }) => {
    const formData = new FormData()
    formData.set('areaKey', input.areaKey)
    formData.set('areaName', input.areaName)
    formData.set('requestId', input.requestId)
    formData.set('package', input.package)
    return apiClient<Envelope<MapVersion>>('/api/technical/map-versions', { method: 'POST', formData })
      .then(response => response.data!)
  },
  previewPoiImport: (input: PoiImportInput) =>
    apiClient<Envelope<PoiImportPreview>>('/api/technical/poi-imports/preview', { method: 'POST', formData: poiImportForm(input) }).then(response => response.data!),
  importPoiFiles: ({ requestId, evidenceNote, ...input }: PoiImportInput & { requestId: string; evidenceNote: string }) => {
    const formData = poiImportForm(input)
    formData.set('requestId', requestId)
    formData.set('evidenceNote', evidenceNote)
    return apiClient<Envelope<PoiImportResult>>('/api/technical/poi-imports', { method: 'POST', formData }).then(response => response.data!)
  },
  recordDeployment: ({ mapVersionId, requestId, ...input }: Omit<DeploymentCheck, 'id' | 'mapVersionId' | 'checkedAt' | 'passed'> & { mapVersionId: string; requestId: string }) =>
    apiClient<Envelope<DeploymentCheck>>(`/api/technical/map-versions/${mapVersionId}/deployment-checks`, {
      method: 'POST', json: { ...input, requestId },
    }).then(response => response.data!),
  listPoiProposals: (mapVersionId?: string) => apiClient<Envelope<PoiProposal[]>>(`/api/staff/poi-proposals${mapVersionId ? `?mapVersionId=${encodeURIComponent(mapVersionId)}` : ''}`).then(response => response.data ?? []),
  getPoiProposal: (id: string) => apiClient<Envelope<PoiProposal>>(`/api/staff/poi-proposals/${id}`).then(response => response.data!),
  getPoiHistory: (id: string) => apiClient<Envelope<{ proposalId: string; revisions: PoiRevision[]; verificationRecords: PoiVerification[] }>>(`/api/staff/poi-proposals/${id}/history`).then(response => response.data!),
  listPoiVerificationQueue: (mapVersionId?: string) => apiClient<Envelope<PoiVerificationQueueItem[]>>(`/api/technical/poi-verifications${mapVersionId ? `?mapVersionId=${encodeURIComponent(mapVersionId)}` : ''}`).then(response => response.data ?? []),
  createPoiProposal: (draft: { mapVersionId: string; name: string; purpose: string; description: string | null; x: number; y: number; yaw: number; cameraPreset: string; narrationText: string; fallbackVideoUrl: string | null }) =>
    apiClient<Envelope<PoiProposal>>('/api/staff/poi-proposals', { method: 'POST', json: { requestId: crypto.randomUUID(), draft } }).then(response => response.data!),
  revisePoiProposal: (id: string, current: PoiProposal, draft: { mapVersionId: string; name: string; purpose: string; description: string | null; x: number; y: number; yaw: number; cameraPreset: string; narrationText: string; fallbackVideoUrl: string | null }) =>
    apiClient<Envelope<PoiProposal>>(`/api/staff/poi-proposals/${id}/draft`, { method: 'PUT', json: { requestId: crypto.randomUUID(), expectedCurrentRevision: current.currentRevision, expectedRowVersion: current.rowVersion, draft } }).then(response => response.data!),
  submitPoiProposal: (id: string, proposal: PoiProposal) =>
    apiClient<Envelope<PoiProposal>>(`/api/staff/poi-proposals/${id}/submit`, { method: 'POST', json: { requestId: crypto.randomUUID(), expectedRevisionNumber: proposal.currentRevision, expectedRowVersion: proposal.rowVersion } }).then(response => response.data!),
  listRouteTestQueue: () => apiClient<Envelope<VersionedRoute[]>>('/api/technical/route-verifications/queue').then(response => response.data ?? []),
  listRouteTestParticipants: () => apiClient<Envelope<RouteTestParticipant[]>>('/api/technical/route-verifications/participants').then(response => response.data ?? []),
  recordRouteTest: ({ routeId, revisionId, ...input }: RouteTestRunInput) =>
    apiClient<Envelope<VersionedRoute>>(`/api/technical/routes/${routeId}/revisions/${revisionId}/test-runs`, { method: 'POST', json: input }).then(response => response.data!),
  verifyPoi: (input: {
    proposalId: string
    revisionNumber: number
    expectedRowVersion: string
    robotCode: string
    resultCode: 'PASS' | 'FAIL'
    reached: boolean
    stopped: boolean
    localizationPassed: boolean
    cameraPresetConfirmed: boolean
    reason?: string
    evidenceNote: string
  }) => {
    const { proposalId, revisionNumber, expectedRowVersion, ...result } = input
    return apiClient<Envelope<unknown>>(
      `/api/technical/poi-proposals/${proposalId}/revisions/${revisionNumber}/verification`,
      { method: 'POST', json: { ...result, expectedRevisionNumber: revisionNumber, expectedRowVersion, requestId: crypto.randomUUID() } },
    )
  },
}
