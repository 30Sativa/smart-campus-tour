import { expect, it } from 'vitest'
import { NAV_NODES, PATROL_POIS, distance, findPath, nodePoint, visibleSegment } from './patrol-routing'
import { straightRuns } from './fleet-paths'

it('drives directly across a clear oblique corridor instead of following eight grid headings', () => {
  // This rectangle has all grid nodes and diagonal edges; no wall requires a detour.
  const start = NAV_NODES.findIndex(n => n.p[0] === 22.5 && n.p[1] === -86.25)
  const goal = NAV_NODES.findIndex(n => n.p[0] === 24.75 && n.p[1] === -76.5)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(goal).toBeGreaterThanOrEqual(0)
  const path = [start, ...findPath(start, goal)]
  expect(path.at(-1)).toBe(goal)
  for (let i = 1; i < path.length; i++) expect(visibleSegment(nodePoint(path[i - 1]), nodePoint(path[i]))).toBe(true)
  const points = path.map(nodePoint)
  const length = points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0)
  expect(length).toBeCloseTo(distance(nodePoint(start), nodePoint(goal)), 6)
  expect(straightRuns(points)).toHaveLength(2)
})

it('uses one repeatable corridor between each point pair, including the return direction', () => {
  for (let i = 0; i < PATROL_POIS.length; i++) for (let j = i + 1; j < PATROL_POIS.length; j++) {
    const a = PATROL_POIS[i].node, b = PATROL_POIS[j].node
    const forward = [a, ...findPath(a, b)], backward = [b, ...findPath(b, a)]
    expect(forward.length).toBeGreaterThan(1)
    expect(backward).toEqual([...forward].reverse())
    expect([a, ...findPath(a, b)]).toEqual(forward)
    for (let k = 1; k < forward.length; k++) expect(visibleSegment(nodePoint(forward[k - 1]), nodePoint(forward[k])), JSON.stringify([nodePoint(forward[k - 1]), nodePoint(forward[k])])).toBe(true)
  }
})
