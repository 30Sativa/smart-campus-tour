import { describe, expect, it } from 'vitest'
import { appliedFail, dwellText, failedCheckNames, legCoverageText, missingLegsText, passedAt, resultSource, revisionLabel, revisionTone, routeChangeText, routeChanges, runOnPath, runResultTag, runRuleNote, saveResultText, sharedResultLine, staffRouteStatus, type RoutePathShape } from './route-messages'
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
      .toBe('Kết quả này áp dụng cho cả: phiên bản 1 (16/11 12:23) · 1 Tour đã lên lịch: TEST WF-A Tour thường · 20/11 11:15')
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

describe('voting routes (ADR-0065)', () => {
  it('names LEGS_INCOMPLETE on Technical and Staff screens', () => {
    expect(revisionTone(true, 'LEGS_INCOMPLETE').label).toBe('Chạy thử chưa đủ chặng')
    expect(staffRouteStatus({ isSubmitted: true, verificationStatus: 'LEGS_INCOMPLETE' }).label).toBe('Chạy thử chưa đủ chặng')
    expect(saveResultText({ isSubmitted: true, verificationStatus: 'LEGS_INCOMPLETE' })).toMatch(/các chặng chưa đi/)
  })

  it('lists the missing legs from the server, naming the start and the end', () => {
    expect(missingLegsText({ requiredCount: 7, coveredCount: 5, missingLegs: [
      { fromStopId: null, fromName: '', toStopId: 's-b', toName: 'B' }, { fromStopId: 's-c', fromName: 'C', toStopId: null, toName: '' },
    ] })).toBe('Còn thiếu 2 chặng: Điểm bắt đầu → B, C → Điểm kết thúc')
    expect(missingLegsText({ requiredCount: 7, coveredCount: 7, missingLegs: [] })).toBeNull()
    expect(missingLegsText(null)).toBeNull()
    expect(legCoverageText({ requiredCount: 13, coveredCount: 4, missingLegs: [] })).toBe('Đã đi 4/13 chặng')
  })

  it('treats switching the vote as a path change', () => {
    const shape: RoutePathShape = { mapVersionId: 'm', startX: 0, startY: 0, startYaw: 0, endMode: 'POSE', endX: 0, endY: 0, endYaw: 0, stops: [] }
    expect(routeChanges(shape, { ...shape, viewerChoosesNextStop: true })).toEqual({ changes: ['bật cho Viewer chọn điểm tiếp theo'], pathChanged: true })
    expect(routeChanges({ ...shape, viewerChoosesNextStop: false }, shape).pathChanged).toBe(false)
  })
})

