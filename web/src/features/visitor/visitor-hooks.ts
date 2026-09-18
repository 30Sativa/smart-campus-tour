/**
 * Server state for the visitor app: TanStack Query owns the cache, the transport
 * lives in `src/api/contracts/visitor.ts`.
 *
 * While the visitor backend is missing, `USE_MOCK_API` selects the labelled mock
 * implementation of the same contract. The choice is made once, here — no screen
 * branches on it, and no query falls back to fixtures when a request fails.
 *
 * Mirrors `features/staff/staff-hooks.ts` deliberately: same key
 * factory shape, same one-line hooks, same place for the refetch intervals.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  visitorApi,
  type LocationFilters,
  type NewBooking,
  type ProfileUpdate,
  type TourCommand,
} from '../../api/contracts/visitor'
import { mockVisitorApi } from '../../mocks/visitor-mock'
import { USE_MOCK_API } from '../../mocks/mock-mode'

const api = USE_MOCK_API ? mockVisitorApi : visitorApi

/** A running tour moves, so it is polled. Nothing else here is. */
const ACTIVE_TOUR_REFETCH_MS = 15_000
const NOTIFICATIONS_REFETCH_MS = 60_000

export const visitorQueryKeys = {
  all: ['visitor'] as const,
  locations: (filters: LocationFilters) => ['visitor', 'locations', filters] as const,
  location: (id: string) => ['visitor', 'location', id] as const,
  meetingPoints: ['visitor', 'meeting-points'] as const,
  slots: (date: string) => ['visitor', 'slots', date] as const,
  bookings: ['visitor', 'bookings'] as const,
  tours: ['visitor', 'tours'] as const,
  activeTour: ['visitor', 'active-tour'] as const,
  notifications: ['visitor', 'notifications'] as const,
  profile: ['visitor', 'profile'] as const,
}

export function useCampusLocations(filters: LocationFilters = {}) {
  return useQuery({
    queryKey: visitorQueryKeys.locations(filters),
    queryFn: () => api.locations(filters),
  })
}

export function useCampusLocation(id: string) {
  return useQuery({
    queryKey: visitorQueryKeys.location(id),
    queryFn: () => api.location(id),
    enabled: Boolean(id),
  })
}

export function useMeetingPoints() {
  return useQuery({ queryKey: visitorQueryKeys.meetingPoints, queryFn: () => api.meetingPoints() })
}

export function useBookingSlots(date: string) {
  return useQuery({
    queryKey: visitorQueryKeys.slots(date),
    queryFn: () => api.slots(date),
    enabled: Boolean(date),
  })
}

export function useMyBookings() {
  return useQuery({ queryKey: visitorQueryKeys.bookings, queryFn: () => api.bookings() })
}

export function useMyTours() {
  return useQuery({ queryKey: visitorQueryKeys.tours, queryFn: () => api.tours() })
}

export function useActiveTour() {
  return useQuery({
    queryKey: visitorQueryKeys.activeTour,
    queryFn: () => api.activeTour(),
    refetchInterval: ACTIVE_TOUR_REFETCH_MS,
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: visitorQueryKeys.notifications,
    queryFn: () => api.notifications(),
    refetchInterval: NOTIFICATIONS_REFETCH_MS,
  })
}

export function useVisitorProfile() {
  return useQuery({ queryKey: visitorQueryKeys.profile, queryFn: () => api.profile() })
}

/* ── Mutations ────────────────────────────────────────────────────────────── */

export function useCreateBooking() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (booking: NewBooking) => api.createBooking(booking),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: visitorQueryKeys.bookings })
      void client.invalidateQueries({ queryKey: visitorQueryKeys.notifications })
    },
  })
}

export function useCancelBooking() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.cancelBooking(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: visitorQueryKeys.bookings })
    },
  })
}

export function useTourCommand() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, command }: { sessionId: string; command: TourCommand }) =>
      api.commandTour(sessionId, command),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: visitorQueryKeys.activeTour })
      void client.invalidateQueries({ queryKey: visitorQueryKeys.tours })
      void client.invalidateQueries({ queryKey: visitorQueryKeys.bookings })
    },
  })
}

export function useAskAssistant() {
  return useMutation({ mutationFn: (question: string) => api.ask(question) })
}

export function useMarkNotificationsRead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api.markNotificationsRead(),
    onSuccess: (data) => client.setQueryData(visitorQueryKeys.notifications, data),
  })
}

export function useUpdateProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (update: ProfileUpdate) => api.updateProfile(update),
    onSuccess: (data) => client.setQueryData(visitorQueryKeys.profile, data),
  })
}
