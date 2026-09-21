import { describe, expect, it } from 'vitest'
import { buildAttentionQueue } from './attention'
import type { AmrStatus, StaffAlert, StaffDashboard, StaffScheduleItem } from '../../api/contracts/staff'

const NOW = new Date('2026-09-18T14:00:00+07:00').getTime()
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

const amr = (over: Partial<AmrStatus> = {}): AmrStatus => ({
  id: 'amr-1', name: 'AMR Lotus-01', operationalState: 'Navigating', connectionState: 'Live',
  batteryPercent: 80, sensorHealth: 'Healthy', lastSeenAt: at(-1), ...over,
})

const tour = (over: Partial<StaffScheduleItem> = {}): StaffScheduleItem => ({
  sessionId: 's-1', bookingId: 'b-1', startTime: at(60), endTime: at(120),
  routeName: 'Khám phá khuôn viên', visitorName: 'Trần Gia Hân', status: 'Scheduled',
  amrName: 'AMR Lotus-01', ...over,
})

const alert = (over: Partial<StaffAlert> = {}): StaffAlert => ({
  id: 'a-1', type: 'ObstacleDetected', severity: 'Critical', message: 'Vật cản kéo dài.',
  createdAt: at(-5), ...over,
})

const dashboard = (over: Partial<StaffDashboard> = {}): StaffDashboard => ({
  todayTours: 0, upcomingTours: 0, activeTours: 0, completedTours: 0, pendingTours: 0,
  activeAmrs: 0, offlineAmrs: 0, activeAlerts: 0, criticalAlerts: 0,
  todaySchedule: [], activeAmrsList: [], recentAlerts: [], activeSessions: [], ...over,
})

const ids = (data: StaffDashboard) => buildAttentionQueue(data, NOW).map((item) => item.id)

describe('buildAttentionQueue', () => {
  it('is empty when nothing needs a person', () => {
    const data = dashboard({
      activeAmrsList: [amr()],
      todaySchedule: [tour()],
      activeSessions: [{ id: 's-9', status: 'InProgress', routeName: 'R', startTime: at(-10), missionState: 'Navigating', progressPercent: 40 }],
    })
    expect(buildAttentionQueue(data, NOW)).toEqual([])
  })

  describe('what gets in', () => {
    it('raises a disconnected robot', () => {
      const data = dashboard({ activeAmrsList: [amr({ connectionState: 'Disconnected', operationalState: 'Offline' })] })
      const [item] = buildAttentionQueue(data, NOW)
      expect(item.tone).toBe('danger')
      expect(item.headline).toBe('Mất kết nối')
      expect(item.to).toBe('/staff/amr')
    })

    it('raises a stale robot as a warning, not a failure', () => {
      const data = dashboard({ activeAmrsList: [amr({ connectionState: 'Stale' })] })
      expect(buildAttentionQueue(data, NOW)[0]).toMatchObject({ tone: 'warn', headline: 'Dữ liệu chậm' })
    })

    it('raises a low battery', () => {
      const data = dashboard({ activeAmrsList: [amr({ batteryPercent: 12 })] })
      expect(buildAttentionQueue(data, NOW)[0]).toMatchObject({ tone: 'warn', headline: 'Pin yếu' })
    })

    it('leaves a robot with no battery reading alone rather than calling it flat', () => {
      const data = dashboard({ activeAmrsList: [amr({ batteryPercent: null })] })
      expect(buildAttentionQueue(data, NOW)).toEqual([])
    })

    it('raises a tour that should already have started', () => {
      const data = dashboard({ todaySchedule: [tour({ startTime: at(-20) })] })
      expect(buildAttentionQueue(data, NOW)[0]).toMatchObject({ tone: 'danger', headline: 'Quá giờ khởi hành' })
    })

    it('raises a tour with no robot, and treats one starting soon as urgent', () => {
      const later = dashboard({ todaySchedule: [tour({ amrName: null, startTime: at(90) })] })
      expect(buildAttentionQueue(later, NOW)[0]).toMatchObject({ tone: 'warn', headline: 'Chưa bắt đầu buổi', toLabel: 'Kiểm tra buổi' })

      const soon = dashboard({ todaySchedule: [tour({ amrName: null, startTime: at(5) })] })
      expect(buildAttentionQueue(soon, NOW)[0]).toMatchObject({ tone: 'danger', headline: 'Chưa bắt đầu buổi' })
    })

    it('raises a paused tour as a decision waiting on a person', () => {
      const data = dashboard({
        activeSessions: [{ id: 's-2', status: 'Paused', routeName: 'Không gian nghiên cứu mở', startTime: at(-40), amrName: 'AMR Lotus-03', missionState: 'Paused', progressPercent: 38 }],
      })
      expect(buildAttentionQueue(data, NOW)[0]).toMatchObject({ tone: 'warn', headline: 'Tour đang tạm dừng', to: '/staff/tours/s-2' })
    })

    it('carries the alert id so the row can be acknowledged in place', () => {
      const data = dashboard({ recentAlerts: [alert()] })
      expect(buildAttentionQueue(data, NOW)[0].alertId).toBe('a-1')
    })
  })

  describe('what stays out', () => {
    it('ignores an already acknowledged alert', () => {
      const data = dashboard({ recentAlerts: [alert({ acknowledgedAt: at(-2) })] })
      expect(buildAttentionQueue(data, NOW)).toEqual([])
    })

    it('ignores a completed or cancelled tour with no robot', () => {
      const data = dashboard({
        todaySchedule: [tour({ status: 'Completed', amrName: null }), tour({ sessionId: 's-3', status: 'Cancelled', amrName: null })],
      })
      expect(buildAttentionQueue(data, NOW)).toEqual([])
    })

    it('does not print a robot twice when an open alert already names it', () => {
      const data = dashboard({
        recentAlerts: [alert({ amrName: 'AMR Lotus-04', severity: 'Warning' })],
        activeAmrsList: [amr({ id: 'amr-4', name: 'AMR Lotus-04', connectionState: 'Disconnected', operationalState: 'Offline' })],
      })
      expect(ids(data)).toEqual(['alert:a-1'])
    })

    it('does not also nag about a robot for a tour that is merely late', () => {
      const data = dashboard({ todaySchedule: [tour({ startTime: at(-20), amrName: null })] })
      expect(ids(data)).toEqual(['late:s-1'])
    })
  })

  describe('ordering', () => {
    it('puts failures above warnings and the oldest first inside a band', () => {
      const data = dashboard({
        recentAlerts: [
          alert({ id: 'a-warn', severity: 'Warning', amrName: 'AMR Lotus-09', createdAt: at(-30) }),
          alert({ id: 'a-crit-new', severity: 'Critical', amrName: 'AMR Lotus-07', createdAt: at(-2) }),
          alert({ id: 'a-crit-old', severity: 'Critical', amrName: 'AMR Lotus-08', createdAt: at(-45) }),
        ],
        activeAmrsList: [amr({ id: 'amr-5', name: 'AMR Lotus-05', connectionState: 'Disconnected' })],
        todaySchedule: [tour({ sessionId: 's-late', startTime: at(-10) })],
      })
      expect(ids(data)).toEqual([
        'alert:a-crit-old',
        'alert:a-crit-new',
        'amr:amr-5',
        'late:s-late',
        'alert:a-warn',
      ])
    })
  })
})
