/**
 * A demo map of the FPT University campus in Ho Chi Minh City (Saigon
 * Hi-Tech Park, Thủ Đức), laid out after the campus as it stands (its 360°
 * tour and aerial views): one long white building round a large courtyard,
 * its floors stepping back into planted terracotta terraces that rise towards
 * the corners; red-brick parking under trees in front, then the fence and the
 * dual carriageway of street D1 with palms down its median. In the courtyard,
 * a paved plaza with flowing ribbons of colour, the statue on its square of
 * hedge and the lotus pond; the motorbike park west of the building, the
 * football pitch east of it. Drawn to read well, not surveyed: sizes are close
 * to the real ones, positions simplified.
 *
 * Plain data and geometry only (no three.js), so it can be tested. Metres;
 * x along street D1 (east), y into the campus (north), origin in the middle
 * of the courtyard.
 */
import { segmentGapTo } from './geometry'
import type { CanMove, DrivePoint } from '../drive'

export type Rect = { minX: number; maxX: number; minY: number; maxY: number }
export type Circle = { x: number; y: number; r: number }

/** Where the robot may go at all. */
export const SITE: Rect = { minX: -130, maxX: 146, minY: -97.5, maxY: 58 }
/** Half the width of the robot's footprint plus a margin, m. */
export const ROBOT_RADIUS = 0.45

/**
 * The building: a ring of wings round the courtyard. Outer half-sizes, the
 * depth of a wing, the half-width of the way in through the front wing, and
 * the height of a floor.
 */
export const BUILDING = { halfX: 80, halfY: 40, depth: 16, entrance: 6, floor: 4 } as const
const B = BUILDING
export const BUILDING_BLOCKS: readonly Rect[] = [
  { minX: -B.halfX, maxX: -B.entrance, minY: -B.halfY, maxY: -B.halfY + B.depth },
  { minX: B.entrance, maxX: B.halfX, minY: -B.halfY, maxY: -B.halfY + B.depth },
  { minX: -B.halfX, maxX: B.halfX, minY: B.halfY - B.depth, maxY: B.halfY },
  { minX: -B.halfX, maxX: -B.halfX + B.depth, minY: -B.halfY + B.depth, maxY: B.halfY - B.depth },
  { minX: B.halfX - B.depth, maxX: B.halfX, minY: -B.halfY + B.depth, maxY: B.halfY - B.depth },
]
/** The courtyard inside the ring. */
export const COURTYARD: Rect = { minX: -B.halfX + B.depth, maxX: B.halfX - B.depth, minY: -B.halfY + B.depth, maxY: B.halfY - B.depth }

/**
 * One piece of a wing, drawn floor by floor: its middle, which way it runs,
 * its length, which way is outside (+1: towards +y for a wing along x, +x for
 * one along y), how many floors, and whether it is the grey-louvred hall at
 * the front corner on the right as seen from the street (its lower floors do
 * not step back).
 */
export type WingPiece = { x: number; y: number; along: 'x' | 'y'; length: number; out: 1 | -1; floors: number; hall: boolean }

/** Floors rise from 3 along the middle of each side to 7 at the corners. */
function floorsAt(x: number, y: number) {
  const corner = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => Math.hypot(x - sx * B.halfX, y - sy * B.halfY)))
  const t = 1 - Math.min(1, corner / 62)
  return 3 + Math.round(4 * t ** 1.4)
}

function pieces(from: number, to: number, size: number) {
  const count = Math.max(1, Math.round((to - from) / size))
  const length = (to - from) / count
  return Array.from({ length: count }, (_, i) => ({ at: from + length * (i + 0.5), length }))
}

