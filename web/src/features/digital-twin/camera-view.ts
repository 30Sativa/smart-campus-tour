import { PATROL_CIRCUIT, PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM, type PatrolState } from './patrol-demo'
import { mapToScenePose } from './map-config'
import { PATROL_POIS, distance, findPath, nodePoint, visibleSegment } from './patrol-routing'

export type CameraMode = 'point' | 'robot' | 'cctv'
export type CameraView = { position: [number, number, number]; target: [number, number, number] }

// Aim along the first walkable corridor, rather than directly across walls to a distant POI.
const pointAnchors = PATROL_POIS.map((poi, index) => {
  const next = PATROL_CIRCUIT[(PATROL_CIRCUIT.indexOf(index) + 1) % PATROL_CIRCUIT.length]
  const path = findPath(poi.node, PATROL_POIS[next].node)
  let target = nodePoint(poi.node), length = 0
  for (const node of path) {
    const p = nodePoint(node); length += distance(target, p); target = p
    if (length >= 5) break
  }
  return { pose: poi, target, yaw: Math.atan2(target.y - poi.y, target.x - poi.x) }
})

export function fleetCameraView(state: PatrolState, number: number, mode: CameraMode, point: number): CameraView {
  if (mode === 'point') {
    const anchor = pointAnchors[point]
    const { position } = mapToScenePose({ ...anchor.pose, yaw: 0 }, PATROL_TRANSFORM)
    const target = mapToScenePose({ ...anchor.target, yaw: 0 }, PATROL_TRANSFORM).position
    return { position: [position[0], PATROL_FLOOR_Y + 2.4 * PATROL_MODEL_SCALE, position[2]], target: [target[0], PATROL_FLOOR_Y + 0.9 * PATROL_MODEL_SCALE, target[2]] }
  }
  const robot = state.robots.find(r => r.number === number)!
  const { position: [x, , z], rotation: yaw } = mapToScenePose(robot.pose, PATROL_TRANSFORM)
  if (mode === 'cctv') return { position: [x + 0.9, PATROL_FLOOR_Y + 1.8, z + 0.7], target: [x, PATROL_FLOOR_Y, z] }
  return {
    position: [x + Math.cos(yaw) * PATROL_MODEL_SCALE * 0.46, PATROL_FLOOR_Y + PATROL_MODEL_SCALE * 0.35, z - Math.sin(yaw) * PATROL_MODEL_SCALE * 0.46],
    target: [x + Math.cos(yaw) * 1.4, PATROL_FLOOR_Y + PATROL_MODEL_SCALE * 0.3, z - Math.sin(yaw) * 1.4],
  }
}

export function pointCameraPerception(state: PatrolState, point: number) {
  if (state.cameraOffline) return { status: 'OFFLINE', obstacles: [] as { number: number; distance: number }[] }
  const anchor = pointAnchors[point]
  const obstacles = state.robots.filter(robot => {
    const delta = Math.atan2(robot.pose.y - anchor.pose.y, robot.pose.x - anchor.pose.x) - anchor.yaw
    return distance(robot.pose, anchor.pose) <= 8 && Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) <= 75 * Math.PI / 360 && visibleSegment(anchor.pose, robot.pose)
  }).map(robot => ({ number: robot.number, distance: distance(anchor.pose, robot.pose) })).sort((a, b) => a.distance - b.distance)
  return { status: 'ONLINE', obstacles }
}
