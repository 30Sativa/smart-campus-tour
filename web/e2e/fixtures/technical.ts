import type { PhysicalRobotOption, PoiProposal, PoiRevision, PoiVerificationQueueItem } from '../../src/features/technical/api/technical'
import { at, ok, type Handler } from '../support/mock-api'
import { MAP_ID, mapHandlers } from './map'

const revision = (id: string, name: string, x: number, y: number, status: string): PoiRevision => ({
  id, revisionNumber: 1, mapVersionId: MAP_ID, mapKey: 'campus-hcm', name, purpose: 'TOUR_STOP',
  description: `${name} trong tuyến tham quan.`, narrationText: `Đây là ${name}.`, fallbackVideoUrl: null,
  x, y, yaw: 1.57, cameraPreset: 'LEFT', createdAt: at(-2 * 24 * 60), isSubmitted: true, submittedAt: at(-24 * 60),
  navigationStatus: status, verificationSourceRevisionId: null, verificationMethod: null,
})

export const queue: PoiVerificationQueueItem[] = [
  { proposalId: 'p-1', currentRevision: 1, rowVersion: 'rv-p1', revision: revision('r-1', 'Thư viện', 8, 4, 'PENDING') },
  { proposalId: 'p-2', currentRevision: 1, rowVersion: 'rv-p2', revision: revision('r-2', 'Khu thực hành', 14, 2, 'PENDING') },
]
const proposals: PoiProposal[] = [
  ...queue.map((item) => ({ id: item.proposalId, currentRevision: 1, rowVersion: item.rowVersion, revision: item.revision })),
  { id: 'p-3', currentRevision: 1, rowVersion: 'rv-p3', revision: revision('r-3', 'Sảnh chính', 2, 1, 'PASS') },
]

export const robots: PhysicalRobotOption[] = [{
  id: 'robot-1', robotCode: 'AMR-01', displayName: 'Robot số 1', deactivatedAt: null, deactivationReason: null,
  firstAcceptedSyncAt: at(-60 * 24 * 60), firstAcceptedMapKey: 'campus-hcm', firstAcceptedFrameId: 'map', connectionStatus: 'CONNECTED',
  lastSyncReceivedAt: at(0), rowVersion: 'rv-robot', assignedMapVersionId: MAP_ID, assignedAreaName: 'Campus Hồ Chí Minh', assignedVersionNumber: 2,
  assignedMapKey: 'campus-hcm', assignedFrameId: 'map', mapAssignedAt: at(-10 * 24 * 60), mapAssignedByName: 'Đỗ Kỹ Thuật',
  latestDeployedMapKey: 'campus-hcm', latestDeployedFrameId: 'map', latestDeploymentPassed: true, needsInspection: false,
  currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: true,
}]

export function technicalHandlers(): Handler[] {
  return [
    { method: 'GET', path: /^\/api\/technical\/poi-verifications/, reply: { json: ok(queue) } },
    { method: 'GET', path: /^\/api\/staff\/poi-proposals(\?|$)/, reply: { json: ok(proposals) } },
    { method: 'GET', path: /^\/api\/technical\/physical-robots(\?|$)/, reply: { json: ok(robots) } },
    { method: 'GET', path: /^\/api\/technical\/route-verifications\//, reply: { json: ok([]) } },
    ...mapHandlers,
  ]
}
