/**
 * The 2D drawing of the robot on the "Bên trong robot" page: a three-quarter
 * view from the robot's front and its +X side, a little above it, like an
 * isometric drawing. Model units are metres, the same frame as the 3D model
 * (`robot-explode/parts.ts`): origin on the floor under the middle of the
 * robot, +Y up, +Z the front.
 *
 * The column between the body and the head is drawn shorter than it is
 * (above `COLUMN_FROM` heights are scaled by `COLUMN_SCALE`), so the head
 * and the electronics bay fit one screen without the bay getting small.
 */
export type Point3 = readonly [number, number, number]
export type Point2 = readonly [number, number]

/** A box along the model axes: its lowest corner and its highest. */
export type Box3 = { min: Point3; max: Point3 }

/** Turn of the view round the vertical axis, rad: 0 looks straight at the front. */
const AZIMUTH = 0.74
/** How much a step towards the viewer moves down the drawing (the camera's height). */
const ELEVATION = 0.46
/** Drawing units per metre. */
export const SCALE = 560
export const COLUMN_FROM = 0.5
export const COLUMN_SCALE = 0.55

const COS = Math.cos(AZIMUTH)
const SIN = Math.sin(AZIMUTH)

/** The height as drawn: the column is shortened. */
export function drawnHeight(y: number): number {
  return y <= COLUMN_FROM ? y : COLUMN_FROM + (y - COLUMN_FROM) * COLUMN_SCALE
}

/** How near a point is to the viewer; larger is nearer (drawn later). */
export function nearness([x, y, z]: Point3): number {
  return x * SIN + z * COS + y * 0.25
}

/** A model point on the drawing (SVG units, y down). */
export function project([x, y, z]: Point3): Point2 {
  return [(x * COS - z * SIN) * SCALE, (-drawnHeight(y) + (x * SIN + z * COS) * ELEVATION) * SCALE]
}

const fmt = (value: number) => (Math.round(value * 10) / 10).toString()

/** An SVG `points` attribute for a closed polygon. */
export function polygonPoints(points: readonly Point2[]): string {
  return points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')
}

export type BoxFaces = { top: string; front: string; side: string }

/**
 * The three faces of a box the viewer sees: its top, its front (+Z) and its
 * +X side, as polygon points.
 */
export function boxFaces({ min, max }: Box3): BoxFaces {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const p = (x: number, y: number, z: number) => project([x, y, z])
  return {
    top: polygonPoints([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)]),
    front: polygonPoints([p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)]),
    side: polygonPoints([p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0)]),
  }
}

/** The twelve edges of a box as one SVG path (for outlines of the casing). */
export function boxEdges({ min, max }: Box3): string {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const corners: Point3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ]
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  return edges.map(([a, b]) => {
    const [ax, ay] = project(corners[a])
    const [bx, by] = project(corners[b])
    return `M${fmt(ax)} ${fmt(ay)}L${fmt(bx)} ${fmt(by)}`
  }).join('')
}

/** The middle of a box's top face on the drawing, where its number sits. */
export function boxTop({ min, max }: Box3): Point2 {
  return project([(min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2])
}

/** A circle in the model (a wheel, a LiDAR, the column), as a closed SVG path. */
export function circlePath(centre: Point3, radius: number, axis: 'x' | 'y' | 'z', segments = 36): string {
  const points: Point2[] = []
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    const a = Math.cos(angle) * radius
    const b = Math.sin(angle) * radius
    const [cx, cy, cz] = centre
    points.push(project(axis === 'x' ? [cx, cy + a, cz + b] : axis === 'y' ? [cx + a, cy, cz + b] : [cx + a, cy + b, cz]))
  }
  return `M${points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`
}

/**
 * The outline of an upright cylinder (the column, the LiDAR): its two end
 * circles and the two lines that join them at the sides of the drawing.
 */
export function cylinderPath(centre: readonly [number, number], radius: number, from: number, to: number): string {
  const [cx, cz] = centre
  // The drawing's x grows along (cos, -sin) in the model's X/Z plane: the outline's sides lie that way.
  const side = (sign: number): [Point2, Point2] => [
    project([cx + sign * radius * COS, from, cz - sign * radius * SIN]),
    project([cx + sign * radius * COS, to, cz - sign * radius * SIN]),
  ]
  const [l0, l1] = side(-1)
  const [r0, r1] = side(1)
  return circlePath([cx, from, cz], radius, 'y') + circlePath([cx, to, cz], radius, 'y')
    + `M${fmt(l0[0])} ${fmt(l0[1])}L${fmt(l1[0])} ${fmt(l1[1])}M${fmt(r0[0])} ${fmt(r0[1])}L${fmt(r1[0])} ${fmt(r1[1])}`
}

/**
 * A wire through model waypoints as an SVG path, its corners rounded by up
 * to `radius` drawing units so it reads as a cable, not a chart line.
 */
export function wirePath(route: readonly (Point3 | Point2)[], radius = 9): string {
  const points = route.map(point => (point.length === 3 ? project(point) : point))
  if (points.length < 2) return ''
  let d = `M${fmt(points[0][0])} ${fmt(points[0][1])}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const [px, py] = points[index - 1]
    const [cx, cy] = points[index]
    const [nx, ny] = points[index + 1]
    const inLength = Math.hypot(cx - px, cy - py)
    const outLength = Math.hypot(nx - cx, ny - cy)
    const r = Math.min(radius, inLength / 2, outLength / 2)
    if (r < 0.5) {
      d += `L${fmt(cx)} ${fmt(cy)}`
      continue
    }
    const ax = cx - ((cx - px) / inLength) * r
    const ay = cy - ((cy - py) / inLength) * r
    const bx = cx + ((nx - cx) / outLength) * r
    const by = cy + ((ny - cy) / outLength) * r
    d += `L${fmt(ax)} ${fmt(ay)}Q${fmt(cx)} ${fmt(cy)} ${fmt(bx)} ${fmt(by)}`
  }
  const [lx, ly] = points[points.length - 1]
  return `${d}L${fmt(lx)} ${fmt(ly)}`
}

/** Length of a route on the drawing (for the pace of the current running along it). */
export function routeLength(route: readonly (Point3 | Point2)[]): number {
  const points = route.map(point => (point.length === 3 ? project(point) : point))
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1])
  }
  return total
}
