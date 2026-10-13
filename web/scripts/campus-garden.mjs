import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three'
import { subtractBoxes } from './campus-geometry.mjs'

// Survey-model X/Z coordinates: three marked sides only; preserve the outside railing.
export const gardenGlassRun = [[-2.58, -65.49], [21.72, -68.49], [26.28, -31.55], [1.95, -28.86]]
export const gardenWallTop = 1.95
export const gardenFrame = { origin: [-2.575, -65.4076], angle: 0.12327, width: 24.3, depth: 36.7, floorY: 1 }

// Trace the supplied 578 x 373 plan into the rotated garden frame. Drawing X
// follows the long side (V); the drawing's top edge faces the atrium (high U).
const planPoint = ([x, y]) => [gardenFrame.width - 0.8 - (y - 37) / 316 * 22.7, 0.8 + (x - 40) / 510 * 35.1]
const entryEdge = gardenGlassRun[1], entryEnd = gardenGlassRun[2]
const edgeLength = Math.hypot(entryEnd[0] - entryEdge[0], entryEnd[1] - entryEdge[1])
const axis = [(entryEnd[0] - entryEdge[0]) / edgeLength, (entryEnd[1] - entryEdge[1]) / edgeLength]
const entryCentre = [entryEnd[0] - axis[0] * 5.8, entryEnd[1] - axis[1] * 5.8]
const delta = entryCentre.map((v, i) => v - gardenFrame.origin[i]), c = Math.cos(gardenFrame.angle), s = Math.sin(gardenFrame.angle)
export const gardenEntry = { segment: 2, centre: entryCentre, axis, offset: edgeLength - 5.8, width: 2.4, sill: 1.08, head: 3.72, local: [c * delta[0] - s * delta[1], s * delta[0] + c * delta[1]] }
export const gardenPaths = [
  { a: [23, gardenEntry.local[1]], b: [1.6, 12.8], width: 2 },
  { a: [23, gardenEntry.local[1]], b: gardenEntry.local, width: 2 },
]
export const gardenPavingIslands = [
  [[40, 193], [132, 129], [217, 228], [151, 286], [112, 264], [40, 264]],
  [[193, 88], [260, 37], [425, 37], [276, 173]],
  [[459, 112], [550, 37], [550, 215]],
  [[550, 215], [550, 353], [345, 353], [267, 286], [340, 245], [329, 230], [459, 112]],
].map(polygon => polygon.map(planPoint))
export const gardenSeats = [
  { name: 'triangle far', polygon: [[83, 56], [166, 56], [83, 116]].map(planPoint) },
  { name: 'triangle near', polygon: [[84, 273], [168, 329], [84, 333]].map(planPoint) },
  { name: 'rectangle near', polygon: [[416, 261], [487, 242], [507, 311], [437, 329]].map(planPoint) },
]

export function gardenPoint(u, y, v) {
  const { origin, angle } = gardenFrame, c = Math.cos(angle), s = Math.sin(angle)
  return [origin[0] + c * u + s * v, gardenFrame.floorY + y, origin[1] - s * u + c * v]
}

export function pathDistance(point, path) {
  const dx = path.b[0] - path.a[0], dz = path.b[1] - path.a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - path.a[0]) * dx + (point[1] - path.a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(point[0] - path.a[0] - t * dx, point[1] - path.a[1] - t * dz)
}

