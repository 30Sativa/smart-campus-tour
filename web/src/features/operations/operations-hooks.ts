/**
 * Server state for the operations dashboard: TanStack Query owns the cache, the
 * transport lives in `src/api/contracts/operations.ts`.
 *
 * While the ops backend is missing, `USE_MOCK_API` selects the labelled mock
 * implementation of the same contract. The choice is made once, here — no screen
 * branches on it, and no query falls back to fixtures when a request fails.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  operationsApi,
  type AmrStatus,
  type FeedbackFilters,
  type MissionCommand,
  type ScheduleFilters,
} from '../../api/contracts/operations'
import { mockOperationsApi } from '../../mocks/operations-mock'
import { USE_MOCK_API } from '../../mocks/mock-mode'

const api = USE_MOCK_API ? mockOperationsApi : operationsApi

const LIVE_REFETCH_MS = 15_000
const DASHBOARD_REFETCH_MS = 30_000

export const operationsQueryKeys = {
  all: ['operations'] as const,
  dashboard: (date?: string) => ['operations', 'dashboard', date] as const,
  schedule: (filters: ScheduleFilters) => ['operations', 'schedule', filters] as const,
  session: (id: string) => ['operations', 'session', id] as const,
  amrs: ['operations', 'amrs'] as const,
  twin: ['operations', 'digital-twin'] as const,
  alerts: (acknowledged?: boolean, severity?: string) => ['operations', 'alerts', acknowledged, severity] as const,
  feedback: (filters: FeedbackFilters) => ['operations', 'feedback', filters] as const,
}

export function useOpsDashboard(date?: string) {
  return useQuery({
    queryKey: operationsQueryKeys.dashboard(date),
    queryFn: () => api.dashboard(date),
    refetchInterval: DASHBOARD_REFETCH_MS,
  })
}

export function useOpsSchedule(filters: ScheduleFilters = {}) {
  return useQuery({
    queryKey: operationsQueryKeys.schedule(filters),
    queryFn: () => api.schedule(filters),
  })
}

export function useTourSession(id: string) {
  return useQuery({
    queryKey: operationsQueryKeys.session(id),
    queryFn: () => api.tourSession(id),
    enabled: Boolean(id),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useOpsAmrs() {
  return useQuery<AmrStatus[]>({
    queryKey: operationsQueryKeys.amrs,
    queryFn: () => api.amrs(),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useOpsTwin() {
  return useQuery<AmrStatus[]>({
    queryKey: operationsQueryKeys.twin,
    queryFn: () => api.digitalTwin(),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useOpsAlerts(acknowledged?: boolean, severity?: string) {
  return useQuery({
    queryKey: operationsQueryKeys.alerts(acknowledged, severity),
    queryFn: () => api.alerts(acknowledged, severity),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useFeedbackReports(filters: FeedbackFilters = {}) {
  return useQuery({
    queryKey: operationsQueryKeys.feedback(filters),
    queryFn: () => api.feedbackReports(filters),
  })
}

function useOperationsInvalidation() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: operationsQueryKeys.all })
}

export function useAcknowledgeAlert() {
  const invalidate = useOperationsInvalidation()
  return useMutation({
    mutationFn: ({ id, resolutionNote }: { id: string; resolutionNote?: string }) => api.acknowledgeAlert(id, resolutionNote),
    onSuccess: invalidate,
  })
}

export function useAssignAmr() {
  const invalidate = useOperationsInvalidation()
  return useMutation({
    mutationFn: ({ sessionId, amrUnitId, reason }: { sessionId: string; amrUnitId: string; reason?: string }) => api.assignAmr(sessionId, amrUnitId, reason),
    onSuccess: invalidate,
  })
}

export function useReassignAmr() {
  const invalidate = useOperationsInvalidation()
  return useMutation({
    mutationFn: ({ sessionId, amrUnitId, reason }: { sessionId: string; amrUnitId: string; reason: string }) => api.reassignAmr(sessionId, amrUnitId, reason),
    onSuccess: invalidate,
  })
}

export function useMissionCommand() {
  const invalidate = useOperationsInvalidation()
  return useMutation({
    mutationFn: ({ sessionId, command, reason }: { sessionId: string; command: MissionCommand; reason?: string }) => api.commandMission(sessionId, command, reason),
    onSuccess: invalidate,
  })
}
