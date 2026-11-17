import { describe, expect, it } from 'vitest'
import { appliedFail, dwellText, failedCheckNames, passedAt, resultSource, revisionTone, routeChanges, saveResultText, sharedResultLine, staffRouteStatus, type RoutePathShape } from './route-messages'
import type { RouteTestRun, VersionedRoute } from './versioned-api'

const run = (over: Partial<RouteTestRun>): RouteTestRun => ({
  id: 'run-1', routeRevisionId: 'save-2', robotCode: 'amr_01', checkedByUserId: 'tech', participatingStaffUserId: 'staff',
  resultCode: 'FAIL', allStopsReached: false, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 0,
  failureReason: 'Kẹt ở cửa', evidenceNote: 'Ghi chú', checkedAt: '2026-11-16T12:09:00Z', measurementBasis: 'TOTAL_WITH_DWELL', ...over,
})
const save1 = {
  revisionId: 'save-1', verificationStatus: 'FAIL', effectiveTestRunId: 'run-1', testRuns: [run({})],
  sharedResultRevisions: [{ revisionId: 'save-2', revisionNumber: 2, createdAt: '2026-11-16T06:30:00Z', scheduledTours: [] }],
} satisfies Partial<VersionedRoute>

describe('applied route result (ADR-0023 addendum)', () => {
  it('reads a FAIL recorded on another save with the same path as this save\'s result, never as a pass', () => {
    expect(passedAt(save1)).toBeUndefined()
    expect(appliedFail(save1)?.failureReason).toBe('Kẹt ở cửa')
    expect(resultSource(save1)?.revisionId).toBe('save-2')
    expect(failedCheckNames(appliedFail(save1)!)).toEqual(['đi đủ điểm dừng'])
    expect(passedAt({ ...save1, verificationStatus: 'PASS', testRuns: [run({ resultCode: 'PASS' })] })).toBe('2026-11-16T12:09:00Z')
  })

  it('names the other saves and their Tours that a result also decides', () => {
    expect(sharedResultLine({ sharedResultRevisions: [{ revisionId: 's1', revisionNumber: 1, createdAt: '2026-11-16T05:23:00Z',
      scheduledTours: [{ id: 't1', name: 'TEST WF-A Tour thường', scheduledStartAt: '2026-11-20T04:15:00Z', state: 'SCHEDULED' }] }] }))
      .toBe('Kết quả này áp dụng cho cả: bản lưu 16/11 12:23 (1 Tour đã lên lịch: TEST WF-A Tour thường · 20/11 11:15)')
    expect(sharedResultLine({ sharedResultRevisions: [] })).toBeNull()
  })

  it('states what a status means instead of "kiểm chứng" alone', () => {
    expect(revisionTone(true, 'PASS').label).toBe('Chạy thử đạt')
    expect(revisionTone(true, 'NOT_TESTED').label).toBe('Chưa chạy thử')
    expect(revisionTone(false, 'NOT_TESTED').label).toBe('Chưa gửi kiểm chứng')
    expect(staffRouteStatus({ isSubmitted: false, verificationStatus: 'NOT_TESTED' }).label).toBe('Chưa gửi kiểm chứng')
  })
})

describe('what a save means for its run (B1)', () => {
  const base: RoutePathShape = { mapVersionId: 'm', startX: 1, startY: 1, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null,
    stops: [{ poiRevisionId: 'a', dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 30 }] },
      { poiRevisionId: 'b', dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 30 }] }] }

  it('keeps the result when only dwell changed, and asks for a run when the path changed', () => {
    const dwell = routeChanges(base, { ...base, stops: [base.stops[0], { ...base.stops[1], dwellSeconds: 45 }] })
    expect(dwell).toEqual({ changes: ['đổi thời gian dừng 1 điểm'], pathChanged: false })
    const order = routeChanges(base, { ...base, stops: [base.stops[1], base.stops[0]] })
    expect(order).toEqual({ changes: ['đổi thứ tự điểm dừng'], pathChanged: true })
    expect(routeChanges(base, { ...base, startX: 2 }).changes).toEqual(['đổi điểm bắt đầu'])
    expect(routeChanges(base, { ...base, stops: [base.stops[0]] }).changes).toEqual(['bớt 1 điểm dừng'])
  })

  // E2: a rename or a new description is a change, but not of the path, so the save keeps its result.
  it('names a rename or a new description without calling it a path change', () => {
    const named = { ...base, name: 'Tuyến A', description: 'Đi qua thư viện' }
    expect(routeChanges(named, { ...named, name: 'Tuyến A mới' })).toEqual({ changes: ['đổi tên tuyến'], pathChanged: false })
    expect(routeChanges(named, { ...named, description: 'Đi qua sân bóng' })).toEqual({ changes: ['đổi mô tả'], pathChanged: false })
    expect(routeChanges(named, { ...named, name: 'Tuyến A mới', stops: [base.stops[0], { ...base.stops[1], dwellSeconds: 45 }] }))
      .toEqual({ changes: ['đổi tên tuyến', 'đổi thời gian dừng 1 điểm'], pathChanged: false })
  })

  it('compares the name and description as they are saved: trimmed, and a blank description is none', () => {
    const named = { ...base, name: 'Tuyến A', description: null }
    expect(routeChanges(named, { ...named, name: '  Tuyến A ', description: '   ' })).toEqual({ changes: [], pathChanged: false })
  })

  it('words the toast for each case', () => {
    expect(saveResultText({ isSubmitted: true, verificationStatus: 'PASS' })).toMatch(/giữ kết quả chạy thử đạt/)
    expect(saveResultText({ isSubmitted: true, verificationStatus: 'FAIL' })).toMatch(/không đạt\. Nếu lỗi do đường đi thì sửa rồi gửi lại; nếu không, nhờ Kỹ thuật chạy lại\.$/)
    expect(saveResultText({ isSubmitted: true, verificationStatus: 'NOT_TESTED' })).toMatch(/cần Kỹ thuật chạy thử lại/)
    expect(saveResultText({ isSubmitted: false, verificationStatus: 'PASS' })).toMatch(/^Chưa gửi kiểm chứng/)
  })

  it('prints dwell totals in minutes and seconds', () => {
    expect(dwellText(1800)).toBe('30 phút')
    expect(dwellText(75)).toBe('1 phút 15 giây')
    expect(dwellText(45)).toBe('45 giây')
  })
})
