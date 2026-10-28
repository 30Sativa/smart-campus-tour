import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { ReviewDetails, ReviewFilters, ReviewInput, ReviewSummary } from '../types'

export const registrationsApi = {
  list: (filters: ReviewFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value))
    return apiClient<PagedApiResponse<ReviewSummary>>(`/api/staff/manage/registrations?${params}`, { signal })
  },
  get: (id: string, signal?: AbortSignal) => apiClient<ApiResponse<ReviewDetails>>(`/api/staff/manage/registrations/${encodeURIComponent(id)}`, { signal }),
  reviewRow: (registrationId: string, rowId: string, decision: 'accept' | 'reject', input: ReviewInput) =>
    apiClient<ApiResponse<null>>(`/api/staff/manage/registrations/${encodeURIComponent(registrationId)}/rows/${encodeURIComponent(rowId)}/${decision}`, { method: 'POST', json: input }),
}