export const WING_PIECES: readonly WingPiece[] = (() => {
  const list: WingPiece[] = []
  const mid = B.halfY - B.depth / 2
  for (const [from, to] of [[-B.halfX, -B.entrance], [B.entrance, B.halfX]] as const) {
    for (const { at, length } of pieces(from, to, 7.4)) list.push({ x: at, y: -mid, along: 'x', length, out: -1, floors: floorsAt(at, -mid), hall: at < -50 })
  }
  for (const { at, length } of pieces(-B.halfX, B.halfX, 8)) list.push({ x: at, y: mid, along: 'x', length, out: 1, floors: floorsAt(at, mid), hall: false })
  const side = B.halfX - B.depth / 2
  for (const sx of [-1, 1] as const) {
    for (const { at, length } of pieces(-B.halfY + B.depth, B.halfY - B.depth, 8)) list.push({ x: sx * side, y: at, along: 'y', length, out: sx, floors: floorsAt(sx * side, at), hall: false })
  }
  return list
})()

/** The campus road round the building: its centre lines (the front side runs through the parking) and width. */
export const RING_ROAD = { x: 88, south: -50, north: 50, width: 7 } as const
/** Street D1: the fence, sidewalks, the two carriageways and the palm median between them (y ranges). */
export const STREET = {
  fence: -62,
  gate: 6,
  sidewalk: [-66, -62],
  westbound: [-77, -66],
  median: [-83, -77],
  eastbound: [-94, -83],
  farSidewalk: [-98, -94],
} as const
export const FENCE_BLOCKS: readonly Rect[] = [
  { minX: SITE.minX - 20, maxX: -STREET.gate, minY: STREET.fence - 0.3, maxY: STREET.fence + 0.3 },
  { minX: STREET.gate, maxX: SITE.maxX + 20, minY: STREET.fence - 0.3, maxY: STREET.fence + 0.3 },
]
/** The guard booth inside the gate, and where its guard stands. */
export const GUARD_BOOTH: Rect = { minX: 8.4, maxX: 11.6, minY: -60.6, maxY: -57.4 }
export const GUARD = { x: 10.6, y: -56.3 } as const

/** Car bays in front of the building, either side of the campus road: rows at y, bays 2.6 m wide. */
export const BAY_ROWS = [{ minY: -46.6, maxY: -42.2 }, { minY: -58, maxY: -53.6 }] as const
const BAY = 2.6
export const BAYS: readonly { x: number; row: number; tree: boolean }[] = (() => {
  const list: { x: number; row: number; tree: boolean }[] = []
  for (let row = 0; row < BAY_ROWS.length; row += 1) {
    for (const sx of [-1, 1]) {
      for (let i = 0; 13.3 + BAY * i < 86; i += 1) list.push({ x: sx * (13.3 + BAY * i), row, tree: i % 4 === 2 })
    }
  }
  return list
})()

/** A small seeded random generator, so the campus is the same on every load. */
export function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const CAR_COLORS = ['#e9edf0', '#20262c', '#b03a2e', '#2e5e8c', '#9aa3a8', '#d9d2c3', '#f4f4f2', '#3b3f44']
/** Cars parked in the bays (about two in three). */
export const PARKED_CARS: readonly (Rect & { color: string })[] = (() => {
  const random = seeded(19)
  return BAYS.filter(bay => !bay.tree && random() < 0.66).map(bay => {
    const row = BAY_ROWS[bay.row]
    return { minX: bay.x - 0.95, maxX: bay.x + 0.95, minY: row.minY + 0.1, maxY: row.maxY - 0.1, color: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)] }
  })
})()

/** The motorbike park west of the building: turf pavers, rows of bikes, an aisle across the middle. */
export const PARKING: Rect = { minX: -126, maxX: -95, minY: -32, maxY: 32 }
export const BIKE_ROWS: readonly Rect[] = [-103, -111, -119].flatMap(x => [{ minX: x - 1.2, maxX: x + 1.2, minY: -29, maxY: -3.2 }, { minX: x - 1.2, maxX: x + 1.2, minY: 3.2, maxY: 29 }])
/** The football pitch east of the building, inside its netting. */
export const PITCH: Rect = { minX: 100, maxX: 142, minY: -16, maxY: 16 }
const NET = 1.5
export const PITCH_FENCE: readonly Rect[] = [
  { minX: PITCH.minX - NET - 0.15, maxX: PITCH.maxX + NET + 0.15, minY: PITCH.minY - NET - 0.15, maxY: PITCH.minY - NET + 0.15 },
  { minX: PITCH.minX - NET - 0.15, maxX: PITCH.maxX + NET + 0.15, minY: PITCH.maxY + NET - 0.15, maxY: PITCH.maxY + NET + 0.15 },
  { minX: PITCH.minX - NET - 0.15, maxX: PITCH.minX - NET + 0.15, minY: PITCH.minY - NET, maxY: PITCH.maxY + NET },
  { minX: PITCH.maxX + NET - 0.15, maxX: PITCH.maxX + NET + 0.15, minY: PITCH.minY - NET, maxY: PITCH.maxY + NET },
]

