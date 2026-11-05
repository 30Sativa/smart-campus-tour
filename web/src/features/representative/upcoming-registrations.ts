import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth-store'
import { representativeApi } from './api/representative-api'
import type { RegistrationSummary } from './api/types'
import { repQueryKeys, repReadQueryOptions } from './representative-hooks'

/** Recent updates do not necessarily contain the nearest scheduled visit. */
export async function loadActiveRegistrations(signal?: AbortSignal): Promise<RegistrationSummary[]> {
  const first = await representativeApi.registrations({ group: 'active', page: 1, size: 100, sort: '-updatedAt' }, signal)
  if (!first.success) throw new Error('Unable to load registrations')
  const records = new Map(first.data.map(registration => [registration.id, registration]))
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    const response = await representativeApi.registrations({ group: 'active', page, size: 100, sort: '-updatedAt' }, signal)
    if (!response.success) throw new Error('Unable to load registrations')
    response.data.forEach(registration => records.set(registration.id, registration))
  }
  return [...records.values()]
}

export function nextUpcomingRegistration(registrations: RegistrationSummary[], now = Date.now()): RegistrationSummary | null {
  return registrations.filter(registration =>
    (registration.state === 'SUBMITTED' || registration.state === 'APPROVED') &&
    (registration.tourState === 'SCHEDULED' || registration.tourState === 'READY') &&
    new Date(registration.tourScheduledStartAt).getTime() > now
  ).sort((a, b) => new Date(a.tourScheduledStartAt).getTime() - new Date(b.tourScheduledStartAt).getTime())[0] ?? null
}

export function useUpcomingRepRegistrations() {
  const owner = useAuthStore(state => state.user?.userId)
  return useQuery({
    ...repReadQueryOptions,
    queryKey: [...repQueryKeys.owner(owner ?? ''), 'upcoming-registrations'],
    queryFn: ({ signal }) => loadActiveRegistrations(signal),
    enabled: Boolean(owner),
    refetchInterval: 15000,
  })
}
