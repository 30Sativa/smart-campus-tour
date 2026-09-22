import { beforeEach, describe, expect, it } from 'vitest'
import * as admin from './admin-sim'
import * as world from './staff-sim'

/**
 * The administration rules the mock server plays, which in the real system
 * are the backend's (scope §3, §5.2, §5.5). Scenarios A–D are the fixtures
 * the admin screens are demonstrated with.
 */
const ACTOR = 'admin'
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    if (error instanceof admin.AdminRejection) return error.body.code
    throw error
  }
  return 'ok'
}
const inAnHour = () => new Date(Date.now() + 60 * 60_000).toISOString()

describe('admin rules on the shared world', () => {
  beforeEach(() => world.resetSim())

  it('A: a Scheduled Tour with a group waiting cannot be finalized, and says exactly why', () => {
    const tour = admin.getTour('tour-03')
    expect(tour.state).toBe('Scheduled')
    expect(tour.counts).toMatchObject({ approved: 2, submitted: 1 })
    expect(tour.allowedActions.finalize.allowed).toBe(false)
    const waiting = tour.readyChecklist.find((check) => check.id === 'noSubmitted')
    expect(waiting).toMatchObject({ passed: false, detail: 'Còn 1 đăng ký chờ duyệt: THPT Bùi Thị Xuân' })
    expect(code(() => admin.finalizeTour('tour-03', tour.version, ACTOR))).toBe('NotAllowed')
  })

  it('B: with nothing waiting it finalizes to Ready, which Staff then sees', () => {
    const tour = admin.getTour('tour-05')
    expect(tour.counts).toMatchObject({ approved: 2, submitted: 0 })
    expect(tour.readyChecklist.every((check) => check.passed)).toBe(true)
    admin.finalizeTour('tour-05', tour.version, ACTOR)
    expect(world.tourView(world.tourById('tour-05')!).state).toBe('Ready')
    // Ready closes review: decisions need a re-open first.
    expect(admin.getTour('tour-05').registrations[0].allowedActions.approve.allowed).toBe(false)
    expect(admin.getTour('tour-05').allowedActions.edit.allowed).toBe(false)
  })

  it('C: re-opening a Ready Tour keeps approved groups approved', () => {
    const tour = admin.getTour('tour-02')
    expect(tour.allowedActions.reopen.allowed).toBe(true)
    admin.reopenTour('tour-02', tour.version, ACTOR)
    const reopened = admin.getTour('tour-02')
    expect(reopened.state).toBe('Scheduled')
    expect(reopened.registrations.every((reg) => reg.state === 'Approved')).toBe(true)
  })

  it('D: a Running Tour is read-only for Admin; ending it is Staff End Early', () => {
    const tour = admin.getTour('tour-01')
    expect(tour.state).toBe('Running')
    expect(Object.values(tour.allowedActions).every((gate) => !gate.allowed)).toBe(true)
    expect(tour.allowedActions.cancel.reason).toMatch(/Kết thúc sớm/)
    expect(code(() => admin.cancelTour('tour-01', 'thử', tour.version, ACTOR))).toBe('NotAllowed')
  })

  it('refuses a stale version instead of acting on old data', () => {
    const tour = admin.getTour('tour-05')
    expect(code(() => admin.finalizeTour('tour-05', tour.version - 1, ACTOR))).toBe('StaleData')
  })

  it('approving a group never makes the Tour Ready; approving the last one makes it finalizable', () => {
    const reg = admin.getRegistration('reg-07')
    expect(reg.resubmittedAfterApproval).toBe(true)
    admin.approveRegistration('reg-07', reg.version, ACTOR)
    const tour = admin.getTour('tour-03')
    expect(tour.state).toBe('Scheduled')
    expect(tour.allowedActions.finalize.allowed).toBe(true)
  })

  it('detects a roster replaced while Admin was reviewing, then accepts after reload', () => {
    const seen = admin.getRegistration('reg-14')
    expect(code(() => admin.approveRegistration('reg-14', seen.version, ACTOR))).toBe('StaleData')
    const reloaded = admin.getRegistration('reg-14')
    expect(reloaded.roster.length).toBe(seen.roster.length + 2)
    admin.approveRegistration('reg-14', reloaded.version, ACTOR)
    expect(admin.getRegistration('reg-14').state).toBe('Approved')
  })

  it('needs a reason to reject, and keeps it for the representative', () => {
    const reg = admin.getRegistration('reg-07')
    expect(code(() => admin.rejectRegistration('reg-07', '  ', reg.version, ACTOR))).toBe('Validation')
    admin.rejectRegistration('reg-07', 'Thiếu lớp', reg.version, ACTOR)
    expect(admin.getRegistration('reg-07')).toMatchObject({ state: 'Rejected', rejectionReason: 'Thiếu lớp' })
  })

  it('a failed e-mail leaves the group Approved and can be sent again', () => {
    expect(code(() => admin.sendInvitation('reg-09', ACTOR))).toBe('EmailFailed')
    expect(admin.getRegistration('reg-09')).toMatchObject({ state: 'Approved', invitationFailed: true, invitationSentAt: null })
    admin.sendInvitation('reg-09', ACTOR)
    const sent = admin.getRegistration('reg-09')
    expect(sent.invitationFailed).toBe(false)
    expect(sent.invitationSentAt).toBeTruthy()
    expect(admin.invitationPreview('reg-09').recipient).toBe(sent.contactEmail)
  })

  it('sends only for approved groups of a Tour that has not run', () => {
    expect(code(() => admin.sendInvitation('reg-07', ACTOR))).toBe('NotAllowed')
    expect(code(() => admin.sendInvitation('reg-01', ACTOR))).toBe('NotAllowed')
  })

  it('creates a Scheduled Tour with no robot, once per request id, and validates per field', () => {
    const bad = (() => {
      try {
        admin.createTour({ name: '', scheduledAt: '', description: '', routeId: 'labs' }, 'req-bad', ACTOR)
      } catch (error) {
        return (error as admin.AdminRejection).body.fieldErrors
      }
    })()
    expect(Object.keys(bad ?? {}).sort()).toEqual(['description', 'name', 'routeId', 'scheduledAt'])

    const input = { name: 'Tour thử', scheduledAt: inAnHour(), description: 'Mô tả', routeId: 'main' }
    const first = admin.createTour(input, 'req-1', ACTOR)
    const again = admin.createTour(input, 'req-1', ACTOR)
    expect(again.id).toBe(first.id)
    expect(first.state).toBe('Scheduled')
    expect(world.tourById(first.id)?.robotId).toBeNull()
    expect(admin.getTour(first.id).readyChecklist.find((check) => check.id === 'hasApproved')?.passed).toBe(false)
  })

  it('edits only while Scheduled', () => {
    const input = { name: 'Đổi tên', scheduledAt: inAnHour(), description: 'x', routeId: 'main' }
    expect(code(() => admin.updateTour('tour-02', input, admin.getTour('tour-02').version, ACTOR))).toBe('NotAllowed')
    admin.updateTour('tour-03', input, admin.getTour('tour-03').version, ACTOR)
    expect(admin.getTour('tour-03').name).toBe('Đổi tên')
  })

  it('flags a route whose config is incomplete', () => {
    const tour = admin.getTour('tour-07')
    expect(tour.readyChecklist.find((check) => check.id === 'poiConfigValid')).toMatchObject({ passed: false, detail: 'Innovation Space: thiếu audio thuyết minh' })
    expect(admin.listRoutes().find((route) => route.id === 'labs')?.valid).toBe(false)
  })

  it('cancels a Tour that has not run, with a reason, and keeps it', () => {
    const tour = admin.getTour('tour-06')
    expect(code(() => admin.cancelTour('tour-06', '', tour.version, ACTOR))).toBe('Validation')
    admin.cancelTour('tour-06', 'Trùng lịch', tour.version, ACTOR)
    const cancelled = admin.getTour('tour-06')
    expect(cancelled.state).toBe('Cancelled')
    expect(cancelled.endReason).toMatch(/Trùng lịch/)
  })
})
