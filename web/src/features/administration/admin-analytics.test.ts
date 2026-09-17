import { describe, expect, it } from 'vitest'
import type { AmrStatus, FeedbackReport, OpsAlert } from '../../api/contracts/operations'
import {
  analyticsRange,
  buildIncidentsByRobot,
  buildRobotUtilisation,
  buildTourActivity,
  summariseFleet,
  summariseRatings,
  summariseTours,
} from './admin-analytics'

const dayOffset = (days: number, hour = 10) => {
  const when = new Date()
  when.setDate(when.getDate() - days)
  when.setHours(hour, 0, 0, 0)
  return when.toISOString()
}

const report = (over: Partial<FeedbackReport>): FeedbackReport => ({
  bookingId: 'b1',
  routeName: 'Tuyến mẫu',
  tourDate: dayOffset(0),
  bookingStatus: 'Completed',
  rating: null,
  comment: null,
  ...over,
})

const amr = (over: Partial<AmrStatus>): AmrStatus => ({
  id: 'a1',
  name: 'AMR-01',
  operationalState: 'Idle',
  connectionState: 'Live',
  sensorHealth: 'Healthy',
  ...over,
})

const alert = (over: Partial<OpsAlert>): OpsAlert => ({
  id: 'x1',
  type: 'ObstacleDetected',
  severity: 'Warning',
  message: 'Sự cố mẫu',
  createdAt: dayOffset(0),
  ...over,
})

describe('analyticsRange', () => {
  it('spans the requested number of inclusive days', () => {
    const range = analyticsRange(7)
    expect(range.days).toBe(7)
    const from = new Date(`${range.from}T00:00:00`)
    const to = new Date(`${range.to}T00:00:00`)
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(6)
  })
})

describe('buildTourActivity', () => {
  const range = analyticsRange(7)

  it('keeps a column for every day, including days with no tours', () => {
    const days = buildTourActivity([report({ tourDate: dayOffset(2) })], range)
    expect(days).toHaveLength(7)
    expect(days.filter((d) => d.completed + d.cancelled + d.other > 0)).toHaveLength(1)
  })

  it('separates completed from cancelled instead of merging them into a total', () => {
    const days = buildTourActivity(
      [
        report({ tourDate: dayOffset(1), bookingStatus: 'Completed' }),
        report({ tourDate: dayOffset(1), bookingStatus: 'Cancelled' }),
        report({ tourDate: dayOffset(1), bookingStatus: 'Scheduled' }),
      ],
      range,
    )
    const day = days.find((d) => d.completed > 0)
    expect(day).toMatchObject({ completed: 1, cancelled: 1, other: 1 })
  })

  it('ignores reports that fall outside the window', () => {
    const days = buildTourActivity([report({ tourDate: dayOffset(90) })], range)
    expect(days.every((d) => d.completed + d.cancelled + d.other === 0)).toBe(true)
  })
})

describe('summariseTours', () => {
  it('returns a null completion rate rather than zero when there are no tours', () => {
    expect(summariseTours([]).completionRate).toBeNull()
  })

  it('counts cancelled tours separately from completed ones', () => {
    const totals = summariseTours([
      report({ bookingStatus: 'Completed' }),
      report({ bookingStatus: 'Completed' }),
      report({ bookingStatus: 'Cancelled' }),
    ])
    expect(totals).toMatchObject({ total: 3, completed: 2, cancelled: 1 })
    expect(totals.completionRate).toBeCloseTo(2 / 3)
  })
})

describe('summariseRatings', () => {
  it('averages only the tours that carry a rating', () => {
    const summary = summariseRatings([report({ rating: 4 }), report({ rating: 5 }), report({ rating: null })])
    expect(summary).toMatchObject({ count: 2, missing: 1 })
    expect(summary.average).toBeCloseTo(4.5)
  })

  it('reports no average when nobody rated', () => {
    expect(summariseRatings([report({ rating: null })]).average).toBeNull()
  })
})

describe('summariseFleet', () => {
  it('counts connection states and leaves a missing battery missing', () => {
    const health = summariseFleet([
      amr({ id: 'a1', connectionState: 'Live', batteryPercent: 80, telemetryAgeSeconds: 10 }),
      amr({ id: 'a2', connectionState: 'Stale', batteryPercent: 15, telemetryAgeSeconds: 300 }),
      amr({ id: 'a3', connectionState: 'Disconnected', batteryPercent: null, sensorHealth: 'Unknown' }),
    ])
    expect(health).toMatchObject({ total: 3, live: 1, stale: 1, disconnected: 1, lowBattery: 1 })
    expect(health.oldestTelemetrySeconds).toBe(300)
  })

  it('has no telemetry age when no robot reports one', () => {
    expect(summariseFleet([amr({})]).oldestTelemetrySeconds).toBeNull()
  })
})

describe('buildIncidentsByRobot', () => {
  it('lists every registered robot so a clean robot reads as zero', () => {
    const rows = buildIncidentsByRobot([], [amr({ id: 'a1', name: 'AMR-01' }), amr({ id: 'a2', name: 'AMR-02' })])
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.total === 0)).toBe(true)
  })

  it('counts alerts per robot and marks the critical ones', () => {
    const rows = buildIncidentsByRobot(
      [
        alert({ id: 'x1', amrName: 'AMR-01', severity: 'Critical' }),
        alert({ id: 'x2', amrName: 'AMR-01', severity: 'Warning' }),
        alert({ id: 'x3', amrName: 'AMR-02', severity: 'Information' }),
      ],
      [amr({ id: 'a1', name: 'AMR-01' }), amr({ id: 'a2', name: 'AMR-02' })],
    )
    expect(rows[0]).toMatchObject({ amrName: 'AMR-01', total: 2, critical: 1 })
    expect(rows[1]).toMatchObject({ amrName: 'AMR-02', total: 1, critical: 0 })
  })

  it('keeps an alert that names no robot instead of dropping it', () => {
    const rows = buildIncidentsByRobot([alert({ amrName: null })], [])
    expect(rows[0]).toMatchObject({ amrName: 'Không gắn thiết bị', total: 1 })
  })
})

describe('buildRobotUtilisation', () => {
  it('has no value to give, because no contract carries the metric', () => {
    expect(buildRobotUtilisation()).toBeNull()
  })
})
