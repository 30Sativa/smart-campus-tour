import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../api/client'
import { accountInUseBlockers } from '../accounts/errors'
import { earlyReadyWarning, seatsLabel, seatsLeft } from './tour-messages'

describe('seatsLabel', () => {
  it('prints the seats left out of the capacity', () => {
    expect(seatsLabel({ capacity: 20, heldSeats: 8 })).toBe('Còn 12/20 chỗ')
  })
  it('never prints a negative number for a Tour above its capacity', () => {
    expect(seatsLabel({ capacity: 20, heldSeats: 25 })).toBe('Còn 0/20 chỗ')
  })
  it('stays silent when the server has not sent seats', () => {
    expect(seatsLabel({})).toBeNull()
  })
})

describe('seatsLeft', () => {
  it('uses the same rule as the label and stays silent without seats', () => {
    expect(seatsLeft({ capacity: 20, heldSeats: 19 })).toBe(1)
    expect(seatsLeft({ capacity: 20, heldSeats: 25 })).toBe(0)
    expect(seatsLeft({ capacity: 20 })).toBeNull()
  })
})

describe('earlyReadyWarning', () => {
  // 19/11/2026 08:15 in Vietnam (UTC+7).
  const tour = { state: 'SCHEDULED' as const, scheduledStartAt: '2026-11-21T01:15:00Z', registrationClosesAt: '2026-11-19T01:15:00Z', capacity: 20, heldSeats: 19 }
  const before = Date.parse('2026-11-16T03:00:00Z')
  const after = Date.parse('2026-11-20T03:00:00Z')
  it('says the deadline and the seats left when a Tour on a shift is closed early', () => {
    expect(earlyReadyWarning(tour, before)).toBe('Hạn đăng ký là 19/11/2026 08:15 và Tour còn 1 chỗ. Chốt bây giờ sẽ đóng đăng ký sớm: trường khác không đăng ký thêm được. Có thể mở lại trước giờ bắt đầu.')
  })
  it('still warns after the deadline while seats are free', () => {
    expect(earlyReadyWarning(tour, after)).toMatch(/^Hạn đăng ký là 19\/11\/2026 08:15 và Tour còn 1 chỗ\./)
  })
  it('stays silent after the deadline with no seat free, and for a quick Tour', () => {
    expect(earlyReadyWarning({ ...tour, heldSeats: 20 }, after)).toBeNull()
    expect(earlyReadyWarning({ ...tour, isShortNotice: true }, before)).toBeNull()
  })
  it('leaves the seats out when the server sends none', () => {
    expect(earlyReadyWarning({ ...tour, capacity: undefined, heldSeats: undefined }, before)).toMatch(/^Hạn đăng ký là 19\/11\/2026 08:15\. Chốt bây giờ/)
  })
})

describe('accountInUseBlockers', () => {
  const conflict = (errors: unknown) => new ApiError(409, JSON.stringify({ success: false, message: 'x', errors }))
  it('lists what still depends on the account', () => {
    const error = conflict({ code: 'ACCOUNT_IN_USE', blockers: [{ code: 'TOUR_OPERATOR', message: 'Đang vận hành Tour A' }] })
    expect(accountInUseBlockers(error)).toEqual(['Đang vận hành Tour A'])
  })
  it('is empty for any other conflict', () => {
    expect(accountInUseBlockers(conflict({ code: 'CONFLICT' }))).toEqual([])
    expect(accountInUseBlockers(new Error('offline'))).toEqual([])
  })
})
