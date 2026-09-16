import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getDemoAlerts, getDemoAmrs, getDemoDashboard, getDemoFeedbackReports, getDemoSchedule, getDemoSession, minutesAgo, useStaffDemoStore } from './staff-demo'
import { staffApi, type AmrStatus, type ScheduleFilters } from './staff'

export const staffQueryKeys = {
  dashboard: (date?: string) => ['staff', 'dashboard', date] as const,
  schedule: (filters: ScheduleFilters) => ['staff', 'schedule', filters] as const,
  session: (id: string) => ['staff', 'session', id] as const,
  amrs: ['staff', 'amrs'] as const,
  twin: ['staff', 'digital-twin'] as const,
  alerts: (acknowledged?: boolean, severity?: string) => ['staff', 'alerts', acknowledged, severity] as const,
  feedback: (filters: Record<string, string | undefined>) => ['staff', 'feedback', filters] as const,
}

export function useStaffDashboard(date?: string) {
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  const acknowledgedAlertIds = useStaffDemoStore((state) => state.acknowledgedAlertIds)
  return useQuery({ queryKey: [...staffQueryKeys.dashboard(date), isDemo, acknowledgedAlertIds], queryFn: () => isDemo ? getDemoDashboard(acknowledgedAlertIds) : staffApi.dashboard(date), refetchInterval: isDemo ? false : 30_000 })
}

export function useStaffSchedule(filters: ScheduleFilters = {}) {
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  return useQuery({ queryKey: [...staffQueryKeys.schedule(filters), isDemo], queryFn: () => isDemo ? getDemoSchedule(filters) : staffApi.schedule(filters) })
}

export function useTourSession(id: string) {
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  const acknowledgedAlertIds = useStaffDemoStore((state) => state.acknowledgedAlertIds)
  return useQuery({ queryKey: [...staffQueryKeys.session(id), isDemo, acknowledgedAlertIds], queryFn: () => isDemo ? getDemoSession(id, acknowledgedAlertIds) : staffApi.tourSession(id), enabled: Boolean(id), refetchInterval: isDemo ? false : 15_000 })
}

export function useStaffAmrs() {
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  return useQuery<AmrStatus[]>({ queryKey: [...staffQueryKeys.amrs, isDemo], queryFn: () => isDemo ? getDemoAmrs() : staffApi.amrs(), refetchInterval: isDemo ? false : 15_000 })
}

export function useStaffTwin() {
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  return useQuery<AmrStatus[]>({ queryKey: [...staffQueryKeys.twin, isDemo], queryFn: () => isDemo ? getDemoAmrs() : staffApi.digitalTwin(), refetchInterval: isDemo ? false : 15_000 })
}

export function useStaffAlerts(acknowledged?: boolean, severity?: string) {
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  const acknowledgedAlertIds = useStaffDemoStore((state) => state.acknowledgedAlertIds)
  return useQuery({ queryKey: [...staffQueryKeys.alerts(acknowledged, severity), isDemo, acknowledgedAlertIds], queryFn: () => {
    if (!isDemo) return staffApi.alerts(acknowledged, severity)
    return getDemoAlerts(acknowledgedAlertIds).filter((alert) => (acknowledged === undefined || Boolean(alert.acknowledgedAt) === acknowledged) && (!severity || alert.severity === severity))
  }, refetchInterval: isDemo ? false : 15_000 })
}

export function useFeedbackReports(filters: Record<string, string | undefined> = {}) {
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  return useQuery({ queryKey: [...staffQueryKeys.feedback(filters), isDemo], queryFn: () => {
    const reports = isDemo ? getDemoFeedbackReports() : null
    return reports ? reports.filter((report) => !filters.rating || String(report.rating) === filters.rating) : staffApi.feedbackReports(filters)
  } })
}

function useStaffInvalidation() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['staff'] })
}

export function useAcknowledgeAlert() {
  const invalidate = useStaffInvalidation()
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  const acknowledgeDemoAlert = useStaffDemoStore((state) => state.acknowledgeAlert)
  return useMutation({ mutationFn: async ({ id, resolutionNote }: { id: string; resolutionNote?: string }) => {
    if (isDemo) { acknowledgeDemoAlert(id); return getDemoAlerts([id]).find((alert) => alert.id === id)! }
    return staffApi.acknowledgeAlert(id, resolutionNote)
  }, onSuccess: invalidate })
}

export function useAssignAmr() {
  const invalidate = useStaffInvalidation()
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  return useMutation({ mutationFn: ({ sessionId, amrUnitId, reason }: { sessionId: string; amrUnitId: string; reason?: string }) => isDemo ? Promise.resolve({ id: `demo-assignment-${Date.now()}`, amrUnitId, amrName: getDemoAmrs().find((amr) => amr.id === amrUnitId)?.name || 'AMR demo', status: 'Active', assignedBy: 'Nhân viên demo', reason, assignedAt: new Date().toISOString() }) : staffApi.assignAmr(sessionId, amrUnitId, reason), onSuccess: invalidate })
}

export function useReassignAmr() {
  const invalidate = useStaffInvalidation()
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  return useMutation({ mutationFn: ({ sessionId, amrUnitId, reason }: { sessionId: string; amrUnitId: string; reason: string }) => isDemo ? Promise.resolve({ id: `demo-reassignment-${Date.now()}`, amrUnitId, amrName: getDemoAmrs().find((amr) => amr.id === amrUnitId)?.name || 'AMR demo', status: 'Active', assignedBy: 'Nhân viên demo', reason, assignedAt: new Date().toISOString() }) : staffApi.reassignAmr(sessionId, amrUnitId, reason), onSuccess: invalidate })
}

export function useMissionCommand() {
  const invalidate = useStaffInvalidation()
  const isDemo = useStaffDemoStore((state) => state.isDemo)
  return useMutation({ mutationFn: ({ sessionId, command, reason }: { sessionId: string; command: 'pause' | 'resume' | 'recall' | 'cancel' | 'emergency-stop'; reason?: string }) => isDemo ? Promise.resolve({ id: `demo-mission-${sessionId}`, amrUnitId: 'demo-amr-01', state: command === 'emergency-stop' ? 'EmergencyStopped' : command === 'pause' ? 'Paused' : command === 'resume' ? 'Navigating' : command === 'recall' ? 'RecallRequested' : 'Cancelled', progressPercent: 62, failureReason: reason || null, correlationId: `demo-command-${Date.now()}`, startedAt: minutesAgo(24) }) : staffApi.commandMission(sessionId, command, reason), onSuccess: invalidate })
}
