import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { readFileSync } from 'node:fs'
import { createRouteSurface, ROUTE_SURFACE_WIDTH, ROUTE_SURFACE_Y } from './fleet-route-surface'
import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM } from './patrol-demo'
import { mapToScenePose } from './map-config'

describe('routes painted on the campus floor', () => {
  it('keeps every corner on the floor and aligns the strip with the actual robot route', () => {
    const points = [{ x: 24, y: -74.25 }, { x: 26.25, y: -72 }]
    const geometry = createRouteSurface(points), positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
    expect(positions.count).toBe(4)
    expect(ROUTE_SURFACE_Y - PATROL_FLOOR_Y).toBeCloseTo(0.075 * PATROL_MODEL_SCALE)
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i)).toBeCloseTo(ROUTE_SURFACE_Y)
      expect(normals.getY(i)).toBeCloseTo(1)
    }
    for (let i = 0; i < points.length; i++) {
      const left = new Vector3().fromBufferAttribute(positions, i * 2), right = new Vector3().fromBufferAttribute(positions, i * 2 + 1)
      const center = left.clone().add(right).multiplyScalar(0.5)
      const expected = mapToScenePose({ ...points[i], yaw: 0 }, PATROL_TRANSFORM).position
      expect(center.x).toBeCloseTo(expected[0])
      expect(center.z).toBeCloseTo(expected[2])
      expect(left.distanceTo(right)).toBeCloseTo(ROUTE_SURFACE_WIDTH)
    }
    geometry.dispose()
  })
  it('preserves bends and accumulates dash distance toward the destination through a turn', () => {
    const geometry = createRouteSurface([{ x: 24, y: -74 }, { x: 26, y: -74 }, { x: 26, y: -71 }])
    const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv')
    expect(positions.count).toBe(8)
    expect(geometry.index?.count).toBe(12)
    expect(uv.getX(0)).toBe(0)
    expect(uv.getX(2)).toBeCloseTo(2 * PATROL_MODEL_SCALE)
    expect(uv.getX(4)).toBeCloseTo(uv.getX(2))
    expect(uv.getX(6)).toBeCloseTo(5 * PATROL_MODEL_SCALE)
    geometry.dispose()
  })
  it('does not generate invalid strips for empty routes or duplicate waypoints', () => {
    for (const points of [[], [{ x: 24, y: -74 }], [{ x: 24, y: -74 }, { x: 24, y: -74 }]]) {
      const geometry = createRouteSurface(points)
      expect(geometry.getAttribute('position').count).toBe(0)
      expect(geometry.index?.count).toBe(0)
      geometry.dispose()
    }
  })
  it('stays above the imported decorative floor finish rather than inside it', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    const floors = json.nodes.filter((n: { name: string }) => /^\d{3} floor finish$/.test(n.name))
    expect(floors).toHaveLength(17)
    for (const floor of floors) {
      const bounds = json.accessors[json.meshes[floor.mesh].primitives[0].attributes.POSITION]
      const finishY = PATROL_FLOOR_Y + bounds.max[1] * PATROL_MODEL_SCALE
      expect(ROUTE_SURFACE_Y).toBeGreaterThan(finishY)
      expect(ROUTE_SURFACE_Y - finishY).toBeLessThan(0.025 * PATROL_MODEL_SCALE)
    }
  })
})
