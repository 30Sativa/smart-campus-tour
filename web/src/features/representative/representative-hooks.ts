/**
 * Server state for the representative area: TanStack Query owns the cache.
 *
 * `/api/representative/*` does not exist yet, so the service is bound to its
 * labelled mock here and nowhere else. When the endpoints land, replace
 * `mockRepresentativeService` with `representativeService` from
 * `api/contracts/representative.ts`.
 *
 * Every change also invalidates the admin and operations caches: a group sent
 * here is what Admin reviews next.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RegistrationInput } from '../../api/contracts/representative'
import { mockRepresentativeService } from '../../mocks/representative-mock'

const service = mockRepresentativeService

/** Admin's decision arrives from elsewhere; this is how quickly the screen notices it. */
const REFETCH_MS = 15_000

export const repQueryKeys = {
  all: ['representative'] as const,
  tours: ['representative', 'tours'] as const,
  tour: (id: string) => ['representative', 'tour', id] as const,
  registrations: ['representative', 'registrations'] as const,
  registration: (id: string) => ['representative', 'registration', id] as const,
}

export function useRepTours() {
  return useQuery({ queryKey: repQueryKeys.tours, queryFn: () => service.listTours(), refetchInterval: REFETCH_MS })
}

export function useRepTour(id: string) {
  return useQuery({ queryKey: repQueryKeys.tour(id), queryFn: () => service.getTour(id), enabled: Boolean(id), retry: false })
}

export function useRepRegistrations() {
  return useQuery({ queryKey: repQueryKeys.registrations, queryFn: () => service.listRegistrations(), refetchInterval: REFETCH_MS })
}

export function useRepRegistration(id: string | undefined) {
  return useQuery({
    queryKey: repQueryKeys.registration(id ?? ''),
    queryFn: () => service.getRegistration(id as string),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: REFETCH_MS,
  })
}

function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: repQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
      queryClient.invalidateQueries({ queryKey: ['staff'] }),
    ])
}

/** Refresh after a refusal too: the reason is usually that the data moved (flow review §10.1). */
function mutationOptions(invalidate: () => Promise<unknown>) {
  return { onSuccess: invalidate, onError: invalidate }
}

export function useSubmitRegistration() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ tourId, input, requestId }: { tourId: string; input: RegistrationInput; requestId: string }) => service.submit(tourId, input, requestId),
    ...mutationOptions(invalidate),
  })
}

export function useUpdateRegistration() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, input, version }: { id: string; input: RegistrationInput; version: number }) => service.update(id, input, version),
    ...mutationOptions(invalidate),
  })
}

export function useCancelRegistration() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => service.cancel(id, version),
    ...mutationOptions(invalidate),
  })
}
