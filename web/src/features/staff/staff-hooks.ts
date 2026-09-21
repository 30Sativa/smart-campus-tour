/**
 * Server state for the operations console: TanStack Query owns the cache.
 *
 * The ops backend does not exist, so the data source is the labelled mock
 * implementation of the `StaffApi` contract, and the push channel is the mock
 * of the `StaffRealtime` contract. Both are named once, here: no screen knows
 * where its rows came from, and no query falls back to fixtures when something
 * fails, because there is nothing to fall back from.
 *
 * When `/api/staff/*` and the operations hub land, swap these two bindings for
 * `staffApi` (`api/contracts/staff.ts`) and `createStaffRealtimeHub()`
 * (`api/contracts/staff-realtime.ts`), which implement the same types.
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AmrStatus, FeedbackFilters, StartConfirmation, TourCommand, TourFilters, TourOperationDetail } from '../../api/contracts/staff'
import type { RealtimeConnectionState, StaffRealtimeEvent } from '../../api/contracts/staff-realtime'
import { mockStaffApi } from '../../mocks/staff-mock'
import { mockStaffRealtime } from '../../mocks/staff-realtime-mock'

const api = mockStaffApi
const realtime = mockStaffRealtime

/** Safety net only: the push channel is what keeps these fresh. */
const LIVE_REFETCH_MS = 15_000
const LIST_REFETCH_MS = 30_000
/** A Tour being watched is re-read often: its allowed actions follow live robot state. */
const TOUR_REFETCH_MS = 5_000

export const staffQueryKeys = {
  all: ['staff'] as const,
  tours: (filters: TourFilters) => ['staff', 'tours', filters] as const,
  toursRoot: ['staff', 'tours'] as const,
  tour: (id: string) => ['staff', 'tour', id] as const,
  amrs: ['staff', 'amrs'] as const,
  alerts: ['staff', 'alerts'] as const,
  feedback: (filters: FeedbackFilters) => ['staff', 'feedback', filters] as const,
}

export function useTours(filters: TourFilters = {}) {
  return useQuery({
    queryKey: staffQueryKeys.tours(filters),
    queryFn: () => api.tours(filters),
    refetchInterval: filters.history ? false : LIST_REFETCH_MS,
  })
}

/**
 * One Tour. A response older than what is already cached is dropped, so a slow
 * refetch can never move the screen backwards (scope §8.6: revision per epoch).
 */
export function useTour(id: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: staffQueryKeys.tour(id),
    queryFn: async () => {
      const next = await api.tour(id)
      const cached = queryClient.getQueryData<TourOperationDetail>(staffQueryKeys.tour(id))
      return cached && cached.revision > next.revision ? cached : next
    },
    enabled: Boolean(id),
    refetchInterval: TOUR_REFETCH_MS,
  })
}

/** Robots. Administration reads the same key. */
export function useStaffAmrs() {
  return useQuery<AmrStatus[]>({
    queryKey: staffQueryKeys.amrs,
    queryFn: () => api.amrs(),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

/** Assistance history, read by administration's analytics. */
export function useStaffAlerts() {
  return useQuery({
    queryKey: staffQueryKeys.alerts,
    queryFn: () => api.alerts(),
    refetchInterval: LIVE_REFETCH_MS,
  })
}

export function useFeedbackReports(filters: FeedbackFilters = {}) {
  return useQuery({
    queryKey: staffQueryKeys.feedback(filters),
    queryFn: () => api.feedbackReports(filters),
  })
}

/* ── Commands ─────────────────────────────────────────────────────────────── */

function useStaffInvalidation() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: staffQueryKeys.all })
}

export function useStartTour() {
  const onSuccess = useStaffInvalidation()
  return useMutation({ mutationFn: ({ tourId, confirmation }: { tourId: string; confirmation: StartConfirmation }) => api.startTour(tourId, confirmation), onSuccess })
}

export function useTourCommand() {
  const onSuccess = useStaffInvalidation()
  return useMutation({ mutationFn: ({ tourId, command, reason }: { tourId: string; command: TourCommand; reason?: string }) => api.commandTour(tourId, command, reason), onSuccess })
}

export function useConfirmRobotReady() {
  const onSuccess = useStaffInvalidation()
  return useMutation({ mutationFn: ({ robotId, note }: { robotId: string; note?: string }) => api.confirmRobotReady(robotId, note), onSuccess })
}

/* ── Realtime ─────────────────────────────────────────────────────────────── */

export type AssistanceNotice = Extract<StaffRealtimeEvent, { type: 'AssistanceRequired' }>

/**
 * The one subscription to the push channel, owned by the staff shell.
 *
 * Robot telemetry is written straight into the robot query (latest state).
 * A Tour change names the Tour and its revision; the owning queries refetch,
 * and `useTour` drops anything older than what it holds. `onAssistance` lets
 * the shell surface a Tour that needs a person wherever the operator is.
 */
export function useStaffRealtimeSync(onAssistance?: (notice: AssistanceNotice) => void) {
  const queryClient = useQueryClient()
  const [connection, setConnection] = useState<RealtimeConnectionState>('connecting')
  const onAssistanceRef = useRef(onAssistance)

  useEffect(() => {
    onAssistanceRef.current = onAssistance
  }, [onAssistance])

  useEffect(() => {
    return realtime.subscribe((event) => {
      switch (event.type) {
        case 'FleetUpdated':
          queryClient.setQueryData(staffQueryKeys.amrs, event.robots)
          break
        case 'TourUpdated': {
          const cached = queryClient.getQueryData<TourOperationDetail>(staffQueryKeys.tour(event.tourId))
          if (!cached || cached.revision < event.revision) void queryClient.invalidateQueries({ queryKey: staffQueryKeys.tour(event.tourId) })
          void queryClient.invalidateQueries({ queryKey: staffQueryKeys.toursRoot })
          break
        }
        case 'AssistanceRequired':
          onAssistanceRef.current?.(event)
          void queryClient.invalidateQueries({ queryKey: staffQueryKeys.alerts })
          break
      }
    }, setConnection)
  }, [queryClient])

  return connection
}
