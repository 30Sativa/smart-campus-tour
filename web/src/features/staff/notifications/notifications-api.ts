import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../api/client'
import type { ApiResponse } from '../../../api/contracts/shared'

/** One Technical Staff outcome Staff acts on (`GET /api/staff/notifications`, docs/architecture.md). */
export type StaffNotification = {
  id: number
  occurredAt: string
  action: string
  resultCode: string | null
  /** The POI proposal, Route, map version or robot to open; null when it is gone. */
  targetId: string | null
  subject: string | null
  revisionNumber: number | null
  robotCode: string | null
  actorName: string | null
}

export const STAFF_NOTIFICATION_SIZE = 30
/** No push event exists for these, so the bell re-reads; a Technical decision is not seconds-critical. */
const POLL_MS = 20_000

export const staffNotificationKeys = { list: ['staff', 'notifications'] as const }

export function useStaffNotifications() {
  return useQuery({
    queryKey: staffNotificationKeys.list,
    queryFn: () => apiClient<ApiResponse<StaffNotification[]>>(`/api/staff/notifications?size=${STAFF_NOTIFICATION_SIZE}`)
      .then(response => response.data ?? []),
    refetchInterval: POLL_MS,
  })
}
