/**
 * Server state for administration: TanStack Query owns the cache.
 *
 * The dashboard, Tour history and invitation demos remain bound to labelled mocks here;
 * live Tour CRUD lives in ./tours (ADR-0018).
 * Live registration review uses its separate SQL HTTP binding.
 * These separate caches and contracts must never be used as an error fallback.
 *
 * Every change invalidates the operations cache as well: Admin's "Chốt buổi"
 * is exactly what makes Staff's Start possible.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminTourFilters, RegistrationFilters } from '../../api/contracts/admin'
import { mockAdminInvitationService, mockAdminRegistrationService, mockAdminTourService } from '../../mocks/admin-mock'

const tours = mockAdminTourService
const registrations = mockAdminRegistrationService
const invitations = mockAdminInvitationService

/** Nothing here moves by itself; this only catches changes made elsewhere (a representative, Staff). */
const REFETCH_MS = 20_000

export const adminQueryKeys = {
  all: ['admin'] as const,
  tours: (filters: AdminTourFilters) => ['admin', 'tours', filters] as const,
  registrations: (filters: RegistrationFilters) => ['admin', 'registrations', filters] as const,
  registration: (id: string) => ['admin', 'registration', id] as const,
  invitation: (id: string) => ['admin', 'invitation', id] as const,
}

export function useAdminTours(filters: AdminTourFilters = {}) {
  return useQuery({ queryKey: adminQueryKeys.tours(filters), queryFn: () => tours.list(filters), refetchInterval: REFETCH_MS })
}

export function useAdminRegistrations(filters: RegistrationFilters = {}) {
  return useQuery({ queryKey: adminQueryKeys.registrations(filters), queryFn: () => registrations.list(filters), refetchInterval: REFETCH_MS })
}

/** A registration under review. Not polled: a roster must not change under the reviewer's eyes; "Tải lại" is explicit. */
export function useAdminRegistration(id: string | null) {
  return useQuery({ queryKey: adminQueryKeys.registration(id ?? ''), queryFn: () => registrations.get(id as string), enabled: Boolean(id) })
}

export function useInvitationPreview(id: string | null) {
  return useQuery({ queryKey: adminQueryKeys.invitation(id ?? ''), queryFn: () => invitations.preview(id as string), enabled: Boolean(id), retry: false })
}

/* ── Commands ─────────────────────────────────────────────────────────────── */

function useInvalidateAll() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['staff'] }),
    ])
}

export function useReviewRegistration() {
  const onSuccess = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, decision, version, reason }: { id: string; decision: 'approve' | 'reject'; version: number; reason?: string }) =>
      decision === 'approve' ? registrations.approve(id, version) : registrations.reject(id, reason ?? '', version),
    onSuccess,
  })
}

export function useSendInvitation() {
  const invalidate = useInvalidateAll()
  // A failed send is recorded too (the "Không thể gửi" state), so refresh either way.
  return useMutation({ mutationFn: (id: string) => invitations.send(id), onSettled: () => invalidate() })
}
