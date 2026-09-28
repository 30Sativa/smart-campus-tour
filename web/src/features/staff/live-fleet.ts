/**
 * Live robot poses from `/hubs/fleet`, merged into the operations robot list
 * (`AmrStatus[]`) that the 3D twin already draws. Module state, because two
 * writers touch that list: the robot query (mock or API) and the hub. Whatever
 * the list source says, a live pose wins for the robot it belongs to.
 */
import type { AmrStatus, RobotSource } from '../../api/contracts/staff'
import { sampleAgeSeconds, type OperatorRobotPose, type RobotPosesMessage } from '../../api/contracts/fleet-realtime'
import { mapConfigFor } from '../digital-twin/map-config'
import { POSE_STALE_SECONDS } from './attention'

/** No sample for this long: the robot is shown as disconnected, at its last position. */
export const POSE_DISCONNECTED_SECONDS = 10

type Live = { pose: OperatorRobotPose; sentAt: string; arrivedLocalMs: number }
const live = new Map<string, Live>()

const SOURCE: Record<OperatorRobotPose['source'], RobotSource> = { physical: 'Physical', gazebo: 'Gazebo', emulator: 'Emulator' }

export function recordRobotPoses(message: RobotPosesMessage, arrivedLocalMs: number) {
  for (const pose of message.robots) live.set(pose.robotCode, { pose, sentAt: message.sentAt, arrivedLocalMs })
}

export function hasLivePoses() {
  return live.size > 0
}

/** For tests. */
export function clearLivePoses() {
  live.clear()
}

/**
 * The robot list with live poses applied. A robot is matched by id or name
 * equal to its robot code; a live robot the list does not know is appended.
 * A pose on a map whose 3D transform is not calibrated is not placed
 * (`pose: null`), with the reason in `sensorHealth`.
 */
export function applyLivePoses(robots: AmrStatus[] | undefined, now = Date.now()): AmrStatus[] {
  const list = robots ? [...robots] : []
  for (const { pose, sentAt, arrivedLocalMs } of live.values()) {
    const age = sampleAgeSeconds(sentAt, pose.receivedAt, arrivedLocalMs, now)
    const config = mapConfigFor(pose.mapKey)
    const placeable = Boolean(config?.scene.calibrated)
    const connectionState = age > POSE_DISCONNECTED_SECONDS ? 'Disconnected' : age > POSE_STALE_SECONDS ? 'Stale' : 'Live'
    const patch: Partial<AmrStatus> = {
      pose: placeable ? { x: pose.x, y: pose.y, yaw: pose.yaw } : null,
      poseAgeSeconds: Math.round(age * 10) / 10,
      telemetryAgeSeconds: Math.round(age * 10) / 10,
      lastSeenAt: pose.receivedAt,
      localized: pose.localized,
      connectionState,
      source: SOURCE[pose.source],
      // Only real hardware serves Tours; a simulator never looks assignable.
      ...(pose.source === 'physical' ? {} : { assignable: false }),
      ...(placeable ? {} : { sensorHealth: `Bản đồ ${pose.mapKey} chưa được căn chỉnh với mô hình 3D` }),
    }
    const index = list.findIndex((robot) => robot.id === pose.robotCode || robot.name === pose.robotCode)
    if (index >= 0) list[index] = { ...list[index], ...patch }
    else list.push({ id: pose.robotCode, name: pose.robotCode, operationalState: 'Unknown', sensorHealth: 'Unknown', executionState: 'Unknown', ...patch } as AmrStatus)
  }
  return list
}
