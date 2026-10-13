import { Children, isValidElement, type MemoExoticComponent, type ReactElement, type ReactNode } from 'react'
import { expect, it } from 'vitest'
import { ConeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from 'three'
import { CampusLighting } from './CampusLighting'
import { PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TRANSFORM } from './patrol-demo'
import { mapToScenePose } from './map-config'
import nav from './patrol-nav.json'

type LightingChild = {
  children?: ReactNode
  name?: string
  point?: number[]
  args?: [unknown, unknown, number]
  ref?: (mesh: InstancedMesh) => void
}

function lightingChildren() {
  const render = (CampusLighting as MemoExoticComponent<() => ReactElement<{ children: ReactNode }>>).type
  return Children.toArray(render().props.children).filter(isValidElement<LightingChild>)
}

it('keeps six live lights spread across corridor fixtures rather than using robot points', () => {
  const lights = lightingChildren().filter(child => child.props.point).map(child => child.props.point!)
  expect(lights).toHaveLength(6)
  for (const point of lights) expect(nav.lampZones[nav.lamps.indexOf(point)]).toBe('corridor')
  const corridorPoints = nav.lamps.filter((_, index) => nav.lampZones[index] === 'corridor')
  const corridorSpan = Math.max(...corridorPoints.map(point => point[0])) - Math.min(...corridorPoints.map(point => point[0]))
  const lightSpan = Math.max(...lights.map(point => point[0])) - Math.min(...lights.map(point => point[0]))
  expect(lightSpan).toBeGreaterThan(corridorSpan * 0.8)
  for (let index = 0; index < lights.length; index++) {
    for (const other of lights.slice(index + 1)) {
      expect(Math.hypot(lights[index][0] - other[0], lights[index][1] - other[1])).toBeGreaterThan(6)
    }
  }
})

it('places a beam and floor glow at every authored fixture in two batches', () => {
  const batches = lightingChildren().filter(child => child.props.name?.startsWith('downlight-'))
  expect(batches.map(child => child.props.name)).toEqual(['downlight-beam', 'downlight-floor-glow'])
  for (const batch of batches) {
    const { args, ref } = batch.props
    if (!args || !ref) throw new Error('Fixture batches need an instance count and matrix initializer')
    expect(args[2]).toBe(nav.lamps.length)
    const geometry = new ConeGeometry(1, 1), material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, args[2])
    ref(mesh)
    const cone = Children.toArray(batch.props.children).filter(isValidElement<{ args: number[] }>).find(child => child.type === 'coneGeometry')
    nav.lamps.forEach((point, index) => {
      const matrix = new Matrix4()
      mesh.getMatrixAt(index, matrix)
      const position = new Vector3().setFromMatrixPosition(matrix)
      const { position: [x, , z] } = mapToScenePose({ x: point[0], y: point[1], yaw: 0 }, PATROL_TRANSFORM)
      expect(position.x).toBeCloseTo(x, 5)
      expect(position.z).toBeCloseTo(z, 5)
      const beamOffset = batch.props.name === 'downlight-beam' ? (nav.lampHeight - 0.0225 - 0.065) / 2 : 0
      expect(position.y).toBeCloseTo(PATROL_FLOOR_Y + (0.065 + beamOffset) * PATROL_MODEL_SCALE, 5)
      if (cone) {
        expect(position.y + cone.props.args[1] / 2).toBeCloseTo(PATROL_FLOOR_Y + (nav.lampHeight - 0.0225) * PATROL_MODEL_SCALE, 5)
        expect(position.y - cone.props.args[1] / 2).toBeCloseTo(PATROL_FLOOR_Y + 0.065 * PATROL_MODEL_SCALE, 5)
      }
      if (!beamOffset) {
        const normal = new Vector3(0, 0, 1).transformDirection(matrix)
        expect(normal.y).toBeCloseTo(1)
      }
    })
    expect(mesh.boundingSphere?.radius).toBeGreaterThan(0)
    geometry.dispose()
    material.dispose()
    mesh.dispose()
  }
})
