import { describe, expect, it } from 'vitest'
import { applyRegistrationDeadline, registrationClosesAt, withRegistrationDeadline } from './registration-deadline'
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
    expect(closed.reason).toContain('Đã đóng đăng ký lúc 09:00')
    expect(closed.reason).toContain('48 giờ')
  })

  it('never reopens or rewords a gate the server already closed', () => {
    const server = { allowed: false, reason: 'Tour đã khóa đăng ký.' }
    expect(applyRegistrationDeadline(server, start, 0)).toBe(server)
    expect(applyRegistrationDeadline(server, start, Date.parse(start))).toBe(server)
  })

  it('closes edit and resubmit but leaves cancel to the server', () => {
    const registration = {
      summary: { tourScheduledStartAt: start },
      allowedActions: { edit: open, resubmit: open, cancel: open },
    } as unknown as RepresentativeRegistration
    const late = withRegistrationDeadline(registration, Date.parse(start) - 47 * hour)
    expect(late.allowedActions.edit.allowed).toBe(false)
    expect(late.allowedActions.resubmit.allowed).toBe(false)
    expect(late.allowedActions.cancel).toBe(open)
  })
})
