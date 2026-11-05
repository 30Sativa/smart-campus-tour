import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routeKeys } from '../routes/hooks'
import { versionedRoutesApi } from '../routes/versioned-api'
import { toursApi } from './api/tours'
import { dayEnd, dayStart } from './tour-calendar'
import type { CreateTourInput, TourInput, TourListQuery } from './types'

// Separate from the labelled Tour demo's ['admin', 'tours'] cache; never used as its fallback.
export const tourKeys = {
  all: ['admin', 'tour-management'] as const,
  list: (query: TourListQuery) => ['admin', 'tour-management', 'list', query] as const,
  detail: (id: string) => ['admin', 'tour-management', 'detail', id] as const,
  slots: ['admin', 'tour-management', 'slots'] as const,
}

export function newRequestId(): string {
  return crypto.randomUUID()
}

export function useTours(query: TourListQuery) {
  return useQuery({ queryKey: tourKeys.list(query), queryFn: () => toursApi.list(query) })
}
const CALENDAR_SIZE = 100
/** The live Tours of a campus date range, with their robot holds. */
export function useTourCalendar(from: string, to: string) {
  return useTours({ from: dayStart(from), to: dayEnd(to), sort: 'scheduledStartAt', page: 1, size: CALENDAR_SIZE })
}
/** Availability of one campus date. Refreshed when a create is refused, because a slot was taken meanwhile. */
/** With `customTime`, the day also judges that one start, so a typed time and a slot get the same answer. */
export function useTourRobots(routeRevisionId: string) {
  return useQuery({ queryKey: [...tourKeys.all, 'robots', routeRevisionId], queryFn: () => toursApi.robots(routeRevisionId), enabled: Boolean(routeRevisionId) })
}
export function useTourSlots(routeRevisionId: string, robotCode: string, date: string, customTime?: string) {
  return useQuery({ queryKey: [...tourKeys.slots, routeRevisionId, robotCode, date, customTime ?? ''], queryFn: () => toursApi.slots(routeRevisionId, robotCode, date, date, customTime),
    enabled: Boolean(routeRevisionId && robotCode && date && customTime !== ''), retry: false })
}
export function useTour(id: string | undefined) {
  return useQuery({ queryKey: tourKeys.detail(id ?? ''), queryFn: () => toursApi.get(id!), enabled: Boolean(id), refetchOnWindowFocus: false })
}
export function useTourOperators() {
  return useQuery({ queryKey: [...tourKeys.all, 'operators'], queryFn: toursApi.operators })
}
/** Revisions a new Tour can use; the server rechecks this when the Tour is created. */
export function useTestedRoutes() {
  return useQuery({ queryKey: [...tourKeys.all, 'tested-routes'], queryFn: () => versionedRoutesApi.list(1, true),
    select: page => page.data.filter(route => route.isSubmitted && route.verificationStatus === 'PASS') })
}
function useInvalidateTours() {
  const client = useQueryClient()
  // A Tour reference locks its Route, so Route usage changes too.
  return () => Promise.all([client.invalidateQueries({ queryKey: tourKeys.all }), client.invalidateQueries({ queryKey: routeKeys.all })])
}
export function useCreateTour() {
  const onSuccess = useInvalidateTours()
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ requestId, input }: { requestId: string; input: CreateTourInput }) =>
    toursApi.create(requestId, input), onSuccess, onError: () => client.invalidateQueries({ queryKey: tourKeys.slots }) })
}
export function useUpdateTour() {
  const onSuccess = useInvalidateTours()
  return useMutation({ mutationFn: ({ id, requestId, rowVersion, routeVersion, input }: { id: string; requestId: string; rowVersion: string; routeVersion: string | null; input: TourInput }) =>
    toursApi.update(id, { requestId, expectedRowVersion: rowVersion, expectedRouteVersion: routeVersion, configuration: input }), onSuccess })
}
export function useCancelTour() {
  const onSuccess = useInvalidateTours()
  return useMutation({ mutationFn: ({ id, requestId, rowVersion, reason }: { id: string; requestId: string; rowVersion: string; reason: string }) =>
    toursApi.cancel(id, { requestId, expectedRowVersion: rowVersion, reason }), onSuccess })
}
/** SCHEDULED → READY. The server rechecks every READY condition under its locks. */
export function useMarkTourReady() {
  // A refusal can mean the Tour changed meanwhile (STALE_VERSION), so refresh either way.
  const refresh = useInvalidateTours()
  return useMutation({ mutationFn: ({ id, requestId, rowVersion }: { id: string; requestId: string; rowVersion: string }) =>
    toursApi.markReady(id, { requestId, expectedRowVersion: rowVersion }), onSettled: refresh })
}
/** READY → SCHEDULED, with a reason for the Tour log. */
export function useReopenTour() {
  const refresh = useInvalidateTours()
  return useMutation({ mutationFn: ({ id, requestId, rowVersion, reason }: { id: string; requestId: string; rowVersion: string; reason: string }) =>
    toursApi.reopen(id, { requestId, expectedRowVersion: rowVersion, reason }), onSettled: refresh })
}
/**
 * One idempotency key per attempt: kept while `scope` (action and the Tour's row
 * version) is the same, so a retry after a lost response replays instead of
 * acting twice; renewed once the Tour has changed.
 */
export function useRequestId(scope: string) {
  const [entry, setEntry] = useState(() => ({ scope, id: newRequestId() }))
  if (entry.scope !== scope) {
    const next = { scope, id: newRequestId() }
    setEntry(next)
    return next.id
  }
  return entry.id
}
