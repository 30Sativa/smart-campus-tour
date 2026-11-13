import { describe, expect, it } from 'vitest'
import {
  campusDateKey, formatDate, formatDateTime, formatDuration, formatDurationBetween, formatRelative, formatTime,
  isoToDisplay, maskDateText, parseDisplayDate,
} from './date-time'

// 23:30 UTC on 12/11 is already 06:30 on 13/11 on campus: proves the zone is fixed, not the machine's.
const LATE_UTC = '2026-11-12T23:30:00Z'

describe('campus date and time formats', () => {
  it('prints dd/MM/yyyy HH:mm in Asia/Ho_Chi_Minh', () => {
    expect(formatDateTime(LATE_UTC)).toBe('13/11/2026 06:30')
    expect(formatDateTime('2026-11-13T07:05:00Z')).toBe('13/11/2026 14:05')
    expect(formatDate(LATE_UTC)).toBe('13/11/2026')
    expect(formatTime(LATE_UTC)).toBe('06:30')
    expect(formatTime(new Date('2026-11-13T12:00:00Z'))).toBe('19:00')
  })

  it('adds the Vietnamese weekday when asked', () => {
    expect(formatDate(LATE_UTC, { weekday: 'short' })).toBe('T6 13/11/2026')
    expect(formatDate(LATE_UTC, { weekday: 'long' })).toBe('Thứ sáu, 13/11/2026')
    expect(formatDate('2026-11-15T03:00:00Z', { weekday: 'short' })).toBe('CN 15/11/2026')
  })

  it('prints "-" for a missing or broken value', () => {
    for (const value of [null, undefined, '', 'not a date']) {
      expect(formatDateTime(value)).toBe('-')
      expect(formatDate(value)).toBe('-')
      expect(formatTime(value)).toBe('-')
      expect(formatRelative(value)).toBe('-')
    }
    expect(campusDateKey(null)).toBe('')
  })

  it('gives the campus calendar day as yyyy-mm-dd', () => {
    expect(campusDateKey(LATE_UTC)).toBe('2026-11-13')
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-11-13T10:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('reads in whole units, past and future', () => {
    expect(formatRelative(ago(20_000), now)).toBe('vừa xong')
    expect(formatRelative(ago(5 * 60_000), now)).toBe('5 phút trước')
    expect(formatRelative(ago(59488.2 * 1000), now)).toBe('16 giờ trước')
    expect(formatRelative(ago(3 * 86_400_000), now)).toBe('3 ngày trước')
    expect(formatRelative(ago(-12 * 60_000), now)).toBe('sau 12 phút')
    expect(formatRelative(ago(-2 * 86_400_000), now)).toBe('sau 2 ngày')
  })

  it('falls back to the date after a month', () => {
    expect(formatRelative(ago(45 * 86_400_000), now)).toBe('29/09/2026')
  })
})

describe('formatDuration', () => {
  it('uses at most two units', () => {
    expect(formatDuration(45)).toBe('45 giây')
    expect(formatDuration(12 * 60 + 5)).toBe('12 phút')
    expect(formatDuration(3600)).toBe('1 giờ')
    expect(formatDuration(59488.2)).toBe('16 giờ 31 phút')
    expect(formatDuration(2 * 86_400 + 3 * 3600)).toBe('2 ngày 3 giờ')
    expect(formatDuration(null)).toBe('-')
    expect(formatDuration(-1)).toBe('-')
  })

  it('measures between two instants', () => {
    expect(formatDurationBetween('2026-11-13T07:00:00Z', '2026-11-13T07:45:00Z')).toBe('45 phút')
    expect(formatDurationBetween('2026-11-13T07:00:00Z', null)).toBe('-')
  })
})

describe('typed dd/mm/yyyy dates', () => {
  it('masks digits into dd/mm/yyyy', () => {
    expect(maskDateText('1')).toBe('1')
    expect(maskDateText('131')).toBe('13/1')
    expect(maskDateText('13112026')).toBe('13/11/2026')
    expect(maskDateText('13/11/2026999')).toBe('13/11/2026')
    expect(maskDateText('2026-11-13')).toBe('13/11/2026')
  })

  it('parses only real calendar dates', () => {
    expect(parseDisplayDate('13/11/2026')).toBe('2026-11-13')
    expect(parseDisplayDate('29/02/2028')).toBe('2028-02-29')
    expect(parseDisplayDate('29/02/2026')).toBe('')
    expect(parseDisplayDate('31/04/2026')).toBe('')
    expect(parseDisplayDate('13/13/2026')).toBe('')
    expect(parseDisplayDate('13/11/20')).toBe('')
  })

  it('turns an ISO day round for display', () => {
    expect(isoToDisplay('2026-11-13')).toBe('13/11/2026')
    expect(isoToDisplay('')).toBe('')
  })
})
