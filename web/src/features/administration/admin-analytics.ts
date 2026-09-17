/**
 * Data preparation for the administration overview.
 *
 * Pure functions from transport DTOs to chart-ready rows: no React, no queries,
 * no fetching. The charts under `./charts` render whatever these return, so a
 * chart never learns where its numbers came from and can be swapped for a
 * library implementation without touching this file.
 *
 * What an administrator may be shown is limited by what the contract in
 * `api/contracts/operations.ts` actually carries. Three levels, stated once here
 * so the page can be honest on screen:
 *
 *   available          the endpoint exists and returns the field
 *   contract-pending   the contract declares it, the mock does not serve it yet
 *   blocked            no field anywhere; nothing may be displayed
 *
 * Nothing in this module invents a value. A metric with no source returns null
 * and the screen says so.
 */
import type { AmrStatus, FeedbackReport, OpsAlert } from '../../api/contracts/operations'
import { statusInfo } from '../operations/status'

export type MetricAvailability = 'available' | 'contract-pending' | 'blocked'

/* ── Reporting window ─────────────────────────────────────────────────────── */

export type AnalyticsRange = { from: string; to: string; days: number }

const isoDay = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/**
 * The window the overview reports on. `FeedbackFilters` declares `from`/`to`,
 * so the range is contract-backed rather than a filter invented in the browser.
 */
export function analyticsRange(days = 7): AnalyticsRange {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  return { from: isoDay(start), to: isoDay(end), days }
}

/* ── Tour activity over the window ────────────────────────────────────────── */

export type TourActivityDay = {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string
  /** Short axis label, `DD/MM`. */
  label: string
  completed: number
  cancelled: number
  /** Anything the backend reports that is neither completed nor cancelled. */
  other: number
}

const isCancelled = (status: string) => {
  const key = status.trim().toLowerCase()
  return key === 'cancelled' || key === 'canceled'
}

const isCompleted = (status: string) => status.trim().toLowerCase() === 'completed'

/**
 * Buckets post-tour reports into one column per day. Days with no tours stay in
 * the series as zero columns: a gap in the axis would read as missing data
 * rather than as a quiet day.
 */
export function buildTourActivity(reports: FeedbackReport[], range: AnalyticsRange): TourActivityDay[] {
  const days = new Map<string, TourActivityDay>()
  const cursor = new Date(`${range.from}T00:00:00`)

  for (let i = 0; i < range.days; i += 1) {
    const key = isoDay(cursor)
    days.set(key, {
      date: key,
      label: `${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      completed: 0,
      cancelled: 0,
      other: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  for (const report of reports) {
    const when = new Date(report.tourDate)
    if (Number.isNaN(when.getTime())) continue
    const bucket = days.get(isoDay(when))
    if (!bucket) continue
    if (isCompleted(report.bookingStatus)) bucket.completed += 1
    else if (isCancelled(report.bookingStatus)) bucket.cancelled += 1
    else bucket.other += 1
  }

  return [...days.values()]
}

/* ── Headline figures ─────────────────────────────────────────────────────── */

export type TourTotals = {
  total: number
  completed: number
  cancelled: number
  /** 0..1, or null when the window holds no tours at all. */
  completionRate: number | null
}

export function summariseTours(reports: FeedbackReport[]): TourTotals {
  const completed = reports.filter((r) => isCompleted(r.bookingStatus)).length
  const cancelled = reports.filter((r) => isCancelled(r.bookingStatus)).length
  const total = reports.length
  return { total, completed, cancelled, completionRate: total === 0 ? null : completed / total }
}

export type RatingSummary = {
  /** Mean of the ratings that exist. Null when nobody rated in the window. */
  average: number | null
  /** How many tours carried a rating, so the average can be read in context. */
  count: number
  /** Tours in the window with no rating at all. */
  missing: number
}

export function summariseRatings(reports: FeedbackReport[]): RatingSummary {
  const rated = reports.filter((r) => typeof r.rating === 'number') as (FeedbackReport & { rating: number })[]
  if (rated.length === 0) return { average: null, count: 0, missing: reports.length }
  const sum = rated.reduce((acc, r) => acc + r.rating, 0)
  return { average: sum / rated.length, count: rated.length, missing: reports.length - rated.length }
}

/* ── Fleet health ─────────────────────────────────────────────────────────── */

export type FleetHealth = {
  total: number
  live: number
  stale: number
  disconnected: number
  /** Connection or operational state that a human should look at. */
  needsAttention: number
  sensorWarnings: number
  lowBattery: number
  /** Oldest telemetry age reported by any robot, in seconds. Null when unknown. */
  oldestTelemetrySeconds: number | null
}

const tone = (value?: string | null) => statusInfo(value).tone

export function summariseFleet(amrs: AmrStatus[]): FleetHealth {
  const ages = amrs.map((a) => a.telemetryAgeSeconds).filter((v): v is number => typeof v === 'number')
  return {
    total: amrs.length,
    live: amrs.filter((a) => a.connectionState === 'Live').length,
    stale: amrs.filter((a) => a.connectionState === 'Stale').length,
    disconnected: amrs.filter((a) => a.connectionState === 'Disconnected').length,
    needsAttention: amrs.filter((a) => ['warn', 'danger'].includes(tone(a.connectionState)) || ['warn', 'danger'].includes(tone(a.operationalState))).length,
    sensorWarnings: amrs.filter((a) => ['warn', 'danger'].includes(tone(a.sensorHealth))).length,
    lowBattery: amrs.filter((a) => a.batteryPercent != null && a.batteryPercent < 20).length,
    oldestTelemetrySeconds: ages.length === 0 ? null : Math.max(...ages),
  }
}

/* ── Incidents per robot ──────────────────────────────────────────────────── */

export type IncidentRow = {
  amrName: string
  total: number
  critical: number
}

/**
 * Counts the alert rows the alerts endpoint already returns, grouped by robot.
 * This is a count of real records, not a derived reliability score: the moment a
 * TourEvent/FAILED aggregate exists, this should read that instead.
 */
export function buildIncidentsByRobot(alerts: OpsAlert[], fleet: AmrStatus[] = []): IncidentRow[] {
  const rows = new Map<string, IncidentRow>()

  // Every registered robot appears, so a robot with no incidents reads as zero
  // rather than being silently absent from the chart.
  for (const amr of fleet) rows.set(amr.name, { amrName: amr.name, total: 0, critical: 0 })

  for (const alert of alerts) {
    const name = alert.amrName?.trim() || 'Không gắn thiết bị'
    const row = rows.get(name) ?? { amrName: name, total: 0, critical: 0 }
    row.total += 1
    if (alert.severity === 'Critical') row.critical += 1
    rows.set(name, row)
  }

  return [...rows.values()].sort((a, b) => b.total - a.total || b.critical - a.critical || a.amrName.localeCompare(b.amrName, 'vi'))
}

/* ── Robot utilisation ────────────────────────────────────────────────────── */

export type RobotUtilisation = { amrName: string; percent: number }

/**
 * Utilisation has no field in `api/contracts/operations.ts`: not on `AmrStatus`,
 * not on `OpsDashboard`, not in any reporting call. Connection state answers
 * "is it reachable", which is a different question, so it is not reused here.
 *
 * Returns null until a reporting contract carries the metric. The chart renders
 * an empty state from null; it never receives a substitute number.
 */
export function buildRobotUtilisation(): RobotUtilisation[] | null {
  return null
}
