import { describe, expect, it } from 'vitest'
import { cameraLeaseHint, type RobotCameraStatus } from './camera-lease'

const status = (patch: Partial<RobotCameraStatus> = {}): RobotCameraStatus => ({
  robotCode: 'amr_01', wanted: true, reason: 'STAFF_WATCHING', robotListening: true,
  lastPollAt: '2026-11-09T10:00:00Z', leaseUntil: '2026-11-09T10:02:00Z', ...patch,
})

describe('cameraLeaseHint (ADR-0052)', () => {
  it('says the camera is being switched on when the robot listens', () => {
    expect(cameraLeaseHint(status(), false)).toContain('Đang bật camera trên robot')
  })
  it('says the robot cannot be reached when it never asked the backend', () => {
    expect(cameraLeaseHint(status({ robotListening: false, lastPollAt: null }), false)).toContain('Robot chưa nhận yêu cầu bật camera')
  })
  it('says the request failed', () => {
    expect(cameraLeaseHint(undefined, true)).toContain('Không gửi được')
  })
  it('keeps the default hint before the first answer', () => {
    expect(cameraLeaseHint(undefined, false)).toBeUndefined()
  })
})
