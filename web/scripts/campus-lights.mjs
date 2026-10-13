const roomSpacing = 6
const corridorSpacing = 7
const centreClearance = 1.1
const fixtureClearance = 0.2
const epsilon = 1e-6

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const insideTriangle = (p, triangle) => {
  const sides = triangle.map((a, i) => cross(a, triangle[(i + 1) % 3], p))
  return Math.abs(cross(...triangle)) > epsilon && (sides.every(v => v >= -epsilon) || sides.every(v => v <= epsilon))
}
const insideFloor = (p, triangles) => triangles.some(triangle => insideTriangle(p, triangle))

function distanceToEdge(point, { a, b }) {
  const dx = b[0] - a[0], dz = b[1] - a[1], lengthSquared = dx * dx + dz * dz
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared)) : 0
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz)
}

function insidePolygon(point, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

function boundaryEdges(triangles) {
  const edges = new Map()
  const pointKey = point => point.map(value => value.toFixed(4)).join(',')
  for (const triangle of triangles) {
    if (Math.abs(cross(...triangle)) <= epsilon) continue
    for (let i = 0; i < 3; i++) {
      const a = triangle[i], b = triangle[(i + 1) % 3]
      const key = [pointKey(a), pointKey(b)].sort().join(';')
      if (!edges.has(key)) edges.set(key, { a, b })
    }
  }
  // A floor can have T-junctions or duplicated faces. Only exposed edges are
  // boundaries; triangulation diagonals must not divide an otherwise open room.
  return [...edges.values()].filter(edge => {
    const { a, b } = edge, length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const normal = [-(b[1] - a[1]) / length * 0.005, (b[0] - a[0]) / length * 0.005]
    return !(insideFloor(midpoint.map((v, i) => v + normal[i]), triangles) && insideFloor(midpoint.map((v, i) => v - normal[i]), triangles))
  })
}

function roomFrame(triangles) {
  const points = [...new Map(triangles.flat().map(p => [p.join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (points.length < 3) return null
  const halfHull = vertices => {
    const hull = []
    for (const point of vertices) {
      while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= epsilon) hull.pop()
      hull.push(point)
    }
    return hull
  }
  const hull = [...halfHull(points).slice(0, -1), ...halfHull([...points].reverse()).slice(0, -1)]
  let best
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    let axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    const bounds = vector => {
      const projected = points.map(p => p[0] * vector[0] + p[1] * vector[1])
      return [Math.min(...projected), Math.max(...projected)]
    }
    let u = bounds(axis), v = bounds([-axis[1], axis[0]])
    if (u[1] - u[0] < v[1] - v[0]) { axis = [-axis[1], axis[0]]; u = bounds(axis); v = bounds([-axis[1], axis[0]]) }
    if (axis[0] < -epsilon || Math.abs(axis[0]) <= epsilon && axis[1] < 0) { axis = axis.map(value => -value); u = bounds(axis); v = bounds([-axis[1], axis[0]]) }
    const area = (u[1] - u[0]) * (v[1] - v[0])
    if (!best || area < best.area - epsilon) best = { axis, u, v, area }
  }
  return best
}

function gridAxis([min, max], step = roomSpacing) {
  const count = Math.max(1, Math.floor((max - min - 2 * centreClearance) / step) + 1)
  return Array.from({ length: count }, (_, i) => (min + max) / 2 + (i - (count - 1) / 2) * step)
}

function footprint(point, angle) {
  const cosine = Math.cos(angle), sine = Math.sin(angle)
  return [[-0.9, -0.14], [-0.9, 0.14], [0.9, -0.14], [0.9, 0.14]].map(([x, z]) => [point[0] + x * cosine + z * sine, point[1] - x * sine + z * cosine])
}

/** Display-only ceiling fixtures fitted to floor geometry, independent of robot POIs. */
export function buildLampLayout({ rooms = [], corridorFloors = [], walls = [], atrium = [], corridorContains = () => true, corridorRuns = [] }) {
  const fixtures = []
  const atriumEdges = atrium.map((a, i) => ({ a, b: atrium[(i + 1) % atrium.length] }))
  const clear = (point, angle, floor, edges, excluded = () => false) => {
    if (!insideFloor(point, floor) || excluded(point)) return false
    if ([...edges, ...walls, ...atriumEdges].some(edge => distanceToEdge(point, edge) < centreClearance - epsilon)) return false
    return footprint(point, angle).every(corner => insideFloor(corner, floor) && !excluded(corner)
      && [...edges, ...walls, ...atriumEdges].every(edge => distanceToEdge(corner, edge) >= fixtureClearance - epsilon))
  }
  for (const room of rooms) {
    if (room.furnished === false || room.lightCount === 0) continue
    const frame = roomFrame(room.triangles)
    if (!frame) continue
    const { axis, u, v } = frame, angle = -Math.atan2(axis[1], axis[0]), edges = boundaryEdges(room.triangles)
    const centreU = (u[0] + u[1]) / 2, centreV = (v[0] + v[1]) / 2
    const gap = Math.min(roomSpacing, (u[1] - u[0] - 2 * centreClearance) / 2)
    const targetU = [centreU - gap / 2, centreU + gap / 2], candidates = []
    const uSamples = [...new Set([...gridAxis(u, 0.6), centreU, ...targetU])].sort((a, b) => a - b)
    const vSamples = [...new Set([...gridAxis(v, 0.6), centreV])].sort((a, b) => a - b)
    // Fit two balanced lamps along the room's long axis. Dense candidate samples
    // let angled rooms keep both lamps without placing a housing over a wall.
    for (const localU of uSamples) for (const localV of vSamples) {
      const point = [localU * axis[0] - localV * axis[1], localU * axis[1] + localV * axis[0]]
      if (clear(point, angle, room.triangles, edges, p => insidePolygon(p, atrium))) candidates.push({ point, localU, localV })
    }
    let bestPair, bestScore = Infinity
    for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j]
      if (b.localU - a.localU < 2.2 - epsilon || Math.abs(a.localV - b.localV) > epsilon) continue
      const score = (a.localU - targetU[0]) ** 2 + (b.localU - targetU[1]) ** 2
        + (a.localV - centreV) ** 2 + (b.localV - centreV) ** 2 + 2 * (a.localV - b.localV) ** 2
      if (score < bestScore) { bestScore = score; bestPair = [a, b] }
    }
    const fitted = bestPair ?? candidates.sort((a, b) =>
      (a.localU - centreU) ** 2 + (a.localV - centreV) ** 2 - (b.localU - centreU) ** 2 - (b.localV - centreV) ** 2).slice(0, 1)
    fixtures.push(...fitted.map(({ point }) => ({ point, angle, zone: `room:${room.name}` })))
  }
  const frame = roomFrame(corridorFloors)
  if (frame) {
    const points = corridorFloors.flat(), bounds = k => [Math.min(...points.map(p => p[k])), Math.max(...points.map(p => p[k]))]
    const edges = boundaryEdges(corridorFloors)
    const excluded = point => !corridorContains(point) || insidePolygon(point, atrium) || rooms.some(room => insideFloor(point, room.triangles))
    if (corridorRuns.length) {
      const corridorFixtures = []
      for (const { id, a, b } of corridorRuns) {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (length <= 2 * centreClearance) continue
        const axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length], angle = -Math.atan2(axis[1], axis[0])
        let fitted = [], bestBalance = Infinity
        // Move the whole row along its axis to clear columns. Every fixture
        // retains the same transverse position and the same 7 m rhythm.
        for (const phase of [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 3]) {
          const candidate = []
          for (const distance of gridAxis([0, length], corridorSpacing).map(v => v + phase)) {
            if (distance < centreClearance || distance > length - centreClearance) continue
            const point = a.map((v, i) => v + distance * axis[i])
            if (clear(point, angle, corridorFloors, edges, excluded)
              && corridorFixtures.every(lamp => Math.hypot(point[0] - lamp.point[0], point[1] - lamp.point[1]) >= corridorSpacing - epsilon)) {
              candidate.push({ point, angle, zone: 'corridor', row: id, distance })
            }
          }
          const balance = candidate.length ? Math.abs(candidate.reduce((sum, lamp) => sum + lamp.distance, 0) / candidate.length - length / 2) : Infinity
          if (candidate.length > fitted.length || candidate.length === fitted.length && balance < bestBalance - epsilon) {
            fitted = candidate; bestBalance = balance
          }
        }
        corridorFixtures.push(...fitted.map(lamp => ({ point: lamp.point, angle: lamp.angle, zone: lamp.zone, row: lamp.row })))
      }
      fixtures.push(...corridorFixtures)
      return fixtures
    }
    const candidates = [], longWalls = walls.filter(edge => Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]) > 2)
    // Sample more densely than the final spacing so narrow diagonal corridors
    // receive fixtures even when they pass between the rows of a coarse grid.
    for (const x of gridAxis(bounds(0), 1.5)) for (const z of gridAxis(bounds(1), 1.5)) {
      const point = [x, z]
      const closestWall = longWalls.reduce((closest, edge) => !closest || distanceToEdge(point, edge) < distanceToEdge(point, closest) ? edge : closest, null)
      const angle = closestWall ? -Math.atan2(closestWall.b[1] - closestWall.a[1], closestWall.b[0] - closestWall.a[0]) : 0
      if (clear(point, angle, corridorFloors, edges, excluded)) candidates.push({ point, angle })
    }
    const corridorFixtures = []
    for (const { point, angle } of candidates) if (corridorFixtures.every(fixture => Math.hypot(point[0] - fixture.point[0], point[1] - fixture.point[1]) >= corridorSpacing)) {
      const fixture = { point, angle, zone: 'corridor' }
      corridorFixtures.push(fixture); fixtures.push(fixture)
    }
  }
  return fixtures
}
