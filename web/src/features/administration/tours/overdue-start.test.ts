import { describe, expect, it } from 'vitest'
import { overdueStartLabel } from './overdue-start'

const start = '2026-11-07T01:15:00.000Z' // 08:15 campus time
const at = (iso: string) => new Date(iso).getTime()
const hold = { endsAt: '2026-11-07T03:00:00.000Z' } // 10:00 campus time

describe('overdueStartLabel', () => {
  it('stays silent inside the Start window', () => {
    expect(overdueStartLabel({ state: 'READY', scheduledStartAt: start }, hold, at('2026-11-07T01:30:00.000Z'))).toBeNull()
  })

  it('names the end of the robot hold once the Start window has closed', () => {
    expect(overdueStartLabel({ state: 'READY', scheduledStartAt: start }, hold, at('2026-11-07T01:31:00.000Z')))
      .toBe('Quá giờ bắt đầu · tự huỷ lúc 10:00')
    expect(overdueStartLabel({ state: 'SCHEDULED', scheduledStartAt: start }, null, at('2026-11-07T01:31:00.000Z')))
      .toBe('Quá giờ bắt đầu · tự huỷ lúc 08:30')
  })

  it('never labels a Tour that started or ended', () => {
    for (const state of ['RUNNING', 'COMPLETED', 'CANCELLED'] as const)
      expect(overdueStartLabel({ state, scheduledStartAt: start }, hold, at('2026-11-07T05:00:00.000Z'))).toBeNull()
  })
})
