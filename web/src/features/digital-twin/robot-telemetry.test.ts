import { describe, expect, it } from 'vitest'
import { IDENTITY, type MapConfig } from './map-config'
import { acceptObservation, observationView, type RobotObservation } from './robot-telemetry'

const now = Date.parse('2026-10-09T05:00:00Z')
const sample: RobotObservation = { robotId: 'robot_01', mapKey: 'map2-v2', frameId: 'map', streamId: 'stream-a', seq: 1, capturedAt: new Date(now).toISOString(), pose: { x: 3, y: 4, yaw: 0 } }
const calibrated: MapConfig = { mapKey: 'map2-v2', scene: { calibrated: true, transform: { ...IDENTITY, tx: 10 } }, student2d: { calibrated: false, transform: IDENTITY } }

describe('prepared robot telemetry', () => {
  it('accepts finite map pose samples and owns their data', () => {
    const received = structuredClone(sample)
    const accepted = acceptObservation(null, received, now)!
    received.pose.x = 500
    expect(accepted.pose.x).toBe(3)
  })
  it.each([
    { ...sample, frameId: 'odom' }, { ...sample, seq: 0 }, { ...sample, seq: 1.5 },
    { ...sample, pose: { x: NaN, y: 4, yaw: 0 } }, { ...sample, pose: { x: 3, y: 4 } },
    { ...sample, capturedAt: 'invalid' }, { ...sample, capturedAt: new Date(now + 6000).toISOString() },
  ])('rejects invalid observations without replacing the last pose', (invalid) => {
    expect(acceptObservation(sample, invalid, now)).toBe(sample)
  })
  it('rejects duplicates, backwards samples, another robot and context changes in one stream', () => {
    expect(acceptObservation(sample, sample, now)).toBe(sample)
    expect(acceptObservation(sample, { ...sample, seq: 2, capturedAt: new Date(now - 1000).toISOString() }, now)).toBe(sample)
    expect(acceptObservation(sample, { ...sample, seq: 2, robotId: 'robot_02' }, now)).toBe(sample)
    expect(acceptObservation(sample, { ...sample, seq: 2, mapKey: 'other' }, now)).toBe(sample)
    expect(acceptObservation(sample, { ...sample, streamId: 'restart', seq: 1 }, now)).toBe(sample)
    expect(acceptObservation(sample, { ...sample, streamId: 'restart', seq: 1, capturedAt: new Date(now + 1000).toISOString() }, now)?.streamId).toBe('restart')
  })
  it('uses pose capture age, even while connected; reconnect cannot make an old pose fresh', () => {
    expect(observationView(sample, 'connected', now).stale).toBe(false)
    expect(observationView(sample, 'connected', now + 6000).stale).toBe(true)
    expect(observationView(sample, 'reconnecting', now).stale).toBe(true)
    expect(observationView(sample, 'disconnected', now).stale).toBe(true)
  })
  it('does not place physical poses without matching measured calibration', () => {
    expect(observationView(sample, 'connected', now).scenePose).toBeNull()
    expect(observationView(sample, 'connected', now, { ...calibrated, mapKey: 'other' }).scenePose).toBeNull()
    expect(observationView(sample, 'connected', now, calibrated).scenePose?.position).toEqual([13, 0, -4])
    expect(observationView(null, 'connected', now).scenePose).toBeNull()
  })
})
