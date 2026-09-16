import { apiClient } from './client'

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
  batteryPercent: number
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

function queryString(values: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const staffApi = {
  dashboard: (date?: string) => apiClient<StaffDashboard>(`/api/staff/dashboard${queryString({ date })}`),
  schedule: (filters: ScheduleFilters = {}) => apiClient<StaffScheduleItem[]>(`/api/staff/schedule${queryString(filters)}`),
  tourSession: (id: string) => apiClient<TourSessionDetail>(`/api/staff/tour-sessions/${id}`),
  amrs: () => apiClient<AmrStatus[]>('/api/staff/amrs'),
  digitalTwin: () => apiClient<AmrStatus[]>('/api/staff/digital-twin'),
  alerts: (acknowledged?: boolean, severity?: string) => apiClient<StaffAlert[]>(`/api/staff/alerts${queryString({ acknowledged: acknowledged === undefined ? undefined : String(acknowledged), severity })}`),
  acknowledgeAlert: (id: string, resolutionNote?: string) => apiClient<StaffAlert>(`/api/staff/alerts/${id}/acknowledge`, { method: 'POST', json: { resolutionNote } }),
  assignAmr: (sessionId: string, amrUnitId: string, reason?: string) => apiClient<Assignment>(`/api/staff/tour-sessions/${sessionId}/assignments`, { method: 'POST', json: { amrUnitId, reason } }),
  reassignAmr: (sessionId: string, amrUnitId: string, reason: string) => apiClient<Assignment>(`/api/staff/tour-sessions/${sessionId}/assignment`, { method: 'PUT', json: { amrUnitId, reason } }),
  commandMission: (sessionId: string, command: 'pause' | 'resume' | 'recall' | 'cancel' | 'emergency-stop', reason?: string) => apiClient<Mission>(`/api/staff/tour-sessions/${sessionId}/missions/${command}`, { method: 'POST', json: { reason } }),
  feedbackReports: (filters: { from?: string; to?: string; routeId?: string; rating?: string; status?: string } = {}) => apiClient<FeedbackReport[]>(`/api/staff/reports/feedback${queryString(filters)}`),
}

export type FeedbackReport = {
  bookingId: string
  routeName: string
  tourDate: string
  bookingStatus: string
  rating?: number | null
  comment?: string | null
}
