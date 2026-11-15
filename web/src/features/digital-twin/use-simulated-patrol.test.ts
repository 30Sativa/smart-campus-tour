import { describe, expect, it } from 'vitest'
import { createPatrol, stepPatrol } from './patrol-demo'
import { interpolatedPose, patrolTwinRobots, type PatrolClock } from './use-simulated-patrol'

describe('simulated patrol between React snapshots', () => {
  it('draws a robot between the last two ticks, by the time since the last one', () => {
    const previous = createPatrol()
    let current = previous
    for (let i = 0; i < 40; i++) current = stepPatrol(current)
    const clock: PatrolClock = { previous, current, steppedAt: 1000, tickMs: 50 }
    const moved = current.robots.findIndex((robot, index) => robot.pose.x !== previous.robots[index].pose.x || robot.pose.y !== previous.robots[index].pose.y)
    expect(moved).toBeGreaterThanOrEqual(0)
    const from = previous.robots[moved].pose, to = current.robots[moved].pose
    expect(interpolatedPose(clock, moved, 1000)).toMatchObject({ x: from.x, y: from.y })
    expect(interpolatedPose(clock, moved, 1050)).toMatchObject({ x: to.x, y: to.y })
    expect(interpolatedPose(clock, moved, 2000)).toMatchObject({ x: to.x, y: to.y })
    const half = interpolatedPose(clock, moved, 1025)
    expect(half.x).toBeCloseTo((from.x + to.x) / 2)
    expect(half.y).toBeCloseTo((from.y + to.y) / 2)
  })

  it('hands each scene robot its own per-frame pose', () => {
    const state = createPatrol()
    const robots = patrolTwinRobots(state, { playing: true, prefix: 'S', synthetic: true, livePose: index => ({ x: index, y: 0, yaw: 0 }) })
    expect(robots.map(robot => robot.livePose?.().x)).toEqual([0, 1, 2, 3, 4, 5])
  })
})
