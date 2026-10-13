import { BufferGeometry, Float32BufferAttribute } from 'three'
import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM } from './patrol-demo'
import { mapToScenePose } from './map-config'
import type { Point } from './patrol-routing'

// The V3 floor finish rises 55 mm above the structural slab. Keep markings
// above that finish, rather than sinking them into the decorative floor mesh.
export const ROUTE_SURFACE_WIDTH = 0.1 * PATROL_MODEL_SCALE
export const ROUTE_SURFACE_Y = PATROL_FLOOR_Y + 0.075 * PATROL_MODEL_SCALE

/** Flat strips retain the motion path and distance along it for flowing dashes. */
export function createRouteSurface(points: Point[]) {
  const positions: number[] = [], centers: number[] = [], uvs: number[] = [], indices: number[] = []
  const scenePoints = points.map(point => mapToScenePose({ ...point, yaw: 0 }, PATROL_TRANSFORM).position)
  let travelled = 0
  for (let i = 1; i < scenePoints.length; i++) {
    const a = scenePoints[i - 1], b = scenePoints[i]
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz)
    if (length < 1e-7) continue
    const nx = -dz / length * ROUTE_SURFACE_WIDTH / 2, nz = dx / length * ROUTE_SURFACE_WIDTH / 2
    const start = positions.length / 3
    positions.push(
      a[0] + nx, ROUTE_SURFACE_Y, a[2] + nz,
      a[0] - nx, ROUTE_SURFACE_Y, a[2] - nz,
      b[0] + nx, ROUTE_SURFACE_Y, b[2] + nz,
      b[0] - nx, ROUTE_SURFACE_Y, b[2] - nz,
    )
    for (const point of [a, a, b, b]) centers.push(point[0], ROUTE_SURFACE_Y, point[2])
    uvs.push(travelled, 1, travelled, 0, travelled + length, 1, travelled + length, 0)
    indices.push(start, start + 2, start + 1, start + 2, start + 3, start + 1)
    travelled += length
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('routeCenter', new Float32BufferAttribute(centers, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
