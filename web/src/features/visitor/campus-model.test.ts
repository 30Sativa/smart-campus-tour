/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3, Group, Vector3 } from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { CAMPUS_MODEL, modelAnchorForPin } from './campus-model'
import { campusCameraFrame, campusModelMatrix } from './components/campus-camera'

describe('campus model alignment', () => {
  const pin = { id: 'library', x: 25, y: 75, role: 'place' }

  it('does not pretend uncalibrated plan coordinates are room positions', () => {
    expect(modelAnchorForPin(pin, CAMPUS_MODEL)).toBeNull()
    expect(modelAnchorForPin({ ...pin, role: 'robot' }, CAMPUS_MODEL)).toBeNull()
  })

  it('uses surveyed anchors and a single axis/scale/rotation transform', () => {
    const config = { ...CAMPUS_MODEL, scale: 2, rotationDegrees: 90, locationAnchors: { library: [2, 3, 4] as [number, number, number] } }
    const anchor = modelAnchorForPin(pin, config)!
    const transformed = new Vector3(...anchor).applyMatrix4(campusModelMatrix(config))
    expect(transformed.x).toBeCloseTo(-6)
    expect(transformed.y).toBeCloseTo(8)
    expect(transformed.z).toBeCloseTo(-4)
  })

  it('calibrates the percentage plan and never gives the robot a fixed anchor', () => {
    const config = { ...CAMPUS_MODEL, locationAnchors: { library: [9, 8, 7] as [number, number, number] }, planCalibration: {
      origin: [10, 20, 1] as [number, number, number], xAxis: [40, 0, 0] as [number, number, number], yAxis: [0, -80, 0] as [number, number, number],
    } }
    expect(modelAnchorForPin(pin, config)).toEqual([9, 8, 7])
    expect(modelAnchorForPin({ ...pin, role: 'robot' }, config)).toEqual([20, -40, 1])
    expect(modelAnchorForPin({ ...pin, role: 'robot', x: NaN }, config)).toBeNull()
  })

  it('loads the supplied OBJ geometry with Z-up converted to a horizontal floor', () => {
    const object = new OBJLoader().parse(readFileSync('public/models/campus/campus.obj', 'utf8'))
    const root = new Group()
    root.matrixAutoUpdate = false
    root.matrix.copy(campusModelMatrix(CAMPUS_MODEL))
    root.add(object)
    root.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(root)
    const size = bounds.getSize(new Vector3())
    expect(bounds.isEmpty()).toBe(false)
    expect(size.y).toBeGreaterThan(0)
    expect(size.y).toBeLessThan(Math.min(size.x, size.z))
  })

  it('fits the entire model in narrow and wide viewports and preserves top orientation', () => {
    const bounds = new Box3(new Vector3(-40, 0, -20), new Vector3(40, 8, 20))
    const wide = campusCameraFrame(bounds, 1.8, 42, false)
    const narrow = campusCameraFrame(bounds, 0.7, 42, false)
    expect(narrow.distance).toBeGreaterThan(wide.distance)
    expect(wide.center.toArray()).toEqual([0, 4, 0])
    expect(wide.distance * Math.sin(42 * Math.PI / 360)).toBeGreaterThan(wide.radius)
    const top = campusCameraFrame(bounds, 1, 42, true)
    expect(top.position.y).toBeGreaterThan(top.radius)
    expect(top.position.x).toBeCloseTo(top.center.x)
    expect(top.position.z - top.center.z).toBeLessThan(1)
  })
})
