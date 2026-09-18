/**
 * Transport contract for the operations dashboard.
 *
 * Types and endpoint calls only: no React, no query hooks, no fixtures. The
 * feature that consumes this lives in `src/features/staff/`.
 *
 * The TYPES here are live - the fixtures and every screen are written against
 * them. `staffApi`, the HTTP implementation at the bottom, is NOT wired to
 * anything: `/api/staff/*` does not exist, so `staff-hooks.ts` binds the
 * mock implementation of this same type instead. It is kept as the written
 * record of the endpoints this frontend expects, so agreeing the contract with
 * the backend is a diff rather than a conversation, and turning it on is one
 * import. Do not delete it to satisfy a dead-code sweep.
 *
 * The browser never sends an Emergency Stop (web/AGENTS.md §7). A web cancel or
 * recall is an operational request checked by the server; the physical fail-safe
 * stays robot-side.
 */
import { apiClient } from '../client'

export type StaffDashboard = {
  todayTours: number
  upcomingTours: number
  activeTours: number
  completedTours: number
  pendingTours: number
  activeAmrs: number
  offlineAmrs: number
  activeAlerts: number
  criticalAlerts: number
  todaySchedule: StaffScheduleItem[]
  activeAmrsList: AmrStatus[]
  recentAlerts: StaffAlert[]
  activeSessions: TourSessionSummary[]
}

export type StaffScheduleItem = {
  sessionId: string
  bookingId: string
  startTime: string
  endTime: string
  routeName: string
  visitorName: string
  status: string
  amrName?: string | null
}

export type TourSessionSummary = {
  id: string
  status: string
  routeName: string
  startTime: string
  amrName?: string | null
  missionState?: string | null
  progressPercent?: number | null
}

export type Mission = {
  id: string
  amrUnitId: string
  state: string
  progressPercent: number
  currentWaypoint?: string | null
  nextWaypoint?: string | null
  failureReason?: string | null
  correlationId?: string | null
  startedAt?: string | null
}

/** Operational mission commands available from the browser. Never an E-Stop. */
export type MissionCommand = 'pause' | 'resume' | 'recall' | 'cancel'

export type TourTimelineEvent = {
  id: string
  type: string
  detail?: string | null
  occurredAt: string
}

export type Assignment = {
  id: string
  amrUnitId: string
  amrName: string
  status: string
  assignedBy: string
  reason?: string | null
  assignedAt: string
  closedAt?: string | null
}

export type TourSessionDetail = {
  id: string
  bookingId: string
  status: string
  routeName: string
  startTime: string
  endTime: string
  visitorName: string
  amrName?: string | null
  mission?: Mission | null
  timeline: TourTimelineEvent[]
  alerts: StaffAlert[]
  assignments: Assignment[]
}

export type AmrStatus = {
  id: string
  name: string
  operationalState: string
  connectionState: 'Live' | 'Stale' | 'Disconnected' | string
  /** Optional: a robot that reports no battery telemetry must not be given one. */
  batteryPercent?: number | null
  latitude?: number | null
  longitude?: number | null
  lastSeenAt?: string | null
  telemetryAgeSeconds?: number | null
  sensorHealth: string
  currentSessionId?: string | null
  currentSessionStatus?: string | null
  currentMissionState?: string | null
  currentPoi?: string | null
}

export type StaffAlert = {
  id: string
  type: string
  severity: 'Information' | 'Warning' | 'Critical' | string
  message: string
  amrUnitId?: string | null
  amrName?: string | null
  tourSessionId?: string | null
  createdAt: string
  acknowledgedAt?: string | null
  acknowledgedBy?: string | null
  resolutionNote?: string | null
  resolvedAt?: string | null
}

export type ScheduleFilters = {
  status?: string
  date?: string
  routeId?: string
}

export type FeedbackFilters = {
  from?: string
  to?: string
  routeId?: string
  rating?: string
  status?: string
}

export type FeedbackReport = {
  bookingId: string
  routeName: string
  tourDate: string
  bookingStatus: string
  rating?: number | null
  comment?: string | null
}

/**
 * The shape the operations feature depends on. The HTTP implementation below and
 * the labelled mock in `src/mocks/staff-mock.ts` both satisfy it, so the
 * feature never learns which one it is talking to.
 */
export type StaffApi = {
  dashboard(date?: string): Promise<StaffDashboard>
  schedule(filters?: ScheduleFilters): Promise<StaffScheduleItem[]>
  tourSession(id: string): Promise<TourSessionDetail>
  amrs(): Promise<AmrStatus[]>
  digitalTwin(): Promise<AmrStatus[]>
  alerts(acknowledged?: boolean, severity?: string): Promise<StaffAlert[]>
  acknowledgeAlert(id: string, resolutionNote?: string): Promise<StaffAlert>
  assignAmr(sessionId: string, amrUnitId: string, reason?: string): Promise<Assignment>
  reassignAmr(sessionId: string, amrUnitId: string, reason: string): Promise<Assignment>
  commandMission(sessionId: string, command: MissionCommand, reason?: string): Promise<Mission>
  feedbackReports(filters?: FeedbackFilters): Promise<FeedbackReport[]>
}

function queryString(values: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const staffApi: StaffApi = {
  dashboard: (date) => apiClient(`/api/staff/dashboard${queryString({ date })}`),
  schedule: (filters = {}) => apiClient(`/api/staff/schedule${queryString(filters)}`),
  tourSession: (id) => apiClient(`/api/staff/tour-sessions/${id}`),
  amrs: () => apiClient('/api/staff/amrs'),
  digitalTwin: () => apiClient('/api/staff/digital-twin'),
  alerts: (acknowledged, severity) =>
    apiClient(`/api/staff/alerts${queryString({ acknowledged: acknowledged === undefined ? undefined : String(acknowledged), severity })}`),
  acknowledgeAlert: (id, resolutionNote) =>
    apiClient(`/api/staff/alerts/${id}/acknowledge`, { method: 'POST', json: { resolutionNote } }),
  assignAmr: (sessionId, amrUnitId, reason) =>
    apiClient(`/api/staff/tour-sessions/${sessionId}/assignments`, { method: 'POST', json: { amrUnitId, reason } }),
  reassignAmr: (sessionId, amrUnitId, reason) =>
    apiClient(`/api/staff/tour-sessions/${sessionId}/assignment`, { method: 'PUT', json: { amrUnitId, reason } }),
  commandMission: (sessionId, command, reason) =>
    apiClient(`/api/staff/tour-sessions/${sessionId}/missions/${command}`, { method: 'POST', json: { reason } }),
  feedbackReports: (filters = {}) => apiClient(`/api/staff/reports/feedback${queryString(filters)}`),
}
