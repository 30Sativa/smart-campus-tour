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

export type MapVersionItem = { map: MapVersion; latestDeployment: DeploymentCheck | null }

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
  getMapPackage: (id: string) => apiClient<Blob>(`/api/maps/versions/${id}/package`, { responseType: 'blob' }),
  uploadMap: (input: { areaKey: string; areaName: string; package: File }) => {
    const formData = new FormData()
    formData.set('areaKey', input.areaKey)
    formData.set('areaName', input.areaName)
    formData.set('requestId', crypto.randomUUID())
    formData.set('package', input.package)
    return apiClient<Envelope<MapVersion>>('/api/technical/map-versions', { method: 'POST', formData })
      .then(response => response.data!)
  },
  recordDeployment: ({ mapVersionId, ...input }: Omit<DeploymentCheck, 'id' | 'mapVersionId' | 'checkedAt' | 'passed'> & { mapVersionId: string }) =>
    apiClient<Envelope<DeploymentCheck>>(`/api/technical/map-versions/${mapVersionId}/deployment-checks`, {
      method: 'POST', json: { ...input, requestId: crypto.randomUUID() },
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
