import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../../stores/auth-store'
import { registrationsApi as api } from './api/registrations'
import type { ReviewFilters, ReviewInput } from './types'

const ownerKey = (id: string) => ['admin-registration-review', id] as const
export function useRegistrationReviews(filters: ReviewFilters) {
  const owner = useAuthStore(s => s.user?.userId)
  return useQuery({ queryKey: [...ownerKey(owner ?? ''), 'list', filters], queryFn: ({ signal }) => api.list(filters, signal),
    enabled: Boolean(owner), refetchInterval: 15000, retry: false })
}
export function useRegistrationReview(id: string) {
  const owner = useAuthStore(s => s.user?.userId)
  // The reviewer decides on the snapshot they opened. Focus/reconnect cannot replace it.
  return useQuery({ queryKey: [...ownerKey(owner ?? ''), 'detail', id], queryFn: async ({ signal }) => (await api.get(id, signal)).data,
    enabled: Boolean(owner && id), retry: false, staleTime: Infinity, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false })
}
export function useReviewDecision() {
  const owner = useAuthStore(s => s.user?.userId)
  const client = useQueryClient()
  return useMutation({ mutationFn: ({ id, decision, input }: { id: string; decision: 'approve' | 'reject'; input: ReviewInput }) => api.review(id, decision, input),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: [...ownerKey(owner ?? ''), 'list'] }),
      client.invalidateQueries({ queryKey: ['representative'] }),
    ]) })
}
