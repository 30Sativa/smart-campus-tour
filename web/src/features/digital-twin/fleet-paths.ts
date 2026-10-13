import { distance, type Point } from './patrol-routing'

export const FLEET_ROUTE_COLOR = '#7dc7e8'
export type FleetPath = { id: string; color: string; points: Point[]; active: boolean; dashed?: boolean }

/** Remove only collinear vertices: the drawn route still follows the validated motion path. */
export function straightRuns(points: Point[]) {
  const result: Point[] = []
  for (const point of points) {
    if (result.length && distance(result.at(-1)!, point) < 1e-7) continue
    while (result.length >= 2) {
      const a = result.at(-2)!, b = result.at(-1)!
      const cross = (b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x)
      const dot = (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y)
      if (Math.abs(cross) > 1e-7 || dot < 0) break
      result.pop()
    }
    result.push(point)
  }
  return result
}

/** Split collinear overlaps into one solid shared line; crossings alone stay dashed. */
export function mergeFleetRoutes(routes: FleetPath[]): FleetPath[] {
  type Segment = { from: number; to: number; robot: string; active: boolean; forward: boolean }
  const groups = new Map<string, { ux: number; uy: number; offset: number; segments: Segment[] }>()
  for (const route of routes) {
    const points = straightRuns(route.points)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = distance(a, b)
      let ux = (b.x - a.x) / length, uy = (b.y - a.y) / length
      if (ux < -1e-7 || Math.abs(ux) < 1e-7 && uy < 0) { ux = -ux; uy = -uy }
      const offset = -uy * a.x + ux * a.y
      const key = [ux, uy, offset].map(v => (Math.abs(v) < 1e-7 ? 0 : v).toFixed(6)).join(':')
      let group = groups.get(key)
      if (!group) { group = { ux, uy, offset, segments: [] }; groups.set(key, group) }
      const t1 = ux * a.x + uy * a.y, t2 = ux * b.x + uy * b.y
      group.segments.push({ from: Math.min(t1, t2), to: Math.max(t1, t2), robot: route.id, active: route.active, forward: t2 > t1 })
    }
  }
  const merged: FleetPath[] = []
  for (const [key, group] of groups) {
    const bounds = [...new Set(group.segments.flatMap(s => [s.from, s.to]))].sort((a, b) => a - b)
    const point = (t: number): Point => ({ x: group.ux * t - group.uy * group.offset, y: group.uy * t + group.ux * group.offset })
    for (let i = 1; i < bounds.length; i++) {
      if (bounds[i] - bounds[i - 1] < 1e-7) continue
      const middle = (bounds[i] + bounds[i - 1]) / 2
      const covering = group.segments.filter(s => s.from < middle && s.to > middle)
      if (!covering.length) continue
      const shared = new Set(covering.map(s => s.robot)).size > 1
      const points = [point(bounds[i - 1]), point(bounds[i])]
      // Private dashes must still flow toward that robot's destination.
      if (!shared && !covering[0].forward) points.reverse()
      merged.push({ id: `${key}:${bounds[i - 1].toFixed(6)}:${bounds[i].toFixed(6)}`, color: FLEET_ROUTE_COLOR,
        points, active: covering.some(s => s.active), dashed: !shared })
    }
  }
  return merged
}