/** In the courtyard: the paved plaza, the statue on its square of hedge, the lotus pond (with its bamboo fence) and the grove. */
export const PLAZA: Rect = { minX: -30, maxX: 30, minY: -22, maxY: 21 }
export const STATUE = { x: 0, y: 9, half: 3.6 } as const
export const POND: Rect = { minX: -55, maxX: -37, minY: -16, maxY: 3 }
export const GROVE: Rect = { minX: 33, maxX: 58, minY: -19, maxY: 19 }
/** The bronze drum in the way in (the Hy Cương drum hall). */
export const DRUM = { x: -3.9, y: -30, r: 1.15 } as const
/** Flower beds by the pond and round the plaza. */
export const FLOWER_BEDS: readonly Rect[] = [
  { minX: -34, maxX: -31, minY: -20, maxY: -10 },
  { minX: -34, maxX: -31, minY: -1, maxY: 12 },
  { minX: -61.8, maxX: -59.4, minY: -18, maxY: 6 },
  { minX: -52, maxX: -40, minY: 8, maxY: 11 },
  { minX: 26, maxX: 31, minY: 14, maxY: 19 },
]

/** The stops of the demo tour. */
export const CAMPUS_STOPS: readonly (DrivePoint & { label: string })[] = [
  { x: 0, y: -58, label: 'Cổng chính' },
  { x: 0, y: -32, label: 'Sảnh trống đồng' },
  { x: 0, y: -6, label: 'Sân trong' },
  { x: -108, y: 0, label: 'Bãi giữ xe' },
  { x: 95, y: 0, label: 'Sân bóng' },
  { x: -30, y: -6, label: 'Hồ sen' },
]

const R = RING_ROAD
/** The paths the robot drives itself along: points, and which pairs are joined. */
export const ROUTE_NODES: readonly DrivePoint[] = [
  { x: 0, y: -58 }, // 0 gate (stop)
  { x: 0, y: R.south }, // 1 campus road, in front
  { x: R.x, y: R.south }, // 2 south-east
  { x: R.x, y: 0 }, // 3 east
  { x: R.x, y: R.north }, // 4 north-east
  { x: 0, y: R.north }, // 5 north
  { x: -R.x, y: R.north }, // 6 north-west
  { x: -R.x, y: 0 }, // 7 west
  { x: -R.x, y: R.south }, // 8 south-west
  { x: 0, y: -32 }, // 9 drum hall (stop)
  { x: 0, y: -6 }, // 10 courtyard (stop)
  { x: -96, y: 0 }, // 11 bike park entrance
  { x: -108, y: 0 }, // 12 bike park aisle (stop)
  { x: 95, y: 0 }, // 13 by the pitch (stop)
  { x: -30, y: -6 }, // 14 lotus pond (stop)
]
export const ROUTE_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 1],
  [1, 9], [9, 10], [10, 14], [7, 11], [11, 12], [3, 13],
]
/** Route node of each stop. */
export const STOP_NODES: readonly number[] = [0, 9, 10, 12, 13, 14]

/** Distance from `p` to the nearest route edge. */
function routeGap(p: DrivePoint) {
  return Math.min(...ROUTE_EDGES.map(([a, b]) => segmentGapTo(p, ROUTE_NODES[a], ROUTE_NODES[b])))
}

function inside(rect: Rect, p: DrivePoint, grow = 0) {
  return p.x > rect.minX - grow && p.x < rect.maxX + grow && p.y > rect.minY - grow && p.y < rect.maxY + grow
}

