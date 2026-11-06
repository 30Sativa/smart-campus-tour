import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { CreateTourInput, StartConfirmation, TourDetails, TourInput, TourListQuery, TourOperator, TourRobotOption, TourShifts, TourSlots,TourStartChecks, TourSummary } from '../types'

type Mutation = ApiResponse<{ id: string }>

export const toursApi = {
  list: (query: TourListQuery) => {
    const params = new URLSearchParams({ page: String(query.page), size: String(query.size) })
    if (query.search?.trim()) params.set('search', query.search.trim())
    if (query.state) params.set('state', query.state)
    if (query.phase) params.set('phase', query.phase)
    if (query.from) params.set('from', query.from)
    if (query.to) params.set('to', query.to)
    if (query.sort) params.set('sort', query.sort)
    return apiClient<PagedApiResponse<TourSummary>>(`/api/staff/manage/tours?${params}`)
  },
  get: (id: string) => apiClient<ApiResponse<TourDetails>>(`/api/staff/manage/tours/${id}`).then(r => r.data!),
  operators: () => apiClient<ApiResponse<TourOperator[]>>('/api/staff/manage/tours/operators').then(r => r.data ?? []),
  robots: (routeRevisionId: string) => apiClient<ApiResponse<TourRobotOption[]>>(`/api/staff/manage/tours/robots?routeRevisionId=${encodeURIComponent(routeRevisionId)}`).then(r => r.data ?? []),
  slots: (routeRevisionId: string, robotCode: string, from: string, to: string) =>
    apiClient<ApiResponse<TourSlots>>(`/api/staff/manage/tours/slots?${new URLSearchParams({ routeRevisionId, robotCode, from, to })}`).then(r => r.data!),
  shifts: (from: string, to: string) =>
    apiClient<ApiResponse<TourShifts>>(`/api/staff/manage/tours/shifts?${new URLSearchParams({ from, to })}`).then(r => r.data!),
  create: (requestId: string, configuration: CreateTourInput) =>
    apiClient<Mutation>('/api/staff/manage/tours', { method: 'POST', json: { requestId, configuration } }).then(r => r.data!.id),
  update: (id: string, body: { requestId: string; expectedRowVersion: string; expectedRouteVersion: string | null; configuration: TourInput }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}`, { method: 'PUT', json: body }).then(() => id),
  cancel: (id: string, body: { requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/cancel`, { method: 'POST', json: body }).then(() => id),
  markReady: (id: string, body: { requestId: string; expectedRowVersion: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/ready`, { method: 'POST', json: body }).then(() => id),
  reopen: (id: string, body: { requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/reopen`, { method: 'POST', json: body }).then(() => id),
  startChecks: (id: string) => apiClient<ApiResponse<TourStartChecks>>(`/api/staff/manage/tours/${id}/start-checks`).then(r => r.data!),
  start: (id: string, body: { requestId: string; expectedRowVersion: string; confirmation: StartConfirmation }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/start`, { method: 'POST', json: body }).then(() => id),
  next: (id: string, body: { requestId: string; expectedRowVersion: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/next`, { method: 'POST', json: body }).then(() => id),
  endEarly: (id: string, body: { requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/end-early`, { method: 'POST', json: body }).then(() => id),
  retryLeg: (id: string, body: { requestId: string; expectedRowVersion: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/retry-leg`, { method: 'POST', json: body }).then(() => id),
  /** No row version: it targets one command, which the server locks and checks is still UNKNOWN. */
  reconcile: (id: string, commandId: string, body: { requestId: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/commands/${commandId}/reconcile`, { method: 'POST', json: body }).then(() => id),
}
