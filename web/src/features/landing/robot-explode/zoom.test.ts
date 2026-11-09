import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { ZOOM, clampZoom, dollyTo, stepZoom, zoomPercent } from './zoom'

describe('3D stage zoom', () => {
  it('steps in and out within its limits and comes back to exactly 100 %', () => {
    let level = 1
    for (let press = 0; press < 10; press += 1) level = stepZoom(level, 'in')
    expect(level).toBe(ZOOM.min)
    for (let press = 0; press < 10; press += 1) level = stepZoom(level, 'out')
    expect(level).toBe(ZOOM.max)
    expect(stepZoom(stepZoom(1, 'in'), 'out')).toBe(1)
    expect(clampZoom(0)).toBe(ZOOM.min)
  })

  it('shows how big the robot looks: closer is bigger', () => {
    expect(zoomPercent(1)).toBe(100)
    expect(zoomPercent(0.5)).toBe(200)
    expect(zoomPercent(2)).toBe(50)
  })

  it('moves the camera along its line of sight only', () => {
    const position = new Vector3(3, 4, 0)
    const target = new Vector3(0, 0, 0)
    dollyTo(position, target, 2.5, 1, new Vector3())
    expect(position.length()).toBeCloseTo(2.5)
    expect(position.x / position.y).toBeCloseTo(0.75)
  })
})
