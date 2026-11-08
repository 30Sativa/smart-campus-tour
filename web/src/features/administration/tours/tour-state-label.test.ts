import { describe, expect, it } from 'vitest'
import { isRegistrationClosed, tourStateLabel } from './tour-messages'

const START = '2026-11-10T02:00:00.000Z'
const at = (iso: string) => new Date(iso).getTime()
const scheduled = { state: 'SCHEDULED' as const, scheduledStartAt: START }

describe('the SCHEDULED label by time', () => {
  it('is open until the 48 hour mark and closed from it, when the server sends no mark', () => {
    expect(tourStateLabel(scheduled, at('2026-11-08T01:59:59.000Z'))).toBe('Đang nhận đăng ký')
    expect(tourStateLabel(scheduled, at('2026-11-08T02:00:00.000Z'))).toBe('Đã đóng đăng ký')
  })

  it('prefers the mark the server sends', () => {
    const tour = { ...scheduled, registrationClosesAt: '2026-11-09T00:00:00.000Z' }
    expect(tourStateLabel(tour, at('2026-11-08T23:59:59.000Z'))).toBe('Đang nhận đăng ký')
    expect(tourStateLabel(tour, at('2026-11-09T00:00:00.000Z'))).toBe('Đã đóng đăng ký')
  })

  it('never changes the label of any other state', () => {
    const late = at('2026-11-10T00:00:00.000Z')
    expect(tourStateLabel({ state: 'READY', scheduledStartAt: START }, late)).toBe('Đã chốt')
    expect(tourStateLabel({ state: 'CANCELLED', scheduledStartAt: START }, late)).toBe('Đã hủy')
    expect(isRegistrationClosed({ state: 'READY', scheduledStartAt: START }, late)).toBe(false)
  })
})
