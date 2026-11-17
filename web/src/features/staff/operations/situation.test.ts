import { describe, expect, it } from 'vitest'
import type { RobotCommandState, TourActionAvailability, TourDetails } from '../../administration/tours/types'
import { endEarlyEffect, tourSituation, tourTargets } from './situation'

const refuse = (...blockedBy: string[]): TourActionAvailability => ({ allowed: false, reason: 'no', blockedBy })
const allow: TourActionAvailability = { allowed: true, reason: null, blockedBy: [] }

function tour(state: TourDetails['tour']['state'], execution: Partial<NonNullable<TourDetails['execution']>> = {}, commandState?: RobotCommandState,
  actions: Partial<NonNullable<TourDetails['allowedActions']>> = {}, startedAt: string | null = '2026-11-04T02:00:00Z'): TourDetails {
  return {
    tour: { state }, startedAt,
    routeRevision: { endMode: 'POSE', stops: [{ id: 's1', name: 'Thư viện', stopOrder: 1 }, { id: 's2', name: 'Phòng lab', stopOrder: 2 }] },
    execution: { state, operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', currentLegId: 'leg-1', currentLegKind: 'TO_POI',
      currentRevisionStopId: null, lastArrivedRevisionStopId: null, dwellDeadlineAt: null,
      command: commandState ? { id: 'cmd-1', kind: 'GoTo', state: commandState, outcome: null, reasonCode: null } : null, ...execution },
    allowedActions: { start: refuse('tourReady'), next: refuse('TOUR_STATE_INVALID'), endEarly: allow, retryLeg: refuse('TOUR_RETRY_NOT_ALLOWED'), reconcile: refuse('COMMAND_STATE_INVALID'), ...actions },
  } as unknown as TourDetails
}
const assist = (reason: string) => ({ operationalStatus: 'NEEDS_ASSISTANCE' as const, assistanceReason: reason })

