import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routeKeys } from '../routes/hooks'
import { toursApi } from './api/tours'
import type { TourInput, TourListQuery } from './types'

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
function useInvalidateTours() {
  const client = useQueryClient()
  // A Tour reference locks its Route, so Route usage changes too.
  return () => Promise.all([client.invalidateQueries({ queryKey: tourKeys.all }), client.invalidateQueries({ queryKey: routeKeys.all })])
}
export function useCreateTour() {
  const onSuccess = useInvalidateTours()
  return useMutation({ mutationFn: ({ requestId, routeVersion, input }: { requestId: string; routeVersion: string; input: TourInput }) =>
    toursApi.create(requestId, routeVersion, input), onSuccess })
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
