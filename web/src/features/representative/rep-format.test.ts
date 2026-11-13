import { describe, expect, it } from 'vitest'
import { closedNote, dayMonth, formatDateTime, formatTime, isClosedRegistration, isReviewExpired } from './rep-format'
import { buildRepNotices } from './rep-notices'
import type { RegistrationSummary } from './api/types'

describe('Representative Tour time', () => {
  it('uses Vietnam time across UTC midnight through the shared campus format', () => {
    expect(formatTime('2026-10-05T18:30:00Z')).toBe('01:30')
    expect(dayMonth('2026-10-05T18:30:00Z').day).toBe('06')
    expect(formatDateTime('2026-10-05T18:30:00Z')).toBe('06/10/2026 01:30')
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
  it('words the system auto-cancel for a Representative and never dates a cancelled Tour by the registration update', () => {
    // The exact text of TourAutoCancel.Reason in the backend.
    const note = closedNote({ ...base, state: 'APPROVED', tourState: 'CANCELLED', tourCancelReason: 'Không bắt đầu trong khung giờ, hệ thống tự huỷ.' })
    expect(note.reason).toBe('Buổi tham quan không bắt đầu đúng giờ nên đã bị huỷ. Đại học FPT sẽ liên hệ nếu sắp xếp lại.')
    expect(note.at).toBeNull()
  })
  it('says who ended it and why', () => {
    expect(closedNote({ ...base, state: 'CANCELLED' }).by).toBe('Đại diện')
    expect(closedNote({ ...base, state: 'APPROVED', tourState: 'CANCELLED' }).reason).toBe('Buổi tham quan đã bị hủy.')
    expect(closedNote({ ...base, state: 'APPROVED', tourState: 'CANCELLED', tourCancelReason: ' Robot cần bảo trì ' }).reason).toBe('Robot cần bảo trì')
    expect(closedNote({ ...base, state: 'REJECTED', tourState: 'READY', rejectionReason: ' Thiếu lớp ' }).reason).toBe('Thiếu lớp')
    expect(closedNote({ ...base, state: 'REJECTED', tourState: 'READY' }).reason).toBe('Đại học FPT không ghi lý do.')
  })

  // The exact text the backend's T-24h expiry stores (ADR-0048).
  const expired: RegistrationSummary = { ...base, state: 'REJECTED', rejectionReason: 'Hết hạn duyệt trước giờ tham quan 24 giờ.' }
  it('reads a T-24h expiry as expired, not refused, even while the Tour is still SCHEDULED', () => {
    expect(isClosedRegistration(expired)).toBe(true)
    expect(closedNote(expired)).toMatchObject({ badge: 'Hết hạn duyệt', reason: 'Hồ sơ chưa được duyệt trước giờ tham quan 24 giờ nên đã hết hạn.', at: null })
  })
  it('matches only that exact reason on a refused registration', () => {
    expect(isReviewExpired({ ...expired, rejectionReason: 'Hết hạn giấy tờ.' })).toBe(false)
    expect(isReviewExpired({ ...expired, state: 'SUBMITTED' })).toBe(false)
    expect(closedNote({ ...expired, rejectionReason: 'Thiếu lớp', tourState: 'READY' }).badge).toBe('Bị từ chối')
  })
  it('notifies an expiry as an expiry, with nothing to update', () => {
    const [notice] = buildRepNotices([expired], Date.parse('2026-10-19T03:00:00Z'))
    expect(notice).toMatchObject({ title: 'Hết hạn duyệt', detail: 'Hồ sơ chưa được duyệt trước giờ tham quan 24 giờ nên đã hết hạn.', toLabel: 'Xem hồ sơ' })
  })
})
