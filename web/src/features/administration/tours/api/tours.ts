import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { TourDetails, TourInput, TourListQuery, TourSummary } from '../types'

type Mutation = ApiResponse<{ id: string }>

export const toursApi = {
  list: (query: TourListQuery) => {
    const params = new URLSearchParams({ page: String(query.page), size: String(query.size) })
    if (query.search?.trim()) params.set('search', query.search.trim())
    if (query.state) params.set('state', query.state)
    return apiClient<PagedApiResponse<TourSummary>>(`/api/staff/manage/tours?${params}`)
  },
  get: (id: string) => apiClient<ApiResponse<TourDetails>>(`/api/staff/manage/tours/${id}`).then(r => r.data!),
  create: (requestId: string, expectedRouteVersion: string, configuration: TourInput) =>
    apiClient<Mutation>('/api/staff/manage/tours', { method: 'POST', json: { requestId, expectedRouteVersion, configuration } }).then(r => r.data!.id),
  update: (id: string, body: { requestId: string; expectedRowVersion: string; expectedRouteVersion: string | null; configuration: TourInput }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}`, { method: 'PUT', json: body }).then(() => id),
  cancel: (id: string, body: { requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/cancel`, { method: 'POST', json: body }).then(() => id),
}
