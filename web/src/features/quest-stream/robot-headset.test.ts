import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { PRESS_WAIT_MS, headsetCommandError, headsetControl, headsetSummary, type RobotHeadsetStatus } from './robot-headset'

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
    expect(headsetSummary(status({ connection: 'not_found', batteryPercent: null }), false).text).toBe('Chưa cắm kính vào máy tính của robot')
    expect(headsetSummary(status({ connection: 'unauthorized' }), false).tone).toBe('warn')
    expect(headsetSummary(status({ batteryPercent: null }), false).text).toBe('Đã kết nối, chưa đọc được pin')
    expect(headsetSummary(status({ reported: false, connection: null, batteryPercent: null }), false).text).toBe('Robot chưa báo tình trạng kính')
  })
  it('separates loading from a failed request', () => {
    expect(headsetSummary(undefined, false).text).toBe('Đang đọc…')
    expect(headsetSummary(undefined, true).text).toBe('Không đọc được từ máy chủ')
  })
})

describe('headsetControl (ADR-0056 addendum: wake/sleep)', () => {
  const at = 1_000_000
  it('offers the button that changes the screen', () => {
    expect(headsetControl(status({ screen: 'asleep' }), null, at)).toMatchObject({ actions: ['WAKE'], screenText: 'Kính đang ngủ' })
    expect(headsetControl(status({ screen: 'awake' }), null, at)).toMatchObject({ actions: ['SLEEP'], screenText: 'Màn hình đang bật' })
    expect(headsetControl(status({ screen: 'unknown' }), null, at).actions).toEqual(['WAKE', 'SLEEP'])
  })
  it('offers nothing to a headset that cannot take a press', () => {
    for (const patch of [
      { screen: null }, { screen: undefined }, { stale: true, screen: 'awake' as const },
      { connection: 'offline' as const, screen: 'unknown' as const }, { reported: false, screen: 'asleep' as const },
    ]) expect(headsetControl(status(patch), null, at)).toMatchObject({ actions: [], screenText: null })
    expect(headsetControl(undefined, null, at).actions).toEqual([])
  })
  it('waits for the screen after a press, then says it did not follow', () => {
    const press = { action: 'WAKE' as const, at }
    expect(headsetControl(status({ screen: 'asleep' }), press, at + 2_000)).toMatchObject({
      pressText: 'Đã gửi lệnh đánh thức, chờ robot (vài giây)…', pressTone: 'muted' })
    expect(headsetControl(status({ screen: 'awake' }), press, at + 5_000).pressText).toBeNull()
    expect(headsetControl(status({ screen: 'asleep' }), press, at + PRESS_WAIT_MS)).toMatchObject({
      pressText: 'Kính chưa đổi trạng thái. Kiểm tra kính và thử lại.', pressTone: 'warn' })
  })
})

describe('headsetCommandError', () => {
  it("shows the server's reason for a refused press", () => {
    const body = JSON.stringify({ success: false, message: 'Tour đang chạy trên robot này; cho kính ngủ sẽ tắt hình của người xem.' })
    expect(headsetCommandError(new ApiError(409, body))).toBe('Tour đang chạy trên robot này; cho kính ngủ sẽ tắt hình của người xem.')
  })
  it('falls back for a server error, a lost session or no connection', () => {
    expect(headsetCommandError(new ApiError(500, '{"message":"boom"}'))).toBe('Không gửi được lệnh tới kính. Hãy thử lại.')
    expect(headsetCommandError(new ApiError(401, ''))).toBe('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')
    expect(headsetCommandError(new TypeError('fetch failed'))).toBe('Không gửi được lệnh tới máy chủ. Hãy thử lại.')
  })
})
