import { describe, expect, it } from 'vitest'
import type { RobotCommandState, TourActionAvailability, TourDetails } from '../../administration/tours/types'
import { endEarlyEffect, tourSituation } from './situation'

const refuse = (...blockedBy: string[]): TourActionAvailability => ({ allowed: false, reason: 'no', blockedBy })
const allow: TourActionAvailability = { allowed: true, reason: null, blockedBy: [] }

function tour(state: TourDetails['tour']['state'], execution: Partial<NonNullable<TourDetails['execution']>> = {}, commandState?: RobotCommandState,
  actions: Partial<NonNullable<TourDetails['allowedActions']>> = {}, startedAt: string | null = '2026-11-04T02:00:00Z'): TourDetails {
  return {
    tour: { state }, startedAt,
    execution: { state, operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', currentLegId: 'leg-1', currentLegKind: 'TO_POI',
      currentRevisionStopId: null, lastArrivedRevisionStopId: null, dwellDeadlineAt: null,
      command: commandState ? { id: 'cmd-1', kind: 'GoTo', state: commandState, outcome: null, reasonCode: null } : null, ...execution },
    allowedActions: { start: refuse('tourReady'), next: refuse('TOUR_STATE_INVALID'), endEarly: allow, retryLeg: refuse('TOUR_RETRY_NOT_ALLOWED'), reconcile: refuse('COMMAND_STATE_INVALID'), ...actions },
  } as unknown as TourDetails
}
const assist = (reason: string) => ({ operationalStatus: 'NEEDS_ASSISTANCE' as const, assistanceReason: reason })

describe('the situation a Tour is in', () => {
  it('points at Next only while the robot is stopped at a POI', () => {
    expect(tourSituation(tour('RUNNING', { currentStep: 'OBSERVING' }, 'ARRIVED')).action).toBe('next')
    for (const state of ['PENDING', 'DELIVERED', 'ACCEPTED'] as const) expect(tourSituation(tour('RUNNING', {}, state)).action).toBeNull()
    expect(tourSituation(tour('RUNNING', {}, 'PENDING')).body).toMatch(/robot chưa di chuyển vì lệnh này/)
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
    expect(ended.body).toMatch(/không xác nhận robot đã dừng/)
    expect(tourSituation(tour('CANCELLED', {}, undefined, {}, null)).title).toBe('Tour đã bị hủy trước khi bắt đầu')
    expect(tourSituation(tour('COMPLETED', {}, 'ARRIVED')).tone).toBe('ok')
  })

  it('says what End Early does to the command the robot holds', () => {
    expect(endEarlyEffect(tour('RUNNING', {}, 'PENDING'))).toMatch(/rút lệnh lại/)
    expect(endEarlyEffect(tour('RUNNING', {}, 'ACCEPTED'))).toMatch(/lệnh hủy/)
    expect(endEarlyEffect(tour('RUNNING', {}, 'UNKNOWN'))).toMatch(/vẫn cần đối soát/)
    expect(endEarlyEffect(tour('RUNNING'))).toMatch(/không còn lệnh di chuyển/)
  })
})
