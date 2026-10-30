import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routeKeys } from '../routes/hooks'
import { versionedRoutesApi } from '../routes/versioned-api'
import { toursApi } from './api/tours'
import type { CreateTourInput, TourInput, TourListQuery } from './types'

// Separate from the labelled Tour demo's ['admin', 'tours'] cache; never used as its fallback.
export const tourKeys = {
  all: ['admin', 'tour-management'] as const,
  list: (query: TourListQuery) => ['admin', 'tour-management', 'list', query] as const,
  detail: (id: string) => ['admin', 'tour-management', 'detail', id] as const,
}

export function newRequestId(): string {
  return crypto.randomUUID()
}

export function useTours(query: TourListQuery) {
  return useQuery({ queryKey: tourKeys.list(query), queryFn: () => toursApi.list(query) })
}
export function useTour(id: string | undefined) {
  return useQuery({ queryKey: tourKeys.detail(id ?? ''), queryFn: () => toursApi.get(id!), enabled: Boolean(id), refetchOnWindowFocus: false })
}
export function useTourOperators() {
  return useQuery({ queryKey: [...tourKeys.all, 'operators'], queryFn: toursApi.operators })
}
/** Revisions a new Tour can use; the server rechecks this when the Tour is created. */
export function useTestedRoutes() {
  return useQuery({ queryKey: [...tourKeys.all, 'tested-routes'], queryFn: () => versionedRoutesApi.list(),
    select: page => page.data.filter(route => route.isSubmitted && route.verificationStatus === 'PASS') })
}
function useInvalidateTours() {
  const client = useQueryClient()
  // A Tour reference locks its Route, so Route usage changes too.
  return () => Promise.all([client.invalidateQueries({ queryKey: tourKeys.all }), client.invalidateQueries({ queryKey: routeKeys.all })])
}
export function useCreateTour() {
  const onSuccess = useInvalidateTours()
  return useMutation({ mutationFn: ({ requestId, input }: { requestId: string; input: CreateTourInput }) =>
    toursApi.create(requestId, input), onSuccess })
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
