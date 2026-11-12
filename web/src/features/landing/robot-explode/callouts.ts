import type { PartGroupId } from './parts'

/**
 * Labelled pointers from the edge of the 3D stage to parts of the robot, as on
 * a technical drawing (section 04, "Cấu tạo"). `key` callouts stay on a narrow
 * (phone) stage; the rest only show where there is room.
 */
export const CALLOUTS: readonly { group: PartGroupId; label: string; key?: boolean }[] = [
  { group: 'quest', label: 'Kính Meta Quest 3', key: true },
  { group: 'pantilt', label: 'Đầu pan–tilt' },
  { group: 'lidar', label: 'Cảm biến LiDAR', key: true },
  { group: 'camera', label: 'Camera phía trước' },
  { group: 'pc', label: 'Mini PC Beelink', key: true },
  { group: 'pcb', label: 'Mạch điều khiển' },
  { group: 'battery', label: 'Pin', key: true },
  { group: 'driver', label: 'Driver động cơ' },
  { group: 'sonar', label: 'Cảm biến siêu âm' },
  { group: 'motor', label: 'Động cơ bước', key: true },
  { group: 'wheel', label: 'Bánh chủ động', key: true },
]

export type CalloutSide = 'left' | 'right'
export type CalloutPoint = { id: number; x: number; y: number }
export type CalloutPlace = { id: number; side: CalloutSide; y: number }

/**
 * Places one label per point in two columns, left and right of the stage,
 * each label on the side of its part, in the order the parts appear from top
 * to bottom, `height + gap` apart and inside `top`..`bottom` (pixels). A part
 * near the middle keeps the side it had in `previous`, so labels do not jump
 * across as the robot turns. `side` puts every label on one side; `middle`
 * (default: half the width) is where left turns into right, for a stage with
 * a panel over one edge.
 */
export function layoutCallouts(points: readonly CalloutPoint[], frame: { width: number; top: number; bottom: number; height: number; gap: number; side?: CalloutSide; middle?: number }, previous?: ReadonlyMap<number, CalloutSide>): CalloutPlace[] {
  const middle = frame.middle ?? frame.width / 2
  const hold = frame.width * 0.08
  const sideOf = (point: CalloutPoint): CalloutSide => {
    if (frame.side) return frame.side
    const before = previous?.get(point.id)
    if (before && Math.abs(point.x - middle) < hold) return before
    return point.x < middle ? 'left' : 'right'
  }
  const placed = new Map<number, CalloutPlace>()
  const step = frame.height + frame.gap
  const last = frame.bottom - frame.height
  for (const side of ['left', 'right'] as const) {
    const column = points.filter(point => sideOf(point) === side).sort((a, b) => a.y - b.y)
    const ys = column.map(point => Math.min(last, Math.max(frame.top, point.y - frame.height / 2)))
    for (let i = 1; i < ys.length; i += 1) ys[i] = Math.max(ys[i], ys[i - 1] + step)
    if (ys.length > 0 && ys[ys.length - 1] > last) {
      ys[ys.length - 1] = last
      for (let i = ys.length - 2; i >= 0; i -= 1) ys[i] = Math.min(ys[i], ys[i + 1] - step)
    }
    column.forEach((point, i) => placed.set(point.id, { id: point.id, side, y: ys[i] }))
  }
  return points.map(point => placed.get(point.id)!)
}
