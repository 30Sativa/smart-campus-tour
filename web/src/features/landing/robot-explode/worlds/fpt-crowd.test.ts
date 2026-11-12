import { describe, expect, it } from 'vitest'
import { createCrowd, senseCrowd, stepCrowd } from './fpt-crowd'
import { CAR_LANES } from './fpt-campus'

const far = { x: 500, y: 500 }

describe('people and cars on the campus map', () => {
  it('keeps walkers moving along their paths', () => {
    const crowd = createCrowd()
    const before = crowd.walkers.map(walker => ({ x: walker.x, y: walker.y }))
    for (let i = 0; i < 20; i += 1) stepCrowd(crowd, 0.1, far)
    const moved = crowd.walkers.filter((walker, i) => Math.hypot(walker.x - before[i].x, walker.y - before[i].y) > 0.5)
    expect(moved.length).toBe(crowd.walkers.length)
  })

  it('makes a walker step round the robot standing on its path, and back onto the path after', () => {
    const crowd = createCrowd()
    const walker = crowd.walkers[0]
    const robot = { x: walker.x + Math.cos(walker.yaw) * 1.5, y: walker.y + Math.sin(walker.yaw) * 1.5 }
    let closest = Infinity
    for (let i = 0; i < 40; i += 1) {
      stepCrowd(crowd, 0.1, robot)
      closest = Math.min(closest, Math.hypot(walker.x - robot.x, walker.y - robot.y))
    }
    // It kept walking and never walked into the robot.
    expect(walker.moving).toBe(true)
    expect(closest).toBeGreaterThan(0.9)
    for (let i = 0; i < 60; i += 1) stepCrowd(crowd, 0.1, far)
    expect(walker.aside).toBeCloseTo(0)
  })

  it('stops a car for the robot in its lane and lets it go on after', () => {
    const crowd = createCrowd()
    const car = crowd.cars[0]
    car.x = 0
    const lane = CAR_LANES[car.lane]
    const robot = { x: lane.dir * 9, y: lane.y }
    for (let i = 0; i < 60; i += 1) stepCrowd(crowd, 0.1, robot)
    expect(car.speed).toBeLessThan(0.5)
    expect((robot.x - car.x) * lane.dir).toBeGreaterThan(3)
    for (let i = 0; i < 40; i += 1) stepCrowd(crowd, 0.1, far)
    expect(car.speed).toBeGreaterThan(5)
  })

  it('senses who is around and who is straight ahead', () => {
    const crowd = { walkers: [], idlers: [{ path: -1, travelled: 0, speed: 0, x: 3, y: 0, yaw: 0, moving: false, shirt: '', skin: '', aside: 0 }, { path: -1, travelled: 0, speed: 0, x: 0, y: 10, yaw: 0, moving: false, shirt: '', skin: '', aside: 0 }], cars: [] }
    const seen = senseCrowd(crowd, { x: 0, y: 0, yaw: 0 })
    expect(seen.tracked.map(item => item.distance)).toEqual([3, 10])
    expect(seen.ahead).toBe(3)
    expect(senseCrowd(crowd, { x: 0, y: 0, yaw: Math.PI }).ahead).toBeNull()
  })
})