/**
 * Trees: shade trees over the parking and along the roads, a grove and a ring
 * round the plaza in the courtyard, palms down the median and at the gate,
 * flowering trees by the pond. None on a route the robot drives itself.
 */
export type TreeKind = 'shade' | 'palm' | 'flower'
export const TREES: readonly (Circle & { height: number; kind: TreeKind })[] = (() => {
  const random = seeded(2024)
  const spots: (DrivePoint & { kind: TreeKind; clear: number })[] = []
  const add = (x: number, y: number, kind: TreeKind = 'shade', clear = 3.2) => spots.push({ x, y, kind, clear })
  // In the bays left for trees, and along the fence.
  for (const bay of BAYS) if (bay.tree) add(bay.x, (BAY_ROWS[bay.row].minY + BAY_ROWS[bay.row].maxY) / 2)
  for (let x = -90; x <= 90; x += 7.5) if (Math.abs(x) > 10) add(x + (random() - 0.5) * 1.5, -59.6)
  // Palms either side of the gate and down the median.
  for (const sx of [-1, 1]) add(sx * 8.6, -63.6, 'palm', 1)
  for (let x = -174; x <= 174; x += 12) add(x, (STREET.median[0] + STREET.median[1]) / 2, 'palm', 1)
  // Along both sidewalks of the street.
  for (let x = -170; x <= 170; x += 11) {
    if (Math.abs(x) > 6) add(x, -65.3, 'shade', 1)
    add(x + 5, -97, 'shade', 1)
  }
  // Round the campus road, outside it.
  for (let t = -44; t <= 44; t += 9) add(t * 1.9, R.north + 6, 'shade')
  for (let t = -42; t <= 42; t += 9) for (const sx of [-1, 1]) add(sx * (R.x + 5.5), t)
  // The courtyard: a ring round the plaza, the grove, and flowering trees by the pond.
  for (let x = -26; x <= 26; x += 8.5) add(x, PLAZA.maxY - 1, 'shade', 4.5)
  for (const x of [-27, -18, 18, 27]) add(x, PLAZA.minY + 1.5, 'shade', 4.5)
  for (let i = 0; i < 46; i += 1) add(GROVE.minX + random() * (GROVE.maxX - GROVE.minX), GROVE.minY + random() * (GROVE.maxY - GROVE.minY), 'shade', 4.5)
  for (const [x, y] of [[-58, 10], [-36, 7], [-58, -20], [-44, 15], [-52, 18], [-60, -5]] as const) add(x, y, 'flower', 3)
  // Round the pitch and the bike park.
  for (let x = PITCH.minX; x <= PITCH.maxX; x += 7) add(x, PITCH.maxY + 6, 'shade', 2)
  for (let x = PITCH.minX; x <= PITCH.maxX; x += 7) add(x, PITCH.minY - 6, 'shade', 2)
  for (let y = -28; y <= 28; y += 8) add(PARKING.minX - 3, y, 'shade', 2)
  const blocked = [...BUILDING_BLOCKS, ...PITCH_FENCE, POND, ...BIKE_ROWS, ...PARKED_CARS, GUARD_BOOTH]
  const kept: (Circle & { height: number; kind: TreeKind })[] = []
  for (const spot of spots) {
    if (routeGap(spot) < spot.clear) continue
    if (blocked.some(rect => inside(rect, spot, 1.6))) continue
    if (Math.hypot(spot.x - STATUE.x, spot.y - STATUE.y) < STATUE.half + 3) continue
    if (kept.some(tree => Math.hypot(tree.x - spot.x, tree.y - spot.y) < (spot.kind === 'palm' ? 2 : 4))) continue
    const height = spot.kind === 'palm' ? 6.5 + random() * 2 : spot.kind === 'flower' ? 4 + random() * 1.5 : 7 + random() * 5
    kept.push({ x: spot.x, y: spot.y, r: spot.kind === 'palm' ? 0.35 : 0.45, height, kind: spot.kind })
  }
  return kept
})()

