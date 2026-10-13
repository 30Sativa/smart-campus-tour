const epsilon = 1e-6
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
const insideTriangle = (point, triangle) => {
  const sides = triangle.map((a, i) => cross(a, triangle[(i + 1) % 3], point))
  return Math.abs(cross(...triangle)) > epsilon && (sides.every(value => value >= -epsilon) || sides.every(value => value <= epsilon))
}
function insidePolygon(point, polygon) {
  let inside = false
  for (let i = 0, previous = polygon.length - 1; i < polygon.length; previous = i++) {
    const a = polygon[i], b = polygon[previous]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
function segmentDistance(point, { a, b }) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz)
}
function spatial(items, vertices, margin = 0) {
  const bins = new Map()
  for (const item of items) {
    const points = vertices(item)
    const min = [0, 1].map(k => Math.floor((Math.min(...points.map(p => p[k])) - margin) / 3))
    const max = [0, 1].map(k => Math.floor((Math.max(...points.map(p => p[k])) + margin) / 3))
    for (let x = min[0]; x <= max[0]; x++) for (let z = min[1]; z <= max[1]; z++) {
      const key = `${x},${z}`
      if (!bins.has(key)) bins.set(key, [])
      bins.get(key).push(item)
    }
  }
  return point => bins.get(`${Math.floor(point[0] / 3)},${Math.floor(point[1] / 3)}`) ?? []
}

/** Keep only the connected circulation floor, sealing room doors before flood fill. */
export function buildCorridorMask({ triangles = [], walls = [], closedDoorEdges = [], atrium = [], seed, cellSize = 0.5, clearance = 0.3 }) {
  if (cellSize <= 0 || clearance <= cellSize / 2) throw new Error('Corridor clearance must exceed half the grid spacing to prevent crossing thin walls')
  if (!triangles.length) return () => false
  const floorAt = spatial(triangles, triangle => triangle)
  const wallsAt = spatial([...walls, ...closedDoorEdges], edge => [edge.a, edge.b], clearance)
  const valid = point => floorAt(point).some(triangle => insideTriangle(point, triangle))
    && !insidePolygon(point, atrium) && wallsAt(point).every(edge => segmentDistance(point, edge) > clearance)
  const points = triangles.flat(), min = [0, 1].map(k => Math.floor(Math.min(...points.map(p => p[k])) / cellSize) * cellSize)
  const max = [0, 1].map(k => Math.ceil(Math.max(...points.map(p => p[k])) / cellSize) * cellSize)
  const width = Math.round((max[0] - min[0]) / cellSize) + 1, height = Math.round((max[1] - min[1]) / cellSize) + 1
  const cells = new Uint8Array(width * height)
  const pointAt = (x, z) => [min[0] + x * cellSize, min[1] + z * cellSize]
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) if (valid(pointAt(x, z))) cells[z * width + x] = 1
  const cellAt = point => {
    const x = Math.round((point[0] - min[0]) / cellSize), z = Math.round((point[1] - min[1]) / cellSize)
    return x < 0 || x >= width || z < 0 || z >= height ? -1 : z * width + x
  }
  const start = seed && cellAt(seed)
  if (start === undefined || start < 0 || cells[start] !== 1) throw new Error('Corridor seed must lie on circulation floor clear of walls')
  const queue = [start]
  cells[start] = 2
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor], x = index % width, z = Math.floor(index / width)
    const neighbors = [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, z > 0 ? index - width : -1, z + 1 < height ? index + width : -1]
    for (const neighbor of neighbors) if (neighbor >= 0 && cells[neighbor] === 1) {
      cells[neighbor] = 2
      queue.push(neighbor)
    }
  }
  return point => {
    const index = cellAt(point)
    return index >= 0 && cells[index] === 2 && valid(point)
  }
}
