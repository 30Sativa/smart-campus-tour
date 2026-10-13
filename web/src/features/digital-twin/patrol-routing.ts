import nav from './patrol-nav.json'

export const NAV_NODES = nav.nodes
export const PATROL_POIS = nav.pois
export type Point = { x: number; y: number }
export const nodePoint = (i: number): Point => ({ x: NAV_NODES[i].p[0], y: NAV_NODES[i].p[1] })
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const TURN_COST = nav.cell * 1.5
const routeCache = new Map<string, number[]>()
const nodeLookup = new Map(NAV_NODES.map((n, i) => [`${Math.round(n.p[0] / nav.cell)},${Math.round(n.p[1] / nav.cell)}`, i]))
const obstacleBins = new Map<string, number[]>()
nav.obstacles.forEach((edge, i) => {
  for (let x = Math.floor((Math.min(edge[0][0], edge[1][0]) - nav.clearance) / 3); x <= Math.floor((Math.max(edge[0][0], edge[1][0]) + nav.clearance) / 3); x++) {
    for (let y = Math.floor((Math.min(edge[0][1], edge[1][1]) - nav.clearance) / 3); y <= Math.floor((Math.max(edge[0][1], edge[1][1]) + nav.clearance) / 3); y++) {
      const key = `${x},${y}`
      if (!obstacleBins.has(key)) obstacleBins.set(key, [])
      obstacleBins.get(key)!.push(i)
    }
  }
})
const visibilityCache = new Map<string, boolean>()
export function nearestNode(p: Point) {
  let best = 0, gap = Infinity
  NAV_NODES.forEach((n, i) => { const d = distance(p, { x: n.p[0], y: n.p[1] }); if (d < gap) { best = i; gap = d } })
  return best
}

/** Canonical A* corridor, then clear any-angle shortcuts for both travel directions. */
export function findPath(start: number, goal: number, blocked = new Set<number>()): number[] {
  if (start === goal) return []
  if (blocked.has(goal)) return []
  const from = Math.min(start, goal), to = Math.max(start, goal), key = `${from}:${to}`
  let path = blocked.size ? undefined : routeCache.get(key)
  if (!path) {
    const obstacles = new Set(blocked)
    obstacles.delete(start)
    const gridPath = corridorPath(from, to, obstacles)
    path = gridPath.length ? [gridPath[0]] : []
    for (let i = 0; i < gridPath.length - 1;) {
      let next = gridPath.length - 1
      while (next > i + 1 && !visibleSegment(nodePoint(gridPath[i]), nodePoint(gridPath[next]), obstacles)) next--
      path.push(gridPath[next]); i = next
    }
    if (!blocked.size) {
      if (routeCache.size >= 256) routeCache.delete(routeCache.keys().next().value!)
      routeCache.set(key, path)
    }
  }
  if (!path.length) return []
  return (start === from ? path : [...path].reverse()).slice(1)
}

function corridorPath(start: number, goal: number, blocked: Set<number>): number[] {
  // Each heading has its own cost: reaching a junction cheaply must not erase
  // a slightly longer approach that continues straight through that junction.
  const initial = start * 9 + 4
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
  const costs = new Map([[initial, 0]]), parent = new Map<number, number>(), done = new Set<number>()
  push(initial, distance(nodePoint(start), nodePoint(goal)))
  while (open.length) {
    const state = pop(); if (done.has(state)) continue
    const i = Math.floor(state / 9), heading = state % 9
    if (i === goal) {
      const path = [i]
      let previous = state
      while (parent.has(previous)) { previous = parent.get(previous)!; path.unshift(Math.floor(previous / 9)) }
      return path
    }
    done.add(state)
    for (const j of NAV_NODES[i].edges) {
      if (blocked.has(j)) continue
      const b = nodePoint(i), c = nodePoint(j)
      const direction = (Math.sign(c.x - b.x) + 1) * 3 + Math.sign(c.y - b.y) + 1
      const next = j * 9 + direction
      if (done.has(next)) continue
      const cost = costs.get(state)! + distance(b, c) + (heading !== 4 && heading !== direction ? TURN_COST : 0)
      if (cost >= (costs.get(next) ?? Infinity)) continue
      costs.set(next, cost); parent.set(next, state); push(next, cost + distance(c, nodePoint(goal)))
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
export function visibleSegment(a: Point, b: Point, blocked = new Set<number>()) {
  const key = [a, b].map(p => `${p.x},${p.y}`).sort().join(':')
  if (!blocked.size && visibilityCache.has(key)) return visibilityCache.get(key)!
  const check = () => {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 0.15))
    let last = nearestNode(a)
    for (let i = 0; i <= steps; i++) {
      const p = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }
      const ix = p.x / nav.cell, iy = p.y / nav.cell
      // At diagonal cell boundaries both nearest centres are equally valid.
      // Preserve graph connectivity instead of rounding into a missing corner.
      const candidates = [...new Set([Math.floor(ix), Math.ceil(ix)].flatMap(x => [Math.floor(iy), Math.ceil(iy)].map(y => nodeLookup.get(`${x},${y}`))))]
        .filter((n): n is number => n !== undefined && !blocked.has(n) && (n === last || NAV_NODES[last].edges.includes(n)) && distance(p, nodePoint(n)) <= nav.cell / Math.SQRT2 + 1e-6)
        .sort((a, b) => distance(p, nodePoint(a)) - distance(p, nodePoint(b)))
      const n = candidates[0]
      if (n === undefined) return false
      for (const index of obstacleBins.get(`${Math.floor(p.x / 3)},${Math.floor(p.y / 3)}`) ?? []) {
        const edge = nav.obstacles[index]
        if (segmentGap(p, { x: edge[0][0], y: edge[0][1] }, { x: edge[1][0], y: edge[1][1] }) < nav.clearance + 0.02) return false
      }
      last = n
    }
    return true
  }
  const result = check()
  if (!blocked.size) {
    if (visibilityCache.size >= 4096) visibilityCache.clear()
    visibilityCache.set(key, result)
  }
  return result
}