export function buildCampusGarden({ box, sculpt, material }) {
  const stone = material('Garden graphite floor', [1, 1, 1])
  const paving = material('Garden inset paving', [1, 1, 1])
  const seatStone = material('Garden bench stone', [0.79, 0.78, 0.70])
  const seatTop = material('Garden inset seat stone', [0.58, 0.60, 0.55])
  const steel = material('Garden pergola steel', [0.095, 0.073, 0.055], 0.5)
  const seam = material('Garden paving joints', [0.32, 0.39, 0.42])
  const { angle, width, depth } = gardenFrame
  const gardenBox = (name, u, y, v, size, mat, rotation = 0) => box(`Garden ${name}`, gardenPoint(u, y, v), size, angle + rotation, mat)
  gardenBox('stone base', width / 2, 0.022, depth / 2, [width - 1.6, 0.026, depth - 1.6], stone)
  function polygonShape(points, height, clipPaths = false) {
    const shape = new Shape()
    points.forEach(([u, v], i) => i ? shape.lineTo(u, -v) : shape.moveTo(u, -v))
    shape.closePath()
    const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 })
    geometry.rotateX(-Math.PI / 2)
    if (clipPaths) {
      const cuts = gardenPaths.map(path => {
        const dx = path.b[0] - path.a[0], dv = path.b[1] - path.a[1], length = Math.hypot(dx, dv)
        return { centre: [(path.a[0] + path.b[0]) / 2, 0, (path.a[1] + path.b[1]) / 2], axis: [dx / length, dv / length], half: [length / 2 + 0.05, 1, path.width / 2] }
      })
      const position = [], normal = [], p = geometry.attributes.position, n = geometry.attributes.normal
      for (let i = 0; i < p.count; i += 3) {
        const triangle = [i, i + 1, i + 2].map(k => [p.getX(k), p.getY(k), p.getZ(k), n.getX(k), n.getY(k), n.getZ(k)])
        for (const clipped of subtractBoxes(triangle, cuts)) for (const vertex of clipped) { position.push(...vertex.slice(0, 3)); normal.push(...vertex.slice(3, 6)) }
      }
      const clipped = new BufferGeometry()
      clipped.setAttribute('position', new Float32BufferAttribute(position, 3)); clipped.setAttribute('normal', new Float32BufferAttribute(normal, 3))
      geometry.dispose()
      return clipped
    }
    return geometry
  }
  // Cut the lanes through the whole raised surface so their level is lower
  // continuously, including between the four angular areas of the plan.
  sculpt('Garden raised ground', polygonShape([[0.8, 0.8], [width - 0.8, 0.8], [width - 0.8, depth - 0.8], [0.8, depth - 0.8]], 0.04, true), gardenPoint(0, 0.035, 0), [1, 1, 1], angle, stone)
  // Four angular paved islands leave connected diagonal lanes as in the plan.
  // No trees, shrubs, flowers, grass or planting soil remain.
  for (const [i, polygon] of gardenPavingIslands.entries()) {
    sculpt(`Garden paving island ${i + 1}`, polygonShape(polygon, 0.006, true), gardenPoint(0, 0.075, 0), [1, 1, 1], angle, paving)
    for (let k = 0; k < polygon.length; k++) {
      const a = polygon[k], b = polygon[(k + 1) % polygon.length], dx = b[0] - a[0], dv = b[1] - a[1]
      const length = Math.hypot(dx, dv), steps = Math.ceil(length / 0.15)
      // Keep the drawn borders except where the marked entrance lane crosses them.
      let start = null
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, u = a[0] + t * dx, v = a[1] + t * dv
        const clear = step < steps && gardenPaths.every(path => pathDistance([u, v], path) > path.width / 2 + 0.04)
        if (clear && start === null) start = t
        if (!clear && start !== null) {
          const mid = (start + t) / 2
          gardenBox(`paving border ${i}-${k}-${step}`, a[0] + mid * dx, 0.082, a[1] + mid * dv, [length * (t - start), 0.004, 0.018], seam, -Math.atan2(dv, dx))
          start = null
        }
      }
    }
  }
  gardenBox('main entry threshold', 23.6, 0.068, gardenEntry.local[1], [1.7, 0.026, gardenEntry.width], stone)
  for (const seat of gardenSeats) {
    const centroid = seat.polygon.reduce((p, [u, v]) => [p[0] + u / seat.polygon.length, p[1] + v / seat.polygon.length], [0, 0])
    const inset = seat.polygon.map(([u, v]) => [centroid[0] + (u - centroid[0]) * 0.81, centroid[1] + (v - centroid[1]) * 0.81])
    sculpt(`Garden bench ${seat.name}`, polygonShape(seat.polygon, 0.44), gardenPoint(0, 0.10, 0), [1, 1, 1], angle, seatStone)
    sculpt(`Garden seat top ${seat.name}`, polygonShape(inset, 0.025), gardenPoint(0, 0.541, 0), [1, 1, 1], angle, seatTop)
  }
  // Six of the circled open steel frames now span the main diagonal walkway.
  const path = gardenPaths[0], dx = path.b[0] - path.a[0], dv = path.b[1] - path.a[1], length = Math.hypot(dx, dv)
  const du = dx / length, ddv = dv / length, direction = -Math.atan2(dv, dx), span = path.width + 0.17, portals = []
  for (const [i, t] of [0.08, 0.24, 0.40, 0.56, 0.72, 0.88].entries()) {
    const u = path.a[0] + t * dx, v = path.a[1] + t * dv
    portals.push({ centre: [u, v], path: 0, span })
    for (const side of [-1, 1]) gardenBox(`pergola post ${i}-${side}`, u - ddv * side * span / 2, 1.631, v + du * side * span / 2, [0.17, 3.1, 0.17], steel, direction)
    gardenBox(`pergola lintel ${i}`, u, 3.181, v, [0.20, 0.23, span + 0.16], steel, direction)
  }
  return { frame: gardenFrame, entry: gardenEntry, paths: gardenPaths, pavingIslands: gardenPavingIslands, seats: gardenSeats, portals }
}
