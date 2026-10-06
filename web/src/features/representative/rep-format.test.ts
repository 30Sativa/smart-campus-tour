import { describe, expect, it } from 'vitest'
import { dayMonth, formatDateTime, formatTime } from './rep-format'

describe('Representative Tour time', () => {
  it('uses Vietnam time across UTC midnight and includes the published timezone', () => {
    expect(formatTime('2026-10-05T18:30:00Z')).toBe('01:30')
    expect(dayMonth('2026-10-05T18:30:00Z').day).toBe('06')
    expect(formatDateTime('2026-10-05T18:30:00Z')).toContain('06/10/2026 (UTC+7)')
  })
})
