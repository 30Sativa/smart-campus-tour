/**
 * Server state for the operations dashboard: TanStack Query owns the cache.
 *
 * The ops backend does not exist, so the data source is the labelled mock
 * implementation of the `StaffApi` contract. It is named once, here: no
 * screen knows where its rows came from, and no query falls back to fixtures
 * when something fails, because there is nothing to fall back from.
 *
 * When `/api/staff/*` lands, swap this one binding for `staffApi` from
 * `src/api/contracts/staff.ts`, which already implements the same type.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type AmrStatus,
  type FeedbackFilters,
  type MissionCommand,
  type ScheduleFilters,
} from '../../api/contracts/staff'
import { mockStaffApi } from '../../mocks/staff-mock'

const api = mockStaffApi

const LIVE_REFETCH_MS = 15_000
const DASHBOARD_REFETCH_MS = 30_000

export const staffQueryKeys = {
  all: ['staff'] as const,
  dashboard: (date?: string) => ['staff', 'dashboard', date] as const,
  schedule: (filters: ScheduleFilters) => ['staff', 'schedule', filters] as const,
  session: (id: string) => ['staff', 'session', id] as const,
  amrs: ['staff', 'amrs'] as const,
  twin: ['staff', 'digital-twin'] as const,
  alerts: (acknowledged?: boolean, severity?: string) => ['staff', 'alerts', acknowledged, severity] as const,
  feedback: (filters: FeedbackFilters) => ['staff', 'feedback', filters] as const,
}

export function useStaffDashboard(date?: string) {
  return useQuery({
    queryKey: staffQueryKeys.dashboard(date),
    queryFn: () => api.dashboard(date),
    refetchInterval: DASHBOARD_REFETCH_MS,
  })
}

export function useStaffSchedule(filters: ScheduleFilters = {}) {
  return useQuery({
    queryKey: staffQueryKeys.schedule(filters),
    queryFn: () => api.schedule(filters),
  })
}

export function useTourSession(id: string) {
  return useQuery({
    queryKey: staffQueryKeys.session(id),
    queryFn: () => api.tourSession(id),
    enabled: Boolean(id),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useStaffAmrs() {
  return useQuery<AmrStatus[]>({
    queryKey: staffQueryKeys.amrs,
    queryFn: () => api.amrs(),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useStaffTwin() {
  return useQuery<AmrStatus[]>({
    queryKey: staffQueryKeys.twin,
    queryFn: () => api.digitalTwin(),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useStaffAlerts(acknowledged?: boolean, severity?: string) {
  return useQuery({
    queryKey: staffQueryKeys.alerts(acknowledged, severity),
    queryFn: () => api.alerts(acknowledged, severity),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useFeedbackReports(filters: FeedbackFilters = {}) {
  return useQuery({
    queryKey: staffQueryKeys.feedback(filters),
    queryFn: () => api.feedbackReports(filters),
  })
}

function useStaffInvalidation() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: staffQueryKeys.all })
}

export function useAcknowledgeAlert() {
  const invalidate = useStaffInvalidation()
  return useMutation({
    mutationFn: ({ id, resolutionNote }: { id: string; resolutionNote?: string }) => api.acknowledgeAlert(id, resolutionNote),
    onSuccess: invalidate,
  })
}

export function useAssignAmr() {
  const invalidate = useStaffInvalidation()
  return useMutation({
    mutationFn: ({ sessionId, amrUnitId, reason }: { sessionId: string; amrUnitId: string; reason?: string }) => api.assignAmr(sessionId, amrUnitId, reason),
    onSuccess: invalidate,
  })
}

export function useReassignAmr() {
  const invalidate = useStaffInvalidation()
  return useMutation({
    mutationFn: ({ sessionId, amrUnitId, reason }: { sessionId: string; amrUnitId: string; reason: string }) => api.reassignAmr(sessionId, amrUnitId, reason),
    onSuccess: invalidate,
  })
}

export function useMissionCommand() {
  const invalidate = useStaffInvalidation()
  return useMutation({
    mutationFn: ({ sessionId, command, reason }: { sessionId: string; command: MissionCommand; reason?: string }) => api.commandMission(sessionId, command, reason),
    onSuccess: invalidate,
  })
}
