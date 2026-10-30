import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { CreateTourInput, TourDetails, TourInput, TourListQuery, TourOperator, TourSlots, TourSummary } from '../types'

type Mutation = ApiResponse<{ id: string }>

export const toursApi = {
  list: (query: TourListQuery) => {
    const params = new URLSearchParams({ page: String(query.page), size: String(query.size) })
    if (query.search?.trim()) params.set('search', query.search.trim())
    if (query.state) params.set('state', query.state)
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
    if (query.sort) params.set('sort', query.sort)
    return apiClient<PagedApiResponse<TourSummary>>(`/api/staff/manage/tours?${params}`)
  },
  get: (id: string) => apiClient<ApiResponse<TourDetails>>(`/api/staff/manage/tours/${id}`).then(r => r.data!),
  operators: () => apiClient<ApiResponse<TourOperator[]>>('/api/staff/manage/tours/operators').then(r => r.data ?? []),
  slots: (routeRevisionId: string, robotCode: string, from: string, to: string, time?: string) => {
    const params = new URLSearchParams({ routeRevisionId, robotCode, from, to })
    if (time) params.set('time', time)
    return apiClient<ApiResponse<TourSlots>>(`/api/staff/manage/tours/slots?${params}`).then(r => r.data!)
  },
  create: (requestId: string, configuration: CreateTourInput) =>
    apiClient<Mutation>('/api/staff/manage/tours', { method: 'POST', json: { requestId, configuration } }).then(r => r.data!.id),
  update: (id: string, body: { requestId: string; expectedRowVersion: string; expectedRouteVersion: string | null; configuration: TourInput }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}`, { method: 'PUT', json: body }).then(() => id),
  cancel: (id: string, body: { requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/cancel`, { method: 'POST', json: body }).then(() => id),
}
