import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { FleetPathLine } from './FleetPaths'
import { PointCameras } from './PointCameras'
import { describe, expect, it } from 'vitest'
import TwinScene from './TwinScene'
import { PerspectiveCamera, Vector3 } from 'three'
import { mapToScenePose } from './map-config'
import { PATROL_TRANSFORM } from './patrol-demo'

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : [])
}

describe('patrol overlays', () => {
  it('opens the campus straight, with the garden at the bottom and the whole map inside desktop and mobile frames', () => {
    for (const overhead of [false, true]) {
      const scene = TwinScene({ robots: [], overhead, showLabels: false, modelKey: 'nvh-v3' })
      const controls = elements(scene).find(node => node.props.makeDefault)!
      expect(controls.props.target).toEqual([0, 0.6, 0])
      const target = new Vector3(...controls.props.target as [number, number, number])
      for (const [width, height] of [[1150, 610], [310, 450]]) {
        const camera = new PerspectiveCamera(42, width / height)
        scene.props.onCreated!({ camera, size: { width, height } } as Parameters<NonNullable<typeof scene.props.onCreated>>[0])
        camera.updateMatrixWorld()
        expect(camera.position.x).toBeLessThan(0)
        // The imported floor is rotated slightly: check the actual garden edge, not world axes.
        const edge = [[21.72, -68.49], [26.28, -31.55]].map(([x, y]) => {
          const position = mapToScenePose({ x, y, yaw: 0 }, PATROL_TRANSFORM).position
          return new Vector3(position[0], 0.6, position[2]).project(camera)
        })
        expect(Math.abs(edge[0].y - edge[1].y)).toBeLessThan(0.002)
        expect(camera.position.distanceTo(target)).toBeLessThan(controls.props.maxDistance as number)
        expect(target.clone().project(camera).x).toBeCloseTo(0)
        expect(target.clone().project(camera).y).toBeCloseTo(0)
        expect(new Vector3(-7.86, 0, 0).project(camera).y).toBeLessThan(0)
        for (const x of [-7.86, 7.86]) for (const y of [0, 1.21]) for (const z of [-10, 10]) {
          const point = new Vector3(x, y, z).project(camera)
          expect(Math.abs(point.x)).toBeLessThan(0.95)
          expect(Math.abs(point.y)).toBeLessThan(0.95)
        }
      }
    }
  })
  it('mounts selectable cameras independently of the point-marker toggle', () => {
    const onSelect = () => {}
    const hidden = elements(TwinScene({ robots: [], overhead: false, showLabels: false, syntheticPatrol: true }))
    expect(hidden.some(node => node.type === PointCameras)).toBe(false)
    const scene = elements(TwinScene({ robots: [], overhead: false, showLabels: false, syntheticPatrol: true, showCameras: true, cameraPoint: 4, onSelectCamera: onSelect }))
    expect(scene.find(node => node.type === PointCameras)?.props).toMatchObject({ selected: 4, onSelect })
    const cameras = elements(PointCameras({ selected: 4, onSelect }))
    expect(cameras.filter(node => node.type === 'button')).toHaveLength(10)
    expect(cameras.filter(node => node.props['aria-pressed'])).toHaveLength(1)
  })
  it('keeps the dashed route visible while mounting point markers only when enabled', () => {
    // Inspect the scene composition without a WebGL context; renderer QA runs in Chrome.
    const path = { id: 'R1', color: '#2563eb', points: [{ x: 24, y: -74 }, { x: 24, y: -73 }], active: true }
    const hidden = elements(TwinScene({ robots: [], overhead: false, showLabels: false, syntheticPatrol: true, patrolPaths: [path], seconds: 18 }))
    expect(hidden.filter(node => node.props.fixedLabel)).toHaveLength(0)
    const route = hidden.find(node => node.type === FleetPathLine)
    expect(route?.props.route).toMatchObject({ points: path.points, color: '#7dc7e8', active: true, dashed: true })
    expect(route?.props.seconds).toBe(18)
    expect(hidden.filter(node => node.props.name === 'robot-destination-ring')).toHaveLength(1)
    const visible = elements(TwinScene({ robots: [], overhead: false, showLabels: true, syntheticPatrol: true }))
    expect(visible.filter(node => node.props.fixedLabel).map(node => node.props.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  })
  it('switches left drag to pan and disables dragging while measuring', () => {
    const pan = elements(TwinScene({ robots: [], overhead: false, showLabels: false, tool: 'pan' }))
    const measure = elements(TwinScene({ robots: [], overhead: false, showLabels: false, tool: 'measure' }))
    expect(pan.find(n => n.props.makeDefault)?.props.mouseButtons).toMatchObject({ LEFT: 2 })
    expect(measure.find(n => n.props.makeDefault)?.props.enabled).toBe(false)
    expect(measure.find(n => n.props.enabled && n.props.children)?.props.enabled).toBe(true)
  })
})
