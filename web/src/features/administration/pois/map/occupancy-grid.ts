export type GridGeometry = {
  width: number
  height: number
  resolution: number
  origin: readonly [number, number, number]
}

export type ImagePoint = { u: number; v: number }
export type RosPoint = { x: number; y: number }
export type RosPose = RosPoint & { yaw: number }
export type CellState = 'free' | 'occupied' | 'unknown' | 'outside' | 'unavailable'

/** Image edge coordinates are continuous; cell centers are (column+.5, row+.5). */
export function imageToRos(grid: GridGeometry, point: ImagePoint): RosPoint {
  const [ox, oy, angle] = grid.origin
  const a = point.u * grid.resolution
  const b = (grid.height - point.v) * grid.resolution
  return { x: ox + Math.cos(angle) * a - Math.sin(angle) * b, y: oy + Math.sin(angle) * a + Math.cos(angle) * b }
}

export function rosToImage(grid: GridGeometry, point: RosPoint): ImagePoint {
  const [ox, oy, angle] = grid.origin
  const dx = point.x - ox
  const dy = point.y - oy
  return {
    u: (Math.cos(angle) * dx + Math.sin(angle) * dy) / grid.resolution,
    v: grid.height - (-Math.sin(angle) * dx + Math.cos(angle) * dy) / grid.resolution,
  }
}

export function cellAtPose(grid: GridGeometry, point: RosPoint): { column: number; row: number } | null {
  const pixel = rosToImage(grid, point)
  // Remove floating-point noise at exact cell edges, especially the outer bounds.
  const edge = (value: number) => Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value
  const gridX = edge(pixel.u)
  const gridY = edge(grid.height - pixel.v)
  if (!Number.isFinite(gridX) || !Number.isFinite(gridY) ||
      gridX < 0 || gridX >= grid.width || gridY < 0 || gridY >= grid.height) return null
  return { column: Math.floor(gridX), row: grid.height - 1 - Math.floor(gridY) }
}

export function normalizeYaw(yaw: number): number {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw))
}

export function headingFromPoints(from: RosPoint, to: RosPoint): number | null {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-9) return null
  return normalizeYaw(Math.atan2(to.y - from.y, to.x - from.x))
}

export function quantizePosition(point: RosPoint): RosPoint {
  return { x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)) }
}

export function quantizeYaw(yaw: number): number {
  return Number(normalizeYaw(yaw).toFixed(6))
}

/** Invert the actual SVG screen CTM, including viewBox letterboxing and pan/zoom. */
export function screenToImage(matrix: Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'> | null, x: number, y: number): ImagePoint | null {
  if (!matrix) return null
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null
  const dx = x - matrix.e
  const dy = y - matrix.f
  return { u: (matrix.d * dx - matrix.c * dy) / determinant, v: (-matrix.b * dx + matrix.a * dy) / determinant }
}

export function sampleCell(grid: GridGeometry, pixels: Uint8ClampedArray | null, point: RosPoint): CellState {
  const cell = cellAtPose(grid, point)
  if (!cell) return 'outside'
  if (!pixels || pixels.length !== grid.width * grid.height * 4) return 'unavailable'
  const offset = (cell.row * grid.width + cell.column) * 4
  const value = pixels[offset]
  if (pixels[offset + 3] !== 255 || pixels[offset + 1] !== value || pixels[offset + 2] !== value) return 'unavailable'
  return value === 0 ? 'occupied' : value === 255 ? 'free' : value === 128 ? 'unknown' : 'unavailable'
}
