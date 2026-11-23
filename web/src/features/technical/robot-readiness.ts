import type { StatusTone } from '../../components/ui/status-tone'
import type { MapVersion, PhysicalRobotOption, RobotReadiness } from './api/technical'

/** The one chip for "may this robot be used on its map", from the server's readiness; the web never re-derives it. */
export function readinessView(readiness: Pick<RobotReadiness, 'state' | 'mapLabel'>): { tone: StatusTone; label: string } {
  if (readiness.state === 'READY') return { tone: 'ok', label: readiness.mapLabel ? `Sẵn sàng · ${readiness.mapLabel}` : 'Sẵn sàng' }
  if (readiness.state === 'NOT_READY') return { tone: 'warn', label: 'Chưa sẵn sàng' }
  return { tone: 'muted', label: 'Chưa thiết lập' }
}

/**
 * Which robot works on a map version: one area holds one robot, so at most one robot is assigned to it, and it is
 * usable only when the server says READY on exactly that version. `assigned` is that robot whatever its state.
 */
export function robotForMap(robots: PhysicalRobotOption[] | undefined, mapVersionId: string | undefined) {
  if (!mapVersionId) return { ready: undefined, assigned: undefined }
  const assigned = robots?.find(robot => !robot.deactivatedAt && robot.assignedMapVersionId === mapVersionId)
  const ready = robots?.find(robot => robot.readiness?.state === 'READY' && robot.readiness.mapVersionId === mapVersionId)
  return { ready, assigned: assigned ?? ready }
}

/** Where to set this robot up; `map` opens the assignment step with that version already chosen. */
export const robotSetupPath = (robotId: string, mapVersionId?: string) =>
  `/technical/robots?robot=${encodeURIComponent(robotId)}${mapVersionId ? `&map=${encodeURIComponent(mapVersionId)}` : ''}`

/** The sentence of the server's ROBOT_NOT_REPORTING refusal, shown before anyone tries. */
export const notReportingText = (robotCode: string, map: Pick<MapVersion, 'areaName' | 'versionNumber' | 'mapKey' | 'frameId'>) =>
  `Robot ${robotCode} chưa gửi dữ liệu theo bản đồ ${map.areaName} · v${map.versionNumber}. Bật fleet_bridge với MapKey ${map.mapKey}, FrameId ${map.frameId} rồi bấm Cập nhật trạng thái.`

/**
 * A work item's text. "Lệch cấu hình bản đồ" items name a robot, and the robot's readiness reason says exactly
 * what is wrong, so it replaces the dashboard's own comparison of map keys when the robot list has it.
 */
export function actionItemDescription(item: { type: string; targetId: string | null; description: string }, robots: PhysicalRobotOption[] | undefined) {
  if (item.type !== 'MAP_MISMATCH' || !item.targetId) return item.description
  return robots?.find(robot => robot.id === item.targetId)?.readiness?.reason ?? item.description
}

export const hasMapMismatch = (items: Array<{ type: string }> | undefined) => Boolean(items?.some(item => item.type === 'MAP_MISMATCH'))
