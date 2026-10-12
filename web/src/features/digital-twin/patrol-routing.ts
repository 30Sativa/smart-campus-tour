import nav from './patrol-nav.json'

export const NAV_NODES = nav.nodes
export const PATROL_POIS = nav.pois
export type Point = { x: number; y: number }
export const nodePoint = (i: number): Point => ({ x: NAV_NODES[i].p[0], y: NAV_NODES[i].p[1] })
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export function nearestNode(p: Point) {
  let best = 0, gap = Infinity
  NAV_NODES.forEach((n, i) => { const d = distance(p, { x: n.p[0], y: n.p[1] }); if (d < gap) { best = i; gap = d } })
  return best
}

/** A* on footprint-checked GLB edges, with temporary occupied/blocked cells. */
export function findPath(start: number, goal: number, blocked = new Set<number>()): number[] {
  if (start === goal) return []
  const open: { id: number; f: number }[] = []
  const push = (id: number, f: number) => {
    open.push({ id, f }); let i = open.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= f) break; [open[p], open[i]] = [open[i], open[p]]; i = p }
  }
  const pop = () => {
    const first = open[0], last = open.pop()!
    if (open.length) { open[0] = last; let i = 0
      while (true) { let k = i; for (const j of [i * 2 + 1, i * 2 + 2]) if (j < open.length && open[j].f < open[k].f) k = j
        if (k === i) break; [open[k], open[i]] = [open[i], open[k]]; i = k }
    }
    return first.id
  }
  const costs = new Map([[start, 0]]), parent = new Map<number, number>(), done = new Set<number>()
  push(start, distance(nodePoint(start), nodePoint(goal)))
  while (open.length) {
    const i = pop(); if (done.has(i)) continue
    if (i === goal) { const path = [i]; while (parent.get(path[0]) !== start) path.unshift(parent.get(path[0])!); return path }
    done.add(i)
    for (const j of NAV_NODES[i].edges) {
      if (blocked.has(j) || done.has(j)) continue
      const cost = costs.get(i)! + distance(nodePoint(i), nodePoint(j))
      if (cost >= (costs.get(j) ?? Infinity)) continue
      costs.set(j, cost); parent.set(j, i); push(j, cost + distance(nodePoint(j), nodePoint(goal)))
    }
  }
  return []
}

export function segmentGap(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}
export function pathGap(p: Point, path: Point[]) {
  return path.length < 2 ? distance(p, path[0] ?? p) : Math.min(...path.slice(1).map((b, i) => segmentGap(p, path[i], b)))
}
export function visibleSegment(a: Point, b: Point) {
  const steps = Math.ceil(distance(a, b) / 0.3)
  let last = nearestNode(a)
  for (let i = 1; i <= steps; i++) {
    const p = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }, n = nearestNode(p)
    if (distance(p, nodePoint(n)) > 0.56 || n !== last && !NAV_NODES[last].edges.includes(n)) return false
    last = n
  }
  return true
}
