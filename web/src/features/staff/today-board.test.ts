import { describe, expect, it } from 'vitest'
import type { TourOperation } from '../../api/contracts/staff'
import { dayWindow, defaultTour, laneOf, matchesSearch, percentOf, tourNote, tourSpan } from './today-board'

const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m).toISOString()

function tour(overrides: Partial<TourOperation> = {}): TourOperation {
  return {
    id: 'tour-x',
    code: 'T-X',
    name: 'Tham quan từ xa',
    routeName: 'Tuyến khám phá',
    scheduledAt: at(10),
    estimatedEndAt: at(10, 35),
    state: 'Scheduled',
    readyBlockers: [],
    language: 'Tiếng Việt',
    registrations: [],
    stops: [],
    endPoint: { name: 'Sảnh chính', position: { x: 0, y: 0 } },
    livestream: { state: 'Offline' },
    startChecks: [],
    allowedActions: {
      start: { allowed: false, reason: 'Đang phục vụ T-01' },
      hold: { allowed: false }, next: { allowed: false }, endEarly: { allowed: false }, retryLeg: { allowed: false },
      rerunPoi: { allowed: false }, retryFront: { allowed: false }, confirmComplete: { allowed: false },
    },
    revision: 1,
    ...overrides,
  }
}

describe('today board', () => {
  it('puts each state in its lane', () => {
    expect(laneOf('Running')).toBe('running')
    expect(laneOf('Ready')).toBe('upcoming')
    expect(laneOf('Scheduled')).toBe('upcoming')
    expect(laneOf('Completed')).toBe('done')
    expect(laneOf('Cancelled')).toBe('done')
  })

  it('draws 07:00-22:00 and widens to whole hours for an early or late session', () => {
    expect(dayWindow([tour()])).toEqual({ from: 7 * 60, to: 22 * 60 })
    expect(dayWindow([tour({ scheduledAt: at(6, 30), estimatedEndAt: at(7, 5) }), tour({ scheduledAt: at(22, 10), estimatedEndAt: at(22, 45) })])).toEqual({ from: 6 * 60, to: 23 * 60 })
    expect(percentOf(7 * 60, { from: 7 * 60, to: 22 * 60 })).toBe(0)
    expect(percentOf(23 * 60, { from: 7 * 60, to: 22 * 60 })).toBe(100)
  })

  it('spans a session to its real end once it has one', () => {
    expect(tourSpan(tour({ endedAt: at(10, 20) }))).toEqual({ start: 600, end: 620 })
    expect(tourSpan(tour())).toEqual({ start: 600, end: 635 })
  })

  it('says what holds a session back, in the server words', () => {
    expect(tourNote(tour({ state: 'Ready' }))).toEqual({ tone: 'warn', text: 'Chưa bắt đầu được: Đang phục vụ T-01' })
    expect(tourNote(tour({ readyBlockers: ['Còn 1 đăng ký chờ duyệt'] })).text).toBe('Còn 1 đăng ký chờ duyệt')
    expect(tourNote(tour({ state: 'Cancelled', endReason: 'Trường báo trùng lịch.' }))).toEqual({ tone: 'danger', text: 'Trường báo trùng lịch.' })
    expect(tourNote(tour({ state: 'Running', operationalStatus: 'NeedsAssistance', reason: 'HeadFailure' })).text).toBe('Cần hỗ trợ · Lỗi đầu xoay')
  })

  it('opens the running session first, else the next one to start', () => {
    const now = new Date(at(12)).getTime()
    const done = tour({ id: 'a', state: 'Completed', scheduledAt: at(9) })
    const next = tour({ id: 'b', state: 'Ready', scheduledAt: at(13) })
    const running = tour({ id: 'c', state: 'Running', scheduledAt: at(11, 50) })
    expect(defaultTour([done, next, running], now)?.id).toBe('c')
    expect(defaultTour([done, next], now)?.id).toBe('b')
    expect(defaultTour([done], now)?.id).toBe('a')
  })

  it('finds a session by code, name, route or school', () => {
    const t = tour({ registrations: [{ id: 'r', schoolName: 'THPT Gia Định', representativeName: 'Thầy Nam', state: 'Approved', studentCount: 30, roster: [] }] })
    expect(matchesSearch(t, 'gia định')).toBe(true)
    expect(matchesSearch(t, 't-x')).toBe(true)
    expect(matchesSearch(t, 'không có')).toBe(false)
  })
})
