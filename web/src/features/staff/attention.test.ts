import { describe, expect, it } from 'vitest'
import type { AmrStatus, StaffActions, TourOperation } from '../../api/contracts/staff'
import { buildAttentionQueue, groupSummary, operationsCounts, robotIssues, routeProgress, tourAction } from './attention'

const NOW = new Date('2026-09-21T09:00:00Z').getTime()
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()
const closed = { allowed: false, reason: 'x' }
const noActions: StaffActions = { start: closed, hold: closed, next: closed, endEarly: closed, retryLeg: closed, rerunPoi: closed, retryFront: closed, confirmComplete: closed }

const tour = (over: Partial<TourOperation>): TourOperation => ({
  id: 't1',
  code: 'T-01',
  name: 'Buổi mẫu',
  routeName: 'Tuyến mẫu',
  scheduledAt: at(60),
  estimatedEndAt: at(90),
  state: 'Scheduled',
  readyBlockers: [],
  language: 'Tiếng Việt',
  registrations: [],
  stops: [],
  endPoint: { name: 'Sảnh', position: { x: 0, y: 0 } },
  livestream: { state: 'Offline' },
  startChecks: [],
  allowedActions: noActions,
  revision: 1,
  ...over,
})

const robot = (over: Partial<AmrStatus>): AmrStatus => ({
  id: 'robot_01',
  name: 'robot_01',
  operationalState: 'Idle',
  connectionState: 'Live',
  sensorHealth: 'Healthy',
  source: 'Physical',
  assignable: true,
  localized: true,
  poseAgeSeconds: 1,
  ...over,
})

describe('tourAction', () => {
  it('offers the step the state calls for, and never Start from a list', () => {
    expect(tourAction(tour({ state: 'Scheduled' }))).toMatchObject({ label: 'Xem chi tiết', to: '/staff/tours/t1' })
    expect(tourAction(tour({ state: 'Ready' }))).toMatchObject({ label: 'Kiểm tra & bắt đầu', to: '/staff/tours/t1/start', kind: 'primary' })
    expect(tourAction(tour({ state: 'Running', operationalStatus: 'Normal' }))).toMatchObject({ label: 'Điều hành', to: '/staff/live/t1', kind: 'secondary' })
    expect(tourAction(tour({ state: 'Running', operationalStatus: 'NeedsAssistance' }))).toMatchObject({ label: 'Xử lý hỗ trợ', kind: 'primary' })
    expect(tourAction(tour({ state: 'Cancelled' })).label).toBe('Xem nhật ký')
  })
})

describe('robotIssues', () => {
  it('separates a live heartbeat from a stale pose, and holds a robot awaiting a check', () => {
    expect(robotIssues(robot({}))).toEqual([])
    expect(robotIssues(robot({ poseAgeSeconds: 12 }))).toEqual(['Vị trí cũ'])
    expect(robotIssues(robot({ connectionState: 'Disconnected', poseAgeSeconds: 40 }))).toEqual(['Mất kết nối'])
    expect(robotIssues(robot({ needsCheck: true, headFault: true }))).toEqual(['Lỗi đầu xoay', 'Chờ xác nhận kiểm tra'])
  })
})

describe('operationsCounts', () => {
  it('counts sessions by TourState and running ones needing assistance', () => {
    const reg = { id: 'r', schoolName: 'S', representativeName: 'R', studentCount: 10, roster: [] }
    const counts = operationsCounts([
      tour({ state: 'Running', operationalStatus: 'NeedsAssistance', startedAt: at(-5), registrations: [{ ...reg, state: 'Approved' }] }),
      tour({ state: 'Ready', registrations: [{ ...reg, state: 'Approved' }, { ...reg, state: 'Approved' }] }),
      tour({ state: 'Scheduled', registrations: [{ ...reg, state: 'Submitted' }] }),
      tour({ state: 'Completed', startedAt: at(-90) }),
      tour({ state: 'Cancelled' }),
    ])
    expect(counts).toEqual({ toursToday: 4, running: 1, ready: 1, scheduled: 1, finished: 1, needsAssistance: 1, groupsToday: 3 })
  })

  it('summarises approved groups only', () => {
    const reg = { id: 'r', schoolName: 'S', representativeName: 'R', studentCount: 12, roster: [] }
    expect(groupSummary(tour({ registrations: [{ ...reg, state: 'Approved' }, { ...reg, state: 'Submitted' }] }))).toEqual({ groups: 1, students: 12, pending: 1 })
  })
})

describe('buildAttentionQueue', () => {
  it('puts a Tour needing assistance first, then a held robot, then a due start', () => {
    const queue = buildAttentionQueue({
      tours: [
        tour({ id: 'ready', state: 'Ready', scheduledAt: at(10) }),
        tour({ id: 'run', state: 'Running', operationalStatus: 'NeedsAssistance', reason: 'NavigationFailed', reasonDetail: 'Nav2 báo thất bại' }),
        tour({ id: 'later', state: 'Scheduled', scheduledAt: at(240) }),
      ],
      robots: [robot({ needsCheck: true })],
    }, NOW)
    expect(queue.map((item) => item.id)).toEqual(['tour:run', 'robot:robot_01', 'tour:ready'])
    expect(queue[0]).toMatchObject({ headline: 'Cần hỗ trợ · Lỗi điều hướng', toLabel: 'Xử lý hỗ trợ' })
  })

  it('ignores rehearsal robots and the robot already serving a Tour', () => {
    const queue = buildAttentionQueue({ tours: [], robots: [robot({ id: 'gz', assignable: false, headFault: true }), robot({ currentSessionId: 't1', poseAgeSeconds: 30 })] }, NOW)
    expect(queue).toEqual([])
  })
})

describe('routeProgress', () => {
  it('reads the target from the server progress, not from a guess', () => {
    const stop = (id: string, status: 'Completed' | 'Current' | 'Upcoming') => ({ id, name: id, position: { x: 0, y: 0 }, dwellSeconds: 20, headSteps: ['FRONT' as const], status, visits: 0 })
    const progress = routeProgress({ stops: [stop('a', 'Completed'), stop('b', 'Current'), stop('c', 'Upcoming')], progress: { step: 'Navigating', stopIndex: 1, hold: false, narration: 'Idle' } })
    expect(progress).toMatchObject({ done: 1, total: 3 })
    expect(progress.current?.id).toBe('b')
    expect(progress.next?.id).toBe('c')
  })
})
