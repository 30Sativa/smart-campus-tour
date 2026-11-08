import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { EmailChangeDecisionInput, ReviewDetails, ReviewFilters, ReviewInput, ReviewSummary, StaffEmailChange } from '../types'

export const registrationsApi = {
  list: (filters: ReviewFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value))
    return apiClient<PagedApiResponse<ReviewSummary>>(`/api/staff/manage/registrations?${params}`, { signal })
  },
  get: (id: string, signal?: AbortSignal) => apiClient<ApiResponse<ReviewDetails>>(`/api/staff/manage/registrations/${encodeURIComponent(id)}`, { signal }),
  reviewRow: (registrationId: string, rowId: string, decision: 'accept' | 'reject', input: ReviewInput) =>
    apiClient<ApiResponse<null>>(`/api/staff/manage/registrations/${encodeURIComponent(registrationId)}/rows/${encodeURIComponent(rowId)}/${decision}`, { method: 'POST', json: input }),
  pendingEmailChanges: (signal?: AbortSignal) => apiClient<ApiResponse<StaffEmailChange[]>>('/api/staff/manage/roster-email-change-requests?state=PENDING', { signal }),
  reviewEmailChange: (requestId: string, decision: 'accept' | 'reject', input: EmailChangeDecisionInput) =>
    apiClient<ApiResponse<null>>(`/api/staff/manage/roster-email-change-requests/${encodeURIComponent(requestId)}/${decision}`, { method: 'POST', json: input }),
}
