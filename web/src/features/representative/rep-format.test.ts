import { describe, expect, it } from 'vitest'
import { closedNote, dayMonth, formatDateTime, formatTime, isClosedRegistration } from './rep-format'
import type { RegistrationSummary } from './api/types'

describe('Representative Tour time', () => {
  it('uses Vietnam time across UTC midnight and includes the published timezone', () => {
    expect(formatTime('2026-10-05T18:30:00Z')).toBe('01:30')
    expect(dayMonth('2026-10-05T18:30:00Z').day).toBe('06')
    expect(formatDateTime('2026-10-05T18:30:00Z')).toContain('06/10/2026 (UTC+7)')
  })
})

describe('Đăng ký của tôi groups', () => {
  const base: RegistrationSummary = { id: 'r', tourId: 't', tourName: 'Tour', tourScheduledStartAt: '2026-10-20T02:00:00Z', tourState: 'SCHEDULED',
    schoolName: 'Trường', groupName: 'Đoàn', state: 'SUBMITTED', rowCount: 1, submittedAt: '2026-10-01T02:00:00Z', updatedAt: '2026-10-02T02:00:00Z' }
  it('matches the backend rule: cancelled, Tour cancelled, or refused after the Tour closed', () => {
    expect(isClosedRegistration(base)).toBe(false)
    expect(isClosedRegistration({ ...base, state: 'REJECTED' })).toBe(false)
    expect(isClosedRegistration({ ...base, state: 'APPROVED', tourState: 'COMPLETED' })).toBe(false)
    expect(isClosedRegistration({ ...base, state: 'CANCELLED' })).toBe(true)
    expect(isClosedRegistration({ ...base, state: 'APPROVED', tourState: 'CANCELLED' })).toBe(true)
    expect(isClosedRegistration({ ...base, state: 'REJECTED', tourState: 'READY' })).toBe(true)
  })
  it('says who ended it and why', () => {
    expect(closedNote({ ...base, state: 'CANCELLED' }).by).toBe('Đại diện')
    expect(closedNote({ ...base, state: 'APPROVED', tourState: 'CANCELLED' }).reason).toBe('Buổi tham quan đã bị hủy.')
    expect(closedNote({ ...base, state: 'APPROVED', tourState: 'CANCELLED', tourCancelReason: ' Robot cần bảo trì ' }).reason).toBe('Robot cần bảo trì')
    expect(closedNote({ ...base, state: 'REJECTED', tourState: 'READY', rejectionReason: ' Thiếu lớp ' }).reason).toBe('Thiếu lớp')
    expect(closedNote({ ...base, state: 'REJECTED', tourState: 'READY' }).reason).toBe('Nhà trường không ghi lý do.')
  })
})
