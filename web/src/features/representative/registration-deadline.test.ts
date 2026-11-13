import { describe, expect, it } from 'vitest'
import { applyRegistrationDeadline, newRosterRowsAllowed, registrationClosesAt, withRegistrationDeadline } from './registration-deadline'
import type { RepresentativeRegistration } from './api/types'

const start = '2026-11-10T02:00:00.000Z' // 09:00 UTC+7
const open = { allowed: true, reason: null }
const hour = 3_600_000

describe('registration deadline (48 hours before start)', () => {
  it('closes exactly 48 hours before the Tour starts', () => {
    expect(registrationClosesAt(start).toISOString()).toBe('2026-11-08T02:00:00.000Z')
  })

  it('keeps an open gate open until the deadline, then closes it with the time', () => {
    const closesAt = registrationClosesAt(start).getTime()
    expect(applyRegistrationDeadline(open, start, closesAt - 1)).toBe(open)
    const closed = applyRegistrationDeadline(open, start, closesAt)
    expect(closed.allowed).toBe(false)
    expect(closed.reason).toContain('Đã đóng đăng ký lúc 08/11/2026 09:00')
    expect(closed.reason).toContain('48 giờ')
  })

  it('uses the deadline the server sends, so a short-notice Tour closes at its start', () => {
    const tour = { scheduledStartAt: start, registrationClosesAt: start }
    expect(registrationClosesAt(tour).toISOString()).toBe(start)
    expect(newRosterRowsAllowed(tour, Date.parse(start) - 1)).toBe(true)
    expect(newRosterRowsAllowed(tour, Date.parse(start))).toBe(false)
    expect(applyRegistrationDeadline(open, tour, Date.parse(start) - hour)).toBe(open)
    const closed = applyRegistrationDeadline(open, tour, Date.parse(start))
    expect(closed.allowed).toBe(false)
    expect(closed.reason).not.toContain('48 giờ')
  })

  it('never reopens or rewords a gate the server already closed', () => {
    const server = { allowed: false, reason: 'Tour đã khóa đăng ký.' }
    expect(applyRegistrationDeadline(server, start, 0)).toBe(server)
    expect(applyRegistrationDeadline(server, start, Date.parse(start))).toBe(server)
  })

  it('leaves existing-row edits, resubmission and cancellation to server gates after cutoff', () => {
    const registration = {
      summary: { tourScheduledStartAt: start },
      allowedActions: { edit: open, resubmit: open, cancel: open },
    } as unknown as RepresentativeRegistration
    const late = withRegistrationDeadline(registration)
    expect(late.allowedActions.edit.allowed).toBe(true)
    expect(late.allowedActions.resubmit.allowed).toBe(true)
    expect(late.allowedActions.cancel).toBe(open)
    expect(newRosterRowsAllowed(start, Date.parse(start) - 49 * hour)).toBe(true)
    expect(newRosterRowsAllowed(start, Date.parse(start) - 48 * hour)).toBe(false)
    expect(newRosterRowsAllowed(start, Date.parse(start) - 47 * hour)).toBe(false)
  })
})
