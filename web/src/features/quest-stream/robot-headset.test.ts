import { describe, expect, it } from 'vitest'
import { headsetSummary, type RobotHeadsetStatus } from './robot-headset'

const status = (patch: Partial<RobotHeadsetStatus> = {}): RobotHeadsetStatus => ({
  robotCode: 'amr_01', reported: true, connection: 'connected', batteryPercent: 54, charging: false, stream: 'live',
  reportedAt: '2026-11-12T08:00:00Z', stale: false, ...patch,
})

describe('headsetSummary (ADR-0056)', () => {
  it('says the battery, and whether it charges', () => {
    expect(headsetSummary(status(), false)).toEqual({ text: 'Pin 54%', tone: 'ok' })
    expect(headsetSummary(status({ charging: true }), false)).toEqual({ text: 'Pin 54% · đang sạc', tone: 'ok' })
  })
  it('warns below 40% and alarms below 20%', () => {
    expect(headsetSummary(status({ batteryPercent: 35 }), false).tone).toBe('warn')
    expect(headsetSummary(status({ batteryPercent: 12 }), false).tone).toBe('danger')
  })
  it('never shows an old number as current', () => {
    expect(headsetSummary(status({ stale: true, batteryPercent: 12 }), false)).toEqual({ text: 'Pin 12% (số liệu cũ)', tone: 'muted' })
  })
  it('says why there is no battery', () => {
    expect(headsetSummary(status({ connection: 'not_found', batteryPercent: null }), false).text).toBe('Chưa cắm kính vào miniPC')
    expect(headsetSummary(status({ connection: 'unauthorized' }), false).tone).toBe('warn')
    expect(headsetSummary(status({ batteryPercent: null }), false).text).toBe('Đã kết nối, chưa đọc được pin')
    expect(headsetSummary(status({ reported: false, connection: null, batteryPercent: null }), false).text).toBe('Robot chưa báo tình trạng kính')
  })
  it('separates loading from a failed request', () => {
    expect(headsetSummary(undefined, false).text).toBe('Đang đọc…')
    expect(headsetSummary(undefined, true).text).toBe('Không đọc được từ máy chủ')
  })
})
