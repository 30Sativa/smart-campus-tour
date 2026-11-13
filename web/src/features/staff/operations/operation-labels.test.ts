import { describe, expect, it } from 'vitest'
import {
  CHECK_FIX, CHECK_GROUP_LABEL, ROBOT_FAULT_FALLBACK, checkCountText, checkCounts, checkDetail, checkInfo, groupVerdict,
  robotFaultText, robotReasonText,
} from './operation-labels'

/** Names an operator should never read on the Start check (owner brief, rule 1). */
const INTERNAL = /QUEST_CONTROL_URL|quest-stream|miniPC|Fleet Sync|telemetry|M2\.3|FleetCommands|IsDispatchEnabled|NEEDS_ASSISTANCE/i

const NOW = Date.parse('2026-11-13T07:00:00Z')

describe('start check details', () => {
  it('says how long ago the robot last reported, never in thousands of seconds', () => {
    const detail = checkDetail({ id: 'telemetryFresh', passed: false, detail: 'Telemetry nhận cách đây 59488.2 giây, quá 10 giây.' }, ['telemetryFresh'], NOW)
    expect(detail).toBe('Robot báo lần cuối 16 giờ trước, đã quá lâu.')
    expect(detail).not.toMatch(/giây/)
    expect(checkDetail({ id: 'telemetryFresh', passed: false, detail: 'Robot chưa báo telemetry.' }, ['telemetryFresh'], NOW))
      .toBe('Máy chủ chưa nhận được báo cáo nào từ robot.')
  })

  it('names the prerequisite of a check the server skipped by its label, not its id', () => {
    expect(checkDetail({ id: 'mapContextMatches', passed: false, detail: 'Chưa kiểm tra vì telemetryFresh chưa đạt.' }, ['telemetryFresh'], NOW))
      .toBe('Chưa kiểm tra vì mục "Robot vừa báo trạng thái" chưa đạt.')
  })

  it('keeps configuration keys, state codes and English action names off the screen', () => {
    const rows = [
      { id: 'commandTransportEnabled', passed: false, detail: 'FleetCommands:Enabled = false nên backend không tạo lệnh cho robot.' },
      { id: 'robotDispatchEnabled', passed: false, detail: 'Robot chưa được bật điều phối (IsDispatchEnabled = 0).' },
      { id: 'noOpenIncident', passed: false, detail: 'Một Tour đang giữ robot cần hỗ trợ (NEEDS_ASSISTANCE).' },
      { id: 'tourReady', passed: true, detail: 'Tour đang READY.' },
      { id: 'revisionStillSchedulable', passed: false, detail: 'ROUTE_REVISION_STALE: Phiên bản tuyến không còn kết quả chạy thử đạt.' },
      { id: 'batteryInfo', passed: true, detail: 'Pin 80% (chỉ hiển thị, không chặn Start).' },
      { id: 'allViewersJoined', passed: true, detail: 'Mới có 1/2 điểm xem vào phòng chờ (chỉ cảnh báo, không chặn Start sớm).' },
    ]
    const blockedBy = rows.filter(row => !row.passed).map(row => row.id)
    const texts = rows.map(row => checkDetail(row, blockedBy, NOW))
    for (const text of texts) {
      expect(text).not.toMatch(INTERNAL)
      expect(text).not.toMatch(/\bStart\b|READY|[A-Z]{3,}_[A-Z_]+/)
    }
    expect(texts[4]).toBe('Phiên bản tuyến không còn kết quả chạy thử đạt.')
    expect(texts[6]).toBe('Mới có 1/2 điểm xem vào phòng chờ (chỉ cảnh báo, không chặn bắt đầu sớm).')
  })

  it('does not repeat the label of the console check in its detail', () => {
    const label = checkInfo('operatorConsoleConnected').label
    const detail = checkDetail({ id: 'operatorConsoleConnected', passed: false, detail: 'Console của người vận hành chưa kết nối.' }, ['operatorConsoleConnected'], NOW)
    expect(label).toBe('Trang của người vận hành đang mở')
    expect(detail).not.toMatch(/Console/)
    expect(detail).not.toContain(label)
  })

  it('names the operator check by what to do', () => {
    expect(checkInfo('callerIsOperator').label).toBe('Đăng nhập đúng người vận hành')
  })

  it('points a Tour with nobody accepted to the Cancel button that exists', () => {
    expect(CHECK_FIX.hasAcceptedRows).not.toMatch(/Mở lại rồi hủy/)
    expect(CHECK_FIX.hasAcceptedRows).toMatch(/Hủy Tour/)
  })

  it('uses no internal names in any label or fix', () => {
    const ids = ['tourReady', 'callerIsOperator', 'withinStartWindow', 'telemetryFresh', 'operatorConsoleConnected', 'commandTransportEnabled', 'batteryInfo']
    for (const text of [...Object.values(CHECK_GROUP_LABEL), ...Object.values(CHECK_FIX), ...ids.map(id => checkInfo(id).label)])
      expect(text).not.toMatch(INTERNAL)
  })
})

describe('check counts', () => {
  const rows = [
    { id: 'telemetryFresh', passed: false },
    { id: 'mapContextMatches', passed: false },
    { id: 'robotLocalized', passed: false },
    { id: 'executionIdle', passed: true },
    { id: 'batteryInfo', passed: true },
  ]
  it('puts every counted check in exactly one bucket, so the numbers add up', () => {
    const counts = checkCounts(rows, ['telemetryFresh'])
    expect(counts).toEqual({ passed: 1, failed: 1, notRun: 2, info: 1, counted: 4 })
    expect(checkCountText(counts)).toBe('1/4 đạt, 1 chưa đạt, 2 chưa kiểm tra')
  })

  it('never calls a group with unchecked rows passed', () => {
    const counts = checkCounts([{ id: 'executionIdle', passed: true }, { id: 'robotLocalized', passed: false }], [])
    expect(groupVerdict(counts)).toBe('notRun')
    expect(checkCountText(counts)).toBe('1/2 đạt, 1 chưa kiểm tra')
    expect(groupVerdict(checkCounts([{ id: 'batteryInfo', passed: true }], []))).toBe('info')
  })
})

describe('robot codes', () => {
  it('words the robot fault codes and falls back to one sentence for an unknown one', () => {
    expect(robotFaultText('STM32_LINK_STALE')).toMatch(/bo mạch điều khiển động cơ/)
    expect(robotFaultText('ESTOP_ENGAGED')).toMatch(/dừng khẩn cấp/)
    expect(robotFaultText('SOMETHING_NEW')).toBe('Robot báo lỗi kỹ thuật, báo Kỹ thuật kiểm tra')
    expect(robotFaultText(null)).toBeNull()
  })

  it('never shows a raw reason code', () => {
    expect(robotReasonText('NAV2_ABORTED')).toMatch(/không tới được đích/)
    expect(robotReasonText('STM32_LINK_STALE')).toBe(robotFaultText('STM32_LINK_STALE'))
    expect(robotReasonText('ODD_CODE')).toBe(ROBOT_FAULT_FALLBACK)
  })
})
