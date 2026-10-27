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
}

export type PoiProposal = {
  id: string
  currentRevision: number
  rowVersion: string
  revision: PoiRevision
}

type Envelope<T> = ApiResponse<T>

export const technicalApi = {
  listMaps: () => apiClient<Envelope<MapVersionItem[]>>('/api/maps/versions').then(response => response.data ?? []),
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
  listPoiProposals: () => apiClient<Envelope<PoiProposal[]>>('/api/staff/poi-proposals').then(response => response.data ?? []),
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
