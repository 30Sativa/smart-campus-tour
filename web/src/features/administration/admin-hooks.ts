/**
 * Server state for administration: TanStack Query owns the cache.
 *
 * `/api/admin/*` does not exist yet, so the four services are bound to their
 * labelled mocks here and nowhere else. When the endpoints land, replace the
 * four `mock…Service` bindings with `adminTourService`, `adminRegistrationService`,
 * `adminInvitationService` and `adminRouteService` from `api/contracts/admin.ts`.
 *
 * Every change invalidates the operations cache as well: Admin's "Chốt buổi"
 * is exactly what makes Staff's Start possible.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminTourFilters, RegistrationFilters, TourInput } from '../../api/contracts/admin'
import { mockAdminInvitationService, mockAdminRegistrationService, mockAdminRouteService, mockAdminTourService } from '../../mocks/admin-mock'

const tours = mockAdminTourService
const registrations = mockAdminRegistrationService
const invitations = mockAdminInvitationService
const routes = mockAdminRouteService

/** Nothing here moves by itself; this only catches changes made elsewhere (a representative, Staff). */
const REFETCH_MS = 20_000

export const adminQueryKeys = {
  all: ['admin'] as const,
  tours: (filters: AdminTourFilters) => ['admin', 'tours', filters] as const,
  tour: (id: string) => ['admin', 'tour', id] as const,
  registrations: (filters: RegistrationFilters) => ['admin', 'registrations', filters] as const,
  registration: (id: string) => ['admin', 'registration', id] as const,
  invitation: (id: string) => ['admin', 'invitation', id] as const,
  routes: ['admin', 'routes'] as const,
}

export function useAdminTours(filters: AdminTourFilters = {}) {
  return useQuery({ queryKey: adminQueryKeys.tours(filters), queryFn: () => tours.list(filters), refetchInterval: REFETCH_MS })
}

export function useAdminTour(id: string) {
  return useQuery({ queryKey: adminQueryKeys.tour(id), queryFn: () => tours.get(id), enabled: Boolean(id), refetchInterval: REFETCH_MS })
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

export function useAdminRoutes() {
  return useQuery({ queryKey: adminQueryKeys.routes, queryFn: () => routes.list() })
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

export function useCreateTour() {
  const onSuccess = useInvalidateAll()
  return useMutation({ mutationFn: ({ input, requestId }: { input: TourInput; requestId: string }) => tours.create(input, requestId), onSuccess })
}

export function useUpdateTour() {
  const onSuccess = useInvalidateAll()
  return useMutation({ mutationFn: ({ id, input, version }: { id: string; input: TourInput; version: number }) => tours.update(id, input, version), onSuccess })
}

export type TourTransition = 'finalize' | 'reopen' | 'cancel'

export function useTourTransition() {
  const onSuccess = useInvalidateAll()
  return useMutation({
    mutationFn: ({ id, action, version, reason }: { id: string; action: TourTransition; version: number; reason?: string }) =>
      action === 'cancel' ? tours.cancel(id, reason ?? '', version) : action === 'finalize' ? tours.finalize(id, version) : tours.reopen(id, version),
    onSuccess,
  })
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
