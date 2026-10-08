import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { ReviewDetails, ReviewFilters, ReviewInput, ReviewSummary } from '../types'

export const registrationsApi = {
  list: (filters: ReviewFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value))
    return apiClient<PagedApiResponse<ReviewSummary>>(`/api/admin/registrations?${params}`, { signal })
  },
  get: (id: string, signal?: AbortSignal) => apiClient<ApiResponse<ReviewDetails>>(`/api/admin/registrations/${encodeURIComponent(id)}`, { signal }),
  review: (id: string, decision: 'approve' | 'reject', input: ReviewInput) =>
    apiClient<ApiResponse<null>>(`/api/admin/registrations/${encodeURIComponent(id)}/${decision}`, { method: 'POST', json: input }),
}
