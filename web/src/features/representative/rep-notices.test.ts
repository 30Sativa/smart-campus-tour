import { describe, expect, it } from 'vitest'
import { buildRepNotices } from './rep-notices'
import type { RegistrationSummary } from './api/types'

const NOW = Date.parse('2026-10-09T03:00:00Z')
const row = (over: Partial<RegistrationSummary>): RegistrationSummary => ({
  id: 'r1', tourId: 't1', tourName: 'Buổi A', tourScheduledStartAt: '2026-10-20T02:00:00Z', tourState: 'SCHEDULED',
  schoolName: 'THPT X', groupName: 'Lớp 12A1', state: 'SUBMITTED', rowCount: 30,
  submittedAt: '2026-10-01T02:00:00Z', updatedAt: '2026-10-02T02:00:00Z', ...over,
})

describe('buildRepNotices', () => {
  it('ignores the representative\'s own pending and cancelled registrations', () => {
    expect(buildRepNotices([row({}), row({ id: 'r2', state: 'CANCELLED' })], NOW)).toEqual([])
  })

  it('reports review results with a link to the registration', () => {
    const [notice] = buildRepNotices([row({ state: 'REJECTED' })], NOW)
    expect(notice).toMatchObject({ tone: 'bad', title: 'Đơn đăng ký bị từ chối', to: '/dai-dien/dang-ky/r1', subject: 'Buổi A · Lớp 12A1' })
    expect(buildRepNotices([row({ state: 'APPROVED' })], NOW).map((n) => n.title)).toEqual(['Đơn đăng ký đã được duyệt'])
  })

  it('pins a reminder within 24 hours of the start and announces the finalised list', () => {
    const notices = buildRepNotices([row({ state: 'APPROVED', tourState: 'READY', tourScheduledStartAt: '2026-10-09T08:00:00Z' })], NOW)
    expect(notices[0]).toMatchObject({ tone: 'warn', pinned: true })
    expect(notices[0].title).toMatch(/^Sắp diễn ra lúc .+ hôm nay$/)
    expect(notices.map((n) => n.id)).toEqual(expect.arrayContaining(['r1:approved', 'r1:ready', 'r1:soon']))
  })

  it('tells about cancelled, running and finished Tours', () => {
    expect(buildRepNotices([row({ state: 'APPROVED', tourState: 'CANCELLED' })], NOW)[0].title).toBe('Buổi tham quan đã bị hủy')
    expect(buildRepNotices([row({ state: 'APPROVED', tourState: 'RUNNING' })], NOW)[0]).toMatchObject({ tone: 'info', pinned: true })
    expect(buildRepNotices([row({ state: 'APPROVED', tourState: 'COMPLETED' })], NOW)[0].tone).toBe('mute')
  })

  it('orders newest first after pinned notices', () => {
    const notices = buildRepNotices([
      row({ id: 'old', state: 'APPROVED', updatedAt: '2026-10-01T00:00:00Z' }),
      row({ id: 'new', state: 'REJECTED', updatedAt: '2026-10-08T00:00:00Z' }),
      row({ id: 'live', state: 'APPROVED', tourState: 'RUNNING', tourScheduledStartAt: '2026-09-01T00:00:00Z' }),
    ], NOW)
    expect(notices.map((n) => n.id.split(':')[0])).toEqual(['live', 'new', 'old'])
  })
})
