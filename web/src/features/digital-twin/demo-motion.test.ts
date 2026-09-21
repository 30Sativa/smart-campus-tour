import { describe, expect, it } from 'vitest'
import { DEMO_DURATION, DEMO_RADIUS, demoPose, mapToScene } from './demo-motion'

describe('demo movement and map coordinates', () => {
  it('completes a loop without a position or heading discontinuity', () => {
    const start = demoPose(0)
    const end = demoPose(DEMO_DURATION)
    expect(end.x).toBeCloseTo(start.x)
    expect(end.y).toBeCloseTo(start.y)
    expect(end.yaw).toBeCloseTo(start.yaw)
  })
  it('faces along the route at a quarter turn', () => {
    const pose = demoPose(DEMO_DURATION / 4)
    expect(pose.x).toBeCloseTo(0)
    expect(pose.y).toBeCloseTo(DEMO_RADIUS)
    expect(pose.yaw).toBeCloseTo(Math.PI)
  })
  it('maps metres to the ground plane and preserves heading', () => {
    expect(mapToScene({ x: 2, y: 3, yaw: Math.PI / 2 })).toEqual({
      position: [2, 0, -3], rotation: Math.PI / 2,
    })
  })
})
