import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM } from '../../../digital-twin/patrol-demo'
import { PATROL_POIS, findPath, nearestNode, nodePoint, visibleSegment } from '../../../digital-twin/patrol-routing'
import { mapToScenePose } from '../../../digital-twin/map-config'
import { openHeading, type CanMove, type DrivePoint } from '../drive'
import { NvhLights, NvhMap } from './NvhMap'
import type { DriveWorld } from './world'

const canMove: CanMove = (a, b) => visibleSegment(a, b)
const STOPS = PATROL_POIS.map((poi, index) => ({ x: poi.x, y: poi.y, label: `Điểm ${index + 1}` }))

/** Whether a camera may stand at `point`: inside the walkable floor (near a node of the corridor graph), not in a wall. */
function onWalkway(point: DrivePoint) {
  const node = nodePoint(nearestNode(point))
  return Math.hypot(node.x - point.x, node.y - point.y) < 0.9
}

function roomBehind(at: DrivePoint, yaw: number, reach: number) {
  let room = 0
  for (let d = 0.3; d <= reach + 1e-9; d += 0.3) {
    if (!onWalkway({ x: at.x - Math.cos(yaw) * d, y: at.y - Math.sin(yaw) * d })) break
    room = d
  }
  return room
}

const CHASE = { back: 4.5, height: 4.2, ahead: 1.6 }

/** The stop with the most room around it, facing the open way with space behind for the camera. */
function startPose() {
  let best = { stop: 0, yaw: 0, score: -1 }
  STOPS.forEach((at, stop) => {
    const yaw = openHeading(at, canMove, 6, 16, 3)
    let ahead = 0
    for (let d = 0.5; d <= 6 && canMove(at, { x: at.x + Math.cos(yaw) * d, y: at.y + Math.sin(yaw) * d }); d += 0.5) ahead = d
    const score = ahead + 2 * roomBehind(at, yaw, CHASE.back)
    if (score > best.score) best = { stop, yaw, score }
  })
  return { stop: best.stop, yaw: best.yaw }
}

/** Indoor: the operations Twin's floor (NVH tầng 6) and its corridor graph, as the Staff patrol uses them. */
export const nvhWorld: DriveWorld = {
  id: 'nvh',
  label: 'NVH tầng 6',
  title: 'Bản đồ vận hành · NVH tầng 6',
  scale: PATROL_MODEL_SCALE,
  floorY: PATROL_FLOOR_Y,
  toScene: point => {
    const { position } = mapToScenePose({ x: point.x, y: point.y, yaw: 0 }, PATROL_TRANSFORM)
    return [position[0], position[2]]
  },
  canMove,
  stops: STOPS,
  start: startPose(),
  route: (from, stop) => [{ x: from.x, y: from.y }, ...findPath(nearestNode(from), PATROL_POIS[stop].node).map(nodePoint), STOPS[stop]],
  cameraRoom: roomBehind,
  chase: CHASE,
  cinema: { distance: 4, height: 1.5 },
  top: 12,
  hasNight: false,
  sky: () => ({ background: '#1b2a35', fogNear: 400, fogFar: 800 }),
  Map: NvhMap,
  Lights: NvhLights,
}