describe('the situation a Tour is in', () => {
  it('points at Next only while the robot is stopped at a POI, and at Pause while it is on a leg', () => {
    expect(tourSituation(tour('RUNNING', { currentStep: 'OBSERVING' }, 'ARRIVED')).action).toBe('next')
    for (const state of ['PENDING', 'DELIVERED', 'ACCEPTED'] as const) expect(tourSituation(tour('RUNNING', {}, state)).action).toBe('pause')
    expect(tourSituation(tour('RUNNING', {}, 'PENDING')).body).toMatch(/Robot chưa lấy lệnh nên chưa di chuyển/)
  })

  it('waits at the start of an opened Tour for the departure', () => {
    const start = tourSituation(tour('RUNNING', { currentStep: 'INITIALIZING', currentLegId: null, currentLegKind: null }))
    expect(start).toMatchObject({ action: 'depart', title: 'Chuẩn bị khởi hành', onlyEndEarly: false })
    expect(start.body).toMatch(/4 xác nhận/)
  })

  it('says a pause is in flight until the robot reports it stopped, then offers Resume and Skip', () => {
    const pausing = tour('RUNNING', {}, 'ACCEPTED')
    pausing.execution!.command!.cancelRequested = true
    expect(tourSituation(pausing)).toMatchObject({ action: null, title: 'Đang dừng…' })
    const paused = tourSituation(tour('RUNNING', { operationalStatus: 'PAUSED', currentRevisionStopId: 's1' }, 'CANCELLED'))
    expect(paused).toMatchObject({ action: 'retryLeg', secondary: ['skip'], tone: 'warn', title: 'Đã tạm dừng' })
    expect(paused.body).toMatch(/tới Thư viện/)
  })

  it('names the robot\'s own reason for a failed leg, not only the Tour\'s assistance reason', () => {
    const lost = tour('RUNNING', assist('NavigationFailed'), 'FAILED', { retryLeg: allow })
    lost.execution!.command!.reasonCode = 'LOCAL_LINK_LOSS'
    const situation = tourSituation(lost)
    expect(situation).toMatchObject({ action: 'retryLeg', secondary: ['skip'] })
    expect(situation.body).toMatch(/mất kết nối với máy chủ/)
  })

  it('says why the server holds a new command: what the robot reports', () => {
    const held = tourSituation(tour('RUNNING', {}, 'PENDING'), { localized: false, motionReady: true, faultCode: null })
    expect(held.tone).toBe('warn')
    expect(held.body).toMatch(/chưa định vị/)
    expect(tourSituation(tour('RUNNING', {}, 'PENDING'), { localized: true, motionReady: false, faultCode: 'ESTOP_ENGAGED' }).body).toMatch(/dừng khẩn cấp/)
  })

  it('names where Next, the departure and Skip go', () => {
    expect(tourTargets(tour('RUNNING', { currentStep: 'INITIALIZING' }))).toMatchObject({ next: 'Thư viện', skipped: 'Thư viện', afterSkip: 'Phòng lab' })
    expect(tourTargets(tour('RUNNING', { currentStep: 'OBSERVING', lastArrivedRevisionStopId: 's1', currentRevisionStopId: 's1' })))
      .toMatchObject({ next: 'Phòng lab', skipped: 'Phòng lab', afterSkip: 'điểm kết thúc' })
    expect(tourTargets(tour('RUNNING', { operationalStatus: 'PAUSED', currentRevisionStopId: 's1' }))).toMatchObject({ current: 'Thư viện', skipped: 'Thư viện', afterSkip: 'Phòng lab' })
  })

  it('reads the command before the assistance reason: an UNKNOWN command calls for Reconcile, never Retry', () => {
    const unknown = tourSituation(tour('RUNNING', assist('CommandUnknown'), 'UNKNOWN', { retryLeg: allow }))
    expect(unknown.action).toBe('reconcile')
    expect(tourSituation(tour('RUNNING', assist('CommandUnknown'), 'RECONCILED'))).toMatchObject({ action: null, onlyEndEarly: true })
  })

  it('follows the server on an EXPIRED leg: Retry when retryLeg is offered, End Early when it is ruled out', () => {
    const offered = tourSituation(tour('RUNNING', assist('CommandExpired'), 'EXPIRED', { retryLeg: allow }))
    expect(offered).toMatchObject({ action: 'retryLeg', onlyEndEarly: false })
    expect(offered.body).toMatch(/robot chưa nhận lệnh này/)
    expect(tourSituation(tour('RUNNING', assist('RobotDisconnected'), 'EXPIRED', { retryLeg: refuse('telemetryFresh') })).action).toBe('retryLeg')
    // The default fixture refuses with TOUR_RETRY_NOT_ALLOWED (e.g. the robot had taken the command): nothing is invented.
    expect(tourSituation(tour('RUNNING', assist('CommandExpired'), 'EXPIRED'))).toMatchObject({ action: null, onlyEndEarly: true })
  })

  it('offers Retry for a really ended leg, also while a movement check holds it, and not when the server rules it out', () => {
    expect(tourSituation(tour('RUNNING', assist('NavigationFailed'), 'FAILED', { retryLeg: allow })).action).toBe('retryLeg')
    expect(tourSituation(tour('RUNNING', assist('NavigationFailed'), 'FAILED', { retryLeg: refuse('telemetryFresh') })).action).toBe('retryLeg')
    expect(tourSituation(tour('RUNNING', assist('BackendRestarted'), 'CANCELLED'))).toMatchObject({ action: null, onlyEndEarly: true })
  })

  it('keeps an ended Tour with an UNKNOWN command open for Reconcile, and never claims the robot stopped', () => {
    expect(tourSituation(tour('CANCELLED', {}, 'UNKNOWN')).action).toBe('reconcile')
    const ended = tourSituation(tour('CANCELLED', {}, 'CANCELLED'))
    expect(ended).toMatchObject({ action: null, title: 'Tour đã kết thúc sớm' })
    expect(ended.body).toMatch(/Nếu robot còn đang đi lúc kết thúc, nó được giữ lại/)
    expect(tourSituation(tour('CANCELLED', {}, undefined, {}, null)).title).toBe('Tour đã bị hủy trước khi bắt đầu')
    expect(tourSituation(tour('COMPLETED', {}, 'ARRIVED')).tone).toBe('ok')
  })

  it('says what End Early does to the command the robot holds', () => {
    expect(endEarlyEffect(tour('RUNNING', {}, 'PENDING'))).toMatch(/rút lệnh lại/)
    expect(endEarlyEffect(tour('RUNNING', {}, 'ACCEPTED'))).toMatch(/lệnh hủy/)
    expect(endEarlyEffect(tour('RUNNING', {}, 'UNKNOWN'))).toMatch(/vẫn cần đối soát/)
    expect(endEarlyEffect(tour('RUNNING'))).toMatch(/đứng yên nên được trả ngay/)
    expect(endEarlyEffect(tour('RUNNING', {}, 'CANCELLED'))).toMatch(/đứng yên nên được trả ngay/)
  })
})
