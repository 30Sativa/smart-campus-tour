import { apiClient } from '../../../api/client'
import type { PagedApiResponse } from '../../../api/contracts/shared'

export type AuditLogEntry = {
  id: number; occurredAt: string; action: string; entityType: string; entityId: string
  actorUserId: string | null; actorName: string | null; tourId: string | null; tourName: string | null
  robotCode: string | null; resultCode: string | null
}
export type AuditLogFilter = { action: string; actor: string; from: string; to: string; page: number }

export const AUDIT_PAGE_SIZE = 20

export function listAuditLogs(filter: AuditLogFilter) {
  const query = new URLSearchParams({ page: String(filter.page), size: String(AUDIT_PAGE_SIZE) })
  if (filter.action) query.set('action', filter.action)
  if (filter.actor.trim()) query.set('actor', filter.actor.trim())
  if (filter.from) query.set('from', new Date(filter.from).toISOString())
  if (filter.to) query.set('to', new Date(filter.to).toISOString())
  return apiClient<PagedApiResponse<AuditLogEntry>>(`/api/admin/system-audit-logs?${query}`)
}