/** Street lamps: round the campus road, along the fence, down the median (two arms) and the far sidewalk. */
export type Lamp = DrivePoint & { kind: 'road' | 'median' | 'garden' }
export const LAMPS: readonly Lamp[] = (() => {
  const lamps: Lamp[] = []
  for (let x = -84; x <= 84; x += 21) if (Math.abs(x) > 8) lamps.push({ x, y: -59, kind: 'road' })
  for (let t = -42; t <= 42; t += 21) for (const sx of [-1, 1]) lamps.push({ x: sx * (R.x + 4.4), y: t, kind: 'road' })
  for (let x = -84; x <= 84; x += 21) lamps.push({ x, y: R.north + 4.4, kind: 'road' })
  for (let x = -168; x <= 168; x += 36) lamps.push({ x: x + 6, y: (STREET.median[0] + STREET.median[1]) / 2, kind: 'median' })
  for (let x = -165; x <= 165; x += 33) lamps.push({ x: x + 5.5, y: -97.3, kind: 'road' })
  // Low garden lamps round the plaza and along the way in.
  for (let x = -24; x <= 24; x += 12) lamps.push({ x, y: PLAZA.minY - 1.6, kind: 'garden' }, { x, y: PLAZA.maxY - 1, kind: 'garden' })
  for (const y of [-20, -12, 4, 12]) lamps.push({ x: -PLAZA.maxX - 0.8, y, kind: 'garden' }, { x: PLAZA.maxX + 0.8, y, kind: 'garden' })
  return lamps.filter(p => routeGap(p) > 1.6 && !TREES.some(tree => Math.hypot(tree.x - p.x, tree.y - p.y) < 1.2))
})()

const BLOCKS: readonly Rect[] = [
  ...BUILDING_BLOCKS, ...FENCE_BLOCKS, GUARD_BOOTH, ...BIKE_ROWS, ...PARKED_CARS, ...PITCH_FENCE, ...FLOWER_BEDS,
  { minX: POND.minX - 0.6, maxX: POND.maxX + 0.6, minY: POND.minY - 0.6, maxY: POND.maxY + 0.6 },
  { minX: STATUE.x - STATUE.half, maxX: STATUE.x + STATUE.half, minY: STATUE.y - STATUE.half, maxY: STATUE.y + STATUE.half },
]
const POSTS: readonly Circle[] = [
  ...TREES.map(tree => (tree.kind === 'palm' && Math.abs(tree.y - (STREET.median[0] + STREET.median[1]) / 2) < 1 ? { ...tree, r: 1.3 } : tree)),
  ...LAMPS.map(p => ({ ...p, r: 0.18 })),
  DRUM,
]

/** Whether the robot can stand at `p`: on the site, clear of buildings, fences, parked vehicles, the pond, trees and lamp posts. */
export function campusFree(p: DrivePoint) {
  if (!inside(SITE, p, -ROBOT_RADIUS)) return false
  if (BLOCKS.some(rect => inside(rect, p, ROBOT_RADIUS))) return false
  return !POSTS.some(post => Math.hypot(post.x - p.x, post.y - p.y) < post.r + ROBOT_RADIUS)
}

/** The robot can go straight from `a` to `b` (checked every 20 cm). */
export const campusCanMove: CanMove = (a, b) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.2))
  for (let i = 1; i <= steps; i += 1) {
    if (!campusFree({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps })) return false
  }
  return true
}

