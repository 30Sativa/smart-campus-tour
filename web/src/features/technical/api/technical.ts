import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'

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

export type MapAreaOption = { areaKey: string; displayName: string }
export type PhysicalRobotRegistration = { id: string; robotCode: string; displayName: string | null }
export type PhysicalRobotConnectionStatus = 'UNCONFIRMED' | 'CONNECTED' | 'DISCONNECTED' | 'AWAITING_DATA'
export type PhysicalRobotOption = PhysicalRobotRegistration & {
  firstAcceptedSyncAt: string | null
  firstAcceptedMapKey: string | null
  firstAcceptedFrameId: string | null
  connectionStatus: PhysicalRobotConnectionStatus
  lastSyncReceivedAt: string | null
  configuredMapKey: string | null
  configuredFrameId: string | null
  latestDeployedMapKey: string | null
  latestDeployedFrameId: string | null
}
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
}

export type PoiRevision = {
  id: string
  revisionNumber: number
  mapVersionId: string
  mapKey: string
  name: string
  purpose: string
  description: string | null
  x: number
  y: number
  yaw: number
  cameraPreset: string
  createdAt: string
  isSubmitted: boolean
  submittedAt: string | null
  navigationStatus: string
  verificationSourceRevisionId: string | null
}

export type PoiProposal = {
  id: string
  currentRevision: number
  rowVersion: string
  revision: PoiRevision
}

export type PoiVerificationQueueItem = { proposalId: string; currentRevision: number; rowVersion: string; revision: PoiRevision }
export type PoiVerification = {
  id: string; proposalId: string; proposalRevisionId: string; revisionNumber: number; mapVersionId: string
  mapKey: string; robotCode: string; resultCode: 'PASS' | 'FAIL'; reached: boolean; stopped: boolean
  localizationPassed: boolean; cameraPresetConfirmed: boolean; reason: string | null; evidenceNote: string
  checkedByUserId: string; checkedAt: string
}

type Envelope<T> = ApiResponse<T>

export const technicalApi = {
  listMaps: () => apiClient<Envelope<MapVersionItem[]>>('/api/maps/versions').then(response => response.data ?? []),
  getMap: (id: string) => apiClient<Envelope<MapVersionItem>>(`/api/maps/versions/${id}`).then(response => response.data!),
  listMapAreas: () => apiClient<Envelope<MapAreaOption[]>>('/api/technical/map-areas').then(response => response.data ?? []),
  listPhysicalRobots: () => apiClient<Envelope<PhysicalRobotOption[]>>('/api/technical/physical-robots').then(response => response.data ?? []),
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
  recordDeployment: ({ mapVersionId, requestId, ...input }: Omit<DeploymentCheck, 'id' | 'mapVersionId' | 'checkedAt' | 'passed'> & { mapVersionId: string; requestId: string }) =>
    apiClient<Envelope<DeploymentCheck>>(`/api/technical/map-versions/${mapVersionId}/deployment-checks`, {
      method: 'POST', json: { ...input, requestId },
    }).then(response => response.data!),
  listPoiProposals: (mapVersionId?: string) => apiClient<Envelope<PoiProposal[]>>(`/api/staff/poi-proposals${mapVersionId ? `?mapVersionId=${encodeURIComponent(mapVersionId)}` : ''}`).then(response => response.data ?? []),
  getPoiProposal: (id: string) => apiClient<Envelope<PoiProposal>>(`/api/staff/poi-proposals/${id}`).then(response => response.data!),
  getPoiHistory: (id: string) => apiClient<Envelope<{ proposalId: string; revisions: PoiRevision[]; verificationRecords: PoiVerification[] }>>(`/api/staff/poi-proposals/${id}/history`).then(response => response.data!),
  listPoiVerificationQueue: (mapVersionId?: string) => apiClient<Envelope<PoiVerificationQueueItem[]>>(`/api/technical/poi-verifications${mapVersionId ? `?mapVersionId=${encodeURIComponent(mapVersionId)}` : ''}`).then(response => response.data ?? []),
  createPoiProposal: (draft: { mapVersionId: string; name: string; purpose: string; description: string | null; x: number; y: number; yaw: number; cameraPreset: string }) =>
    apiClient<Envelope<PoiProposal>>('/api/staff/poi-proposals', { method: 'POST', json: { requestId: crypto.randomUUID(), draft } }).then(response => response.data!),
  revisePoiProposal: (id: string, current: PoiProposal, draft: { mapVersionId: string; name: string; purpose: string; description: string | null; x: number; y: number; yaw: number; cameraPreset: string }) =>
    apiClient<Envelope<PoiProposal>>(`/api/staff/poi-proposals/${id}/draft`, { method: 'PUT', json: { requestId: crypto.randomUUID(), expectedCurrentRevision: current.currentRevision, expectedRowVersion: current.rowVersion, draft } }).then(response => response.data!),
  submitPoiProposal: (id: string, proposal: PoiProposal) =>
    apiClient<Envelope<PoiProposal>>(`/api/staff/poi-proposals/${id}/submit`, { method: 'POST', json: { requestId: crypto.randomUUID(), expectedRevisionNumber: proposal.currentRevision, expectedRowVersion: proposal.rowVersion } }).then(response => response.data!),
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
