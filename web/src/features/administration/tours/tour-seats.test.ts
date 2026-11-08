import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../api/client'
import { accountInUseBlockers } from '../accounts/errors'
import { seatsLabel } from './tour-messages'

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
