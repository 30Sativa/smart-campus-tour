import type { StatusTone } from '../../components/ui/status-tone'
import type { MapVersion, PhysicalRobotOption, RobotReadiness } from './api/technical'
import { mapShortLabel } from './poi-labels'
import { technicalReturnPath } from './technical-nav'

/**
 * The one chip for "may this robot be used on its map", from the server's readiness; the web never re-derives it.
 * `mapText` names the map with its area key when another area has the same name; else the server's "{area} · v{n}".
 */
export function readinessView(readiness: Pick<RobotReadiness, 'state' | 'mapLabel'>, mapText?: string | null): { tone: StatusTone; label: string } {
  const label = mapText ?? readiness.mapLabel
  if (readiness.state === 'READY') return { tone: 'ok', label: label ? `Sẵn sàng · ${label}` : 'Sẵn sàng' }
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

/**
 * Where to set this robot up; `map` opens the assignment step with that version already chosen, and `returnTo` (a
 * path inside the Technical area only) is where the robot page offers to go back to.
 */
export function robotSetupPath(robotId: string, mapVersionId?: string, returnTo?: string) {
  const back = technicalReturnPath(returnTo)
  return `/technical/robots?robot=${encodeURIComponent(robotId)}${mapVersionId ? `&map=${encodeURIComponent(mapVersionId)}` : ''}${back ? `&returnTo=${encodeURIComponent(back)}` : ''}`
}

/** The return paths of the two forms that send someone to the robot page. */
export const poiReturnPath = (proposalId: string) => `/technical/pois?poi=${encodeURIComponent(proposalId)}`
export const routeReturnPath = (revisionId: string) => `/technical/route-tests?route=${encodeURIComponent(revisionId)}`

/** The sentence of the server's ROBOT_NOT_REPORTING refusal, shown before anyone tries. */
export const notReportingText = (robotCode: string, map: Pick<MapVersion, 'areaName' | 'areaKey' | 'versionNumber' | 'mapKey' | 'frameId'>, duplicates: Set<string> = new Set()) =>
  `Robot ${robotCode} chưa gửi dữ liệu theo bản đồ ${mapShortLabel(map, duplicates)}. Bật fleet_bridge với MapKey ${map.mapKey}, FrameId ${map.frameId} rồi bấm Cập nhật trạng thái.`

/**
 * A work item's text. "Lệch cấu hình bản đồ" items name a robot, and the robot's readiness reason says exactly
 * what is wrong, so it replaces the dashboard's own comparison of map keys when the robot list has it.
 */
export function actionItemDescription(item: { type: string; targetId: string | null; description: string }, robots: PhysicalRobotOption[] | undefined) {
  if (item.type !== 'MAP_MISMATCH' || !item.targetId) return item.description
  return robots?.find(robot => robot.id === item.targetId)?.readiness?.reason ?? item.description
}

export const hasMapMismatch = (items: Array<{ type: string }> | undefined) => Boolean(items?.some(item => item.type === 'MAP_MISMATCH'))
