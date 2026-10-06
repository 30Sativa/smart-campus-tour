import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth-store'
import { representativeApi as api } from './api/representative-api'
import type { ListParameters, RegistrationInput } from './api/types'

export const repQueryKeys = { all: ['representative'] as const, owner: (id: string) => ['representative', id] as const }
export function useRepTours(parameters: ListParameters = {}) {
  const owner = useAuthStore(s => s.user?.userId)
  return useQuery({ queryKey: [...repQueryKeys.owner(owner ?? ''), 'tours', parameters],
    queryFn: ({ signal }) => api.tours(parameters, signal), enabled: Boolean(owner), refetchInterval: 15000 })
}
export function useRepTour(id: string) {
  const owner = useAuthStore(s => s.user?.userId)
  return useQuery({ queryKey: [...repQueryKeys.owner(owner ?? ''), 'tour', id],
    queryFn: ({ signal }) => api.tour(id, signal), enabled: Boolean(owner && id), retry: false })
}
export function useRepRegistrations(parameters: ListParameters = {}) {
  const owner = useAuthStore(s => s.user?.userId)
  return useQuery({ queryKey: [...repQueryKeys.owner(owner ?? ''), 'registrations', parameters],
    queryFn: ({ signal }) => api.registrations(parameters, signal), enabled: Boolean(owner), refetchInterval: 15000 })
}
export function useRepRegistration(id: string | undefined) {
  const owner = useAuthStore(s => s.user?.userId)
  return useQuery({ queryKey: [...repQueryKeys.owner(owner ?? ''), 'registration', id],
    queryFn: ({ signal }) => api.registration(id!, signal), enabled: Boolean(owner && id), retry: false, refetchInterval: 15000 })
}
function useInvalidate() {
  const client = useQueryClient()
  const owner = useAuthStore(s => s.user?.userId)
  return () => client.invalidateQueries({ queryKey: repQueryKeys.owner(owner ?? '') })
}
export function useSubmitRegistration() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ tourId, input, requestId }: { tourId: string; input: RegistrationInput; requestId: string }) =>
    api.submit(tourId, input, requestId), onSuccess: invalidate })
}
export function useUpdateRegistration() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, input, version }: { id: string; input: RegistrationInput; version: string }) =>
    api.update(id, input, version), onSuccess: invalidate })
}
export function useResubmitRegistration() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, input, version }: { id: string; input: RegistrationInput; version: string }) =>
    api.resubmit(id, input, version), onSuccess: invalidate })
}
export function useCancelRegistration() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, version, tourVersion }: { id: string; version: string; tourVersion: string }) =>
    api.cancel(id, version, tourVersion), onSuccess: invalidate })
}