/** Shortest way along the route graph from the node nearest `from` to `stop`, as points (starting where the robot is). */
export function campusRoute(from: DrivePoint, stop: number): DrivePoint[] {
  const goal = STOP_NODES[stop]
  // Start at the nearest node the robot can drive to in a straight line, falling back to the nearest at all.
  const order = ROUTE_NODES.map((node, index) => ({ index, gap: Math.hypot(node.x - from.x, node.y - from.y) })).sort((a, b) => a.gap - b.gap)
  const start = (order.find(item => campusCanMove(from, ROUTE_NODES[item.index])) ?? order[0]).index
  const cost = ROUTE_NODES.map(() => Infinity)
  const previous = ROUTE_NODES.map(() => -1)
  const done = new Set<number>()
  cost[start] = 0
  while (done.size < ROUTE_NODES.length) {
    let next = -1
    for (let i = 0; i < ROUTE_NODES.length; i += 1) if (!done.has(i) && (next < 0 || cost[i] < cost[next])) next = i
    if (next < 0 || cost[next] === Infinity) break
    done.add(next)
    for (const [a, b] of ROUTE_EDGES) {
      const other = a === next ? b : b === next ? a : -1
      if (other < 0) continue
      const step = cost[next] + Math.hypot(ROUTE_NODES[a].x - ROUTE_NODES[b].x, ROUTE_NODES[a].y - ROUTE_NODES[b].y)
      if (step < cost[other]) { cost[other] = step; previous[other] = next }
    }
  }
  const path: DrivePoint[] = []
  for (let at = goal; at >= 0; at = previous[at]) path.unshift(ROUTE_NODES[at])
  return [{ x: from.x, y: from.y }, ...path]
}

/**
 * Paths people walk: along the front of the building and inside the fence,
 * round the plaza, the courtyard and the pond, both sidewalks of the street
 * and over the crossing, the pitch (running), the bike park aisle and behind
 * the building.
 */
export type WalkPath = { points: readonly DrivePoint[]; loop: boolean; walkers: number; speed: number }
const rect = (minX: number, minY: number, maxX: number, maxY: number): DrivePoint[] => [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]
export const WALK_PATHS: readonly WalkPath[] = [
  { points: [{ x: -78, y: -41.1 }, { x: 78, y: -41.1 }], loop: false, walkers: 8, speed: 1.25 },
  { points: [{ x: -88, y: -61.1 }, { x: 88, y: -61.1 }], loop: false, walkers: 5, speed: 1.2 },
  { points: rect(-24, -17, 24, 16), loop: true, walkers: 10, speed: 1.1 },
  { points: rect(-62.4, -22.6, 62.4, 22.6), loop: true, walkers: 7, speed: 1.2 },
  { points: rect(POND.minX - 2, POND.minY - 2.4, POND.maxX + 2, POND.maxY + 2.4), loop: true, walkers: 4, speed: 0.9 },
  { points: [{ x: -170, y: -63.4 }, { x: 170, y: -63.4 }], loop: false, walkers: 8, speed: 1.3 },
  { points: [{ x: -170, y: -95.2 }, { x: 170, y: -95.2 }], loop: false, walkers: 6, speed: 1.3 },
  { points: [{ x: 2.2, y: -96 }, { x: 2.2, y: -64 }], loop: false, walkers: 2, speed: 1.2 },
  { points: rect(PITCH.minX + 4, PITCH.minY + 3, PITCH.maxX - 4, PITCH.maxY - 3), loop: true, walkers: 8, speed: 2.6 },
  { points: [{ x: -124, y: 0.6 }, { x: -97, y: 0.6 }], loop: false, walkers: 3, speed: 1.1 },
  { points: [{ x: -84, y: 54.5 }, { x: 84, y: 54.5 }], loop: false, walkers: 3, speed: 1.2 },
]
/** Small groups standing and chatting. */
export const IDLE_GROUPS: readonly (readonly [number, number, number])[] = [
  [-12, -12, 3], [15, -10, 4], [12, 13, 3], [-18, 4, 2], [-30, -41.5, 3], [42, -41.5, 2], [-3, -64.5, 2], [96, 19.5, 3], [-3, -24, 2],
  // The guard by the booth at the gate.
  [GUARD.x - 0.8, GUARD.y, 1],
]

/** Lanes of street D1 the cars drive (westbound on the campus side, eastbound beyond the median) and how far past the site they turn round, m. */
export const CAR_LANES = [
  { y: -69.6, dir: -1 }, { y: -73.6, dir: -1 },
  { y: -86.4, dir: 1 }, { y: -90.4, dir: 1 },
] as const
export const CAR_SPAN = 175
