/**
 * The campus building, as a top-down floor plan.
 *
 * Where this came from, stated plainly: it is traced by eye from the isometric
 * model render, so the topology is right — an eight-sided floor plate, a band of
 * rooms around the perimeter, a central atrium ringed with columns, and one
 * large open hall in the south-west corner — while the exact dimensions are
 * approximate. It is a schematic of that building, not a survey of it.
 *
 * It is DATA, not drawing code, for one reason: when the real model or a DWG
 * export is available, replacing the numbers below makes the map correct, and
 * no component has to change. `CampusMap` renders whatever is in here.
 *
 * Everything lives in the same 0-100 space the visitor API already speaks for
 * `mapX`/`mapY`, so a location's coordinates and this plan are in one system and
 * a marker cannot land in a different building than its room.
 */

export type Point = { x: number; y: number }

export type Room = {
  id: string
  /** Printed on the plan when the room is large enough to carry it. */
  label?: string
  points: Point[]
}

const p = (x: number, y: number): Point => ({ x, y })

/** The outer wall of the floor plate. */
export const OUTLINE: Point[] = [
  p(22, 4),
  p(74, 4),
  p(95, 25),
  p(95, 70),
  p(66, 95),
  p(28, 95),
  p(5, 66),
  p(5, 25),
]

/**
 * The atrium: the open void at the centre of the plate, which is the white
 * area in the render. Nothing routes through it, so it is drawn as a hole.
 */
export const ATRIUM: Point[] = [
  p(38, 26),
  p(66, 24),
  p(74, 38),
  p(70, 56),
  p(46, 60),
  p(34, 44),
]

/**
 * The column ring around the atrium. In the render these are the cylinders
 * standing between the atrium edge and the circulation ring.
 */
export const COLUMNS: Point[] = [
  p(36, 24), p(45, 21), p(54, 20), p(63, 20), p(71, 26),
  p(76, 34), p(77, 44), p(74, 53), p(68, 60), p(59, 63),
  p(50, 64), p(41, 60), p(34, 53), p(31, 43), p(32, 33),
]

/**
 * Perimeter rooms. The band that wraps the plate: teaching rooms along the
 * north edge, laboratories and offices down the east, services along the south,
 * and student-facing desks on the west.
 */
export const ROOMS: Room[] = [
  // North band
  { id: 'n1', points: [p(22, 4), p(35, 4), p(35, 18), p(22, 18)] },
  { id: 'n2', label: 'Library', points: [p(35, 4), p(48, 4), p(48, 18), p(35, 18)] },
  { id: 'n3', points: [p(48, 4), p(61, 4), p(61, 18), p(48, 18)] },
  { id: 'n4', label: 'Hall A1', points: [p(61, 4), p(74, 4), p(78, 8), p(78, 18), p(61, 18)] },

  // East band
  { id: 'e1', points: [p(81, 18), p(89, 18), p(95, 25), p(95, 32), p(81, 32)] },
  { id: 'e2', label: 'Labs', points: [p(81, 32), p(95, 32), p(95, 46), p(81, 46)] },
  { id: 'e3', points: [p(81, 46), p(95, 46), p(95, 60), p(81, 60)] },
  { id: 'e4', points: [p(81, 60), p(95, 60), p(95, 70), p(87, 77), p(81, 77)] },

  // South band
  { id: 's1', label: 'Canteen', points: [p(40, 81), p(54, 81), p(54, 95), p(40, 95)] },
  { id: 's2', points: [p(54, 81), p(68, 81), p(68, 95), p(54, 95)] },
  { id: 's3', points: [p(68, 81), p(79, 81), p(79, 86), p(70, 95), p(68, 95)] },

  // West band
  { id: 'w1', label: 'Services', points: [p(5, 25), p(19, 25), p(19, 38), p(5, 38)] },
  { id: 'w2', points: [p(5, 38), p(19, 38), p(19, 50), p(5, 50)] },
]

/**
 * The open hall in the south-west corner — the double-height space with the
 * curved floor markings in the render. Drawn as one room rather than subdivided,
 * because that is what it is.
 */
export const HALL: Room = {
  id: 'hall',
  label: 'Main hall',
  points: [p(5, 53), p(30, 53), p(30, 78), p(26, 95), p(16, 88), p(5, 66)],
}

/** The curved floor markings inside the hall, kept purely as plan character. */
export const HALL_CURVES: string[] = [
  'M8 86 Q17 70 29 62',
  'M10 90 Q20 76 30 70',
]

/**
 * The circulation ring: the walkable loop between the atrium columns and the
 * perimeter rooms. This is the corridor a robot actually travels, and it is the
 * shape a future route-planner would snap a path onto.
 */
export const CORRIDOR: Point[] = [
  p(28, 22),
  p(52, 15),
  p(76, 20),
  p(85, 40),
  p(84, 62),
  p(66, 78),
  p(44, 78),
  p(28, 66),
  p(24, 42),
]

/** Closes a polygon into an SVG `points` string. */
export function toPoints(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

/** The centre of a polygon, for placing a room label. */
export function centroid(points: Point[]): Point {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
