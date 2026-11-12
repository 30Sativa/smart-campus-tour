import { describe, expect, it } from 'vitest'
import { DRIVE, IDLE, followPath, headingDegrees, inputFromKeys, nearestStop, openHeading, startDrive, stepDrive, type CanMove, type DriveState } from './drive'

const open: CanMove = () => true
/** A wall along x = 2: nothing may end up at x > 1.6. */
const wall: CanMove = (_, b) => b.x <= 1.6

function run(state: DriveState, input = IDLE, seconds = 1, canMove = open) {
  let next = state
  for (let t = 0; t < seconds; t += 0.02) next = stepDrive(next, input, 0.02, canMove)
  return next
}

describe('robot test drive', () => {
  it('speeds up smoothly to its top speed and drives along its heading', () => {
    const start = startDrive({ x: 0, y: 0 }, 0)
    const early = stepDrive(start, { throttle: 1, steer: 0, brake: false }, 0.1, open)
    expect(early.speed).toBeGreaterThan(0)
    expect(early.speed).toBeLessThan(DRIVE.maxSpeed)
    const later = run(start, { throttle: 1, steer: 0, brake: false }, 3)
    expect(later.speed).toBeCloseTo(DRIVE.maxSpeed)
    expect(later.x).toBeGreaterThan(2)
    expect(Math.abs(later.y)).toBeLessThan(1e-9)
    expect(later.odometer).toBeCloseTo(later.x)
  })

  it('turns on the spot without moving, like the two-wheel platform', () => {
    const turned = run(startDrive({ x: 3, y: 4 }, 0), { throttle: 0, steer: 1, brake: false }, 1)
    expect(turned.yaw).toBeGreaterThan(1)
    expect(turned.x).toBe(3)
    expect(turned.y).toBe(4)
    expect(run(startDrive({ x: 0, y: 0 }, 0), { throttle: 0, steer: -1, brake: false }, 1).yaw).toBeLessThan(-1)
  })

  it('brakes to a stop quicker than it coasts', () => {
    const moving = run(startDrive({ x: 0, y: 0 }, 0), { throttle: 1, steer: 0, brake: false }, 3)
    const braked = run(moving, { throttle: 0, steer: 0, brake: true }, 0.3)
    const coasted = run(moving, IDLE, 0.3)
    expect(braked.speed).toBeLessThan(coasted.speed)
    expect(run(moving, { throttle: 0, steer: 0, brake: true }, 1).speed).toBe(0)
  })

  it('stops head-on at a wall and reports it', () => {
    const stopped = run(startDrive({ x: 0, y: 0 }, 0), { throttle: 1, steer: 0, brake: false }, 4, wall)
    expect(stopped.x).toBeLessThanOrEqual(1.6)
    expect(stopped.blocked).toBe(true)
    expect(stopped.speed).toBe(0)
  })

  it('slides along a wall it meets at an angle', () => {
    const slid = run(startDrive({ x: 0, y: 0 }, Math.PI / 4), { throttle: 1, steer: 0, brake: false }, 4, wall)
    expect(slid.x).toBeLessThanOrEqual(1.6)
    expect(slid.y).toBeGreaterThan(3)
    expect(slid.blocked).toBe(false)
  })

  it('reads arrows, WASD, the on-screen buttons and Space', () => {
    expect(inputFromKeys(new Set(['ArrowUp', 'ArrowRight']))).toEqual({ throttle: 1, steer: 1, brake: false })
    expect(inputFromKeys(new Set(['s', 'a']))).toEqual({ throttle: -1, steer: -1, brake: false })
    expect(inputFromKeys(new Set(['up', 'down', ' ']))).toEqual({ throttle: 0, steer: 0, brake: true })
    expect(inputFromKeys(new Set())).toEqual(IDLE)
  })

  it('finds the nearest stop and starts facing the open way', () => {
    expect(nearestStop({ x: 0, y: 0 }, [{ x: 5, y: 0 }, { x: 1, y: 1 }])).toEqual({ index: 1, distance: Math.SQRT2 })
    expect(nearestStop({ x: 0, y: 0 }, [])).toBeNull()
    // Only the +y direction is free.
    const corridor: CanMove = (_, b) => Math.abs(b.x) < 0.2 && b.y >= 0
    expect(openHeading({ x: 0, y: 0 }, corridor)).toBeCloseTo(Math.PI / 2)
    // A short corridor: 3.5 m free ahead going up but only 2 m behind; asking for 3 m behind turns it round.
    const deadEnd: CanMove = (_, b) => Math.abs(b.x) < 0.2 && b.y <= 3.5 && b.y >= -2
    expect(openHeading({ x: 0, y: 0 }, deadEnd)).toBeCloseTo(Math.PI / 2)
    expect(openHeading({ x: 0, y: 0 }, deadEnd, 6, 16, 3)).toBeCloseTo(-Math.PI / 2 + Math.PI * 2)
  })

  it('shows the heading as 0–359°', () => {
    expect(headingDegrees(0)).toBe(0)
    expect(headingDegrees(-Math.PI / 2)).toBe(270)
    expect(headingDegrees(Math.PI * 2 + Math.PI / 2)).toBe(90)
  })
})

describe('self-driving along a path', () => {
  it('reaches every waypoint and then brakes', () => {
    const route = [{ x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }]
    let state = startDrive({ x: 0, y: 0 }, Math.PI / 2)
    let path = route
    let seconds = 0
    while (path.length > 0 && seconds < 40) {
      const step = followPath(state, path)
      path = step.path
      state = stepDrive(state, step.input, 0.02, open)
      seconds += 0.02
    }
    expect(path).toEqual([])
    expect(Math.hypot(state.x - 0, state.y - 3)).toBeLessThan(0.7)
    expect(followPath(state, []).input.brake).toBe(true)
  })

  it('turns towards a waypoint behind it before driving', () => {
    const { input } = followPath(startDrive({ x: 0, y: 0 }, 0), [{ x: -5, y: 0.5 }])
    expect(input.throttle).toBe(0)
    expect(Math.abs(input.steer)).toBe(1)
  })
})
