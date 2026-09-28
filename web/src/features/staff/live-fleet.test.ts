import { afterEach, describe, expect, it } from 'vitest'
import type { AmrStatus } from '../../api/contracts/staff'
import { sampleAgeSeconds } from '../../api/contracts/fleet-realtime'
import { applyLivePoses, clearLivePoses, recordRobotPoses } from './live-fleet'

const T0 = Date.parse('2026-09-25T08:00:00.000Z')
const pose = (code: string, mapKey = 'map3d-preview-v1') => ({
  robotCode: code, source: 'gazebo' as const, mapKey, frameId: 'map', x: 2, y: 3, yaw: 0.4,
  localized: true, covXY: 0.02, capturedAt: '2026-09-25T07:59:59.900Z', receivedAt: '2026-09-25T08:00:00.000Z',
})

afterEach(clearLivePoses)

describe('live fleet poses', () => {
  it('computes age from server timestamps, not the browser clock', () => {
    // Server sent 0.2 s after receiving; browser got it 1 s ago; its clock is 1 h off: irrelevant.
    expect(sampleAgeSeconds('2026-09-25T08:00:00.200Z', '2026-09-25T08:00:00.000Z', T0 + 3_600_000, T0 + 3_601_000)).toBeCloseTo(1.2)
  })

  it('puts a live pose on the matching robot and appends unknown robots', () => {
    recordRobotPoses({ sentAt: '2026-09-25T08:00:00.000Z', robots: [pose('robot_01'), pose('robot_09')] }, T0)
    const known = { id: 'robot_01', name: 'AMR 01', operationalState: 'Idle', connectionState: 'Live', sensorHealth: 'OK', pose: { x: 0, y: 0 } } as AmrStatus
    const robots = applyLivePoses([known], T0 + 500)
    expect(robots).toHaveLength(2)
    expect(robots[0]).toMatchObject({ name: 'AMR 01', pose: { x: 2, y: 3, yaw: 0.4 }, connectionState: 'Live', source: 'Gazebo', assignable: false })
    expect(robots[1]).toMatchObject({ id: 'robot_09', pose: { x: 2, y: 3 } })
  })

  it('marks old samples stale, then disconnected, keeping the last position', () => {
    recordRobotPoses({ sentAt: '2026-09-25T08:00:00.000Z', robots: [pose('robot_01')] }, T0)
    expect(applyLivePoses([], T0 + 6_000)[0]).toMatchObject({ connectionState: 'Stale', pose: { x: 2 } })
    expect(applyLivePoses([], T0 + 11_000)[0]).toMatchObject({ connectionState: 'Disconnected', pose: { x: 2 } })
  })

  it('does not place a robot whose map is not calibrated for 3D', () => {
    recordRobotPoses({ sentAt: '2026-09-25T08:00:00.000Z', robots: [pose('robot_01', 'campus_v1')] }, T0)
    expect(applyLivePoses([], T0)[0].pose).toBeNull()
  })
})