describe('round 7: route test words for a newcomer', () => {
  const stop = (poiRevisionId: string, poiProposalId: string, name: string, x = 1) =>
    ({ poiRevisionId, poiProposalId, name, x, y: 2, yaw: 0.5, cameraPreset: 'FRONT', dwellSeconds: 30, headSteps: [] })
  const shape = (stops: RoutePathShape['stops'], configurationFingerprint?: string): RoutePathShape =>
    ({ mapVersionId: 'm', startX: 0, startY: 0, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, stops, configurationFingerprint })

  it('4.1 reads a newer revision of the same POI at the same place as one POI, not one added and one removed', () => {
    const before = shape([stop('a', 'pa', 'Sảnh'), stop('b-1', 'pb', 'Thư viện')])
    expect(routeChanges(before, shape([stop('a', 'pa', 'Sảnh'), stop('b-2', 'pb', 'Thư viện')])))
      .toEqual({ changes: ['1 POI có phiên bản mới (Thư viện)'], pathChanged: false })
  })

  it('4.1 calls a newer POI revision that moved a path change, like the server fingerprint', () => {
    const before = shape([stop('a', 'pa', 'Sảnh'), stop('b-1', 'pb', 'Thư viện')])
    expect(routeChanges(before, shape([stop('a', 'pa', 'Sảnh'), stop('b-2', 'pb', 'Thư viện', 3)])))
      .toEqual({ changes: ['1 POI có phiên bản mới, đổi vị trí hoặc hướng (Thư viện)'], pathChanged: true })
  })

  it('4.1 still counts real adds and removes, and lets both fingerprints decide', () => {
    const before = shape([stop('a', 'pa', 'Sảnh')], 'f1')
    expect(routeChanges(before, shape([stop('a', 'pa', 'Sảnh'), stop('c', 'pc', 'Sân')], 'f2')).changes).toEqual(['thêm 1 điểm dừng'])
    expect(routeChanges(shape([stop('a', 'pa', 'Sảnh'), stop('c', 'pc', 'Sân')]), before).changes).toEqual(['bớt 1 điểm dừng'])
    expect(routeChanges(before, shape([stop('a', 'pa', 'Sảnh')], 'f9'))).toEqual({ changes: ['đổi đường đi'], pathChanged: true })
  })

  it('4.1 drops "cần chạy thử lại" for a revision that already passed', () => {
    expect(routeChangeText(['thêm 1 điểm dừng'], true, true)).toBe('thêm 1 điểm dừng. Bản này đã có lần chạy đạt.')
    expect(routeChangeText(['thêm 1 điểm dừng'], true, false)).toBe('thêm 1 điểm dừng. Đường đi đã đổi, cần chạy thử lại.')
  })

  it('4.4 names a revision by its number and save time', () => {
    expect(revisionLabel({ revisionNumber: 4, createdAt: '2026-11-17T05:21:00Z' })).toBe('Phiên bản 4 (17/11 12:21)')
    expect(revisionLabel({ revisionNumber: 4, createdAt: '2026-11-17T05:21:00Z' }, true)).toBe('phiên bản 4 (17/11 12:21)')
  })

  const runOf = (id: string, resultCode: 'PASS' | 'FAIL', checkedAt: string, routeRevisionId = 'save-2', traversed: string[] | null = ['s1']) =>
    run({ id, resultCode, checkedAt, routeRevisionId, traversedStopIds: traversed })
  const routeWith = (over: Partial<VersionedRoute>) => ({
    revisionId: 'save-2', configurationFingerprint: 'f1', verificationStatus: 'PASS', effectiveTestRunId: null, viewerChoosesNextStop: false, legCoverage: null,
    testRuns: [], revisionHistory: [
      { revisionId: 'save-1', revisionNumber: 1, configurationFingerprint: 'f0', createdAt: '', mapVersionId: 'm', mapPackageSha256: 'a', isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: null },
      { revisionId: 'save-3', revisionNumber: 3, configurationFingerprint: 'f1', createdAt: '', mapVersionId: 'm', mapPackageSha256: 'a', isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: null },
    ], ...over }) as Parameters<typeof runResultTag>[0]

  it('4.3 calls only the effective run of a fixed route Kết quả hiện tại', () => {
    const route = routeWith({ effectiveTestRunId: 'r2' })
    expect(runResultTag(route, runOf('r2', 'PASS', '2026-11-18T02:00:00Z'))).toBe('Kết quả hiện tại')
    expect(runResultTag(route, runOf('r1', 'PASS', '2026-11-18T01:00:00Z'))).toBeNull()
  })

  it('4.3 tags the PASS runs a voting route counts since its newest FAIL, on its own path only', () => {
    const runs = [
      runOf('r1', 'PASS', '2026-11-18T01:00:00Z'), runOf('r2', 'FAIL', '2026-11-18T02:00:00Z'), runOf('r3', 'PASS', '2026-11-18T03:00:00Z', 'save-3'),
      runOf('r4', 'PASS', '2026-11-18T04:00:00Z', 'save-1'), runOf('r5', 'PASS', '2026-11-18T05:00:00Z', 'save-2', null),
    ]
    const route = routeWith({ viewerChoosesNextStop: true, verificationStatus: 'LEGS_INCOMPLETE', effectiveTestRunId: 'r5', testRuns: runs, legCoverage: { requiredCount: 7, coveredCount: 5, missingLegs: [] } })
    expect(runs.map(item => runResultTag(route, item))).toEqual([null, null, 'Tính vào 5/7 chặng', null, null])
    const failed = routeWith({ viewerChoosesNextStop: true, verificationStatus: 'FAIL', effectiveTestRunId: 'r2', testRuns: runs, legCoverage: { requiredCount: 7, coveredCount: 0, missingLegs: [] } })
    expect(runResultTag(failed, runs[1])).toBe('Kết quả hiện tại')
    expect(runOnPath(route, runs[3])).toBe(false)
    expect(runOnPath(route, runs[2])).toBe(true)
  })

  it('4.3 words the run rule as the server applies it', () => {
    expect(runRuleNote(false)).toMatch(/Lần chạy mới nhất trên đường đi này là kết quả hiện tại/)
    expect(runRuleNote(true)).toMatch(/cộng dồn các chặng đã đi, tuyến đạt khi đủ mọi chặng/)
  })
})
