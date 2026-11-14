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
    if (query.operator) params.set('operator', query.operator)
    if (query.needsReconcile) params.set('needsReconcile', 'true')
    if (query.readyBlockers) params.set('readyBlockers', 'true')
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
  changeCapacity: (id: string, body: { requestId: string; expectedRowVersion: string; capacity: number }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/capacity`, { method: 'POST', json: body }).then(() => id),
  changeOperator: (id: string, body: { requestId: string; expectedRowVersion: string; operatorUserId: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/operator`, { method: 'POST', json: body }).then(() => id),
  /** `holdAtStart`: the checks for opening the Tour without its first leg. */
  startChecks: (id: string, holdAtStart = false) =>
    apiClient<ApiResponse<TourStartChecks>>(`/api/staff/manage/tours/${id}/start-checks${holdAtStart ? '?holdAtStart=true' : ''}`).then(r => r.data!),
  /** `holdAtStart: true` opens the Tour with no command: the robot waits until the Operator departs with `next`. */
  start: (id: string, body: { requestId: string; expectedRowVersion: string; confirmation?: StartConfirmation | null; holdAtStart?: boolean }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/start`, { method: 'POST', json: body }).then(() => id),
  /** From the start of an opened Tour this is the departure, which carries the on-site confirmations. */
  next: (id: string, body: { requestId: string; expectedRowVersion: string; confirmation?: StartConfirmation | null }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/next`, { method: 'POST', json: body }).then(() => id),
  pause: (id: string, body: { requestId: string; expectedRowVersion: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/pause`, { method: 'POST', json: body }).then(() => id),
  skip: (id: string, body: { requestId: string; expectedRowVersion: string; confirmation?: StartConfirmation | null }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/skip`, { method: 'POST', json: body }).then(() => id),
  setAutoAdvance: (id: string, enabled: boolean) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/auto-advance`, { method: 'PUT', json: { enabled } }).then(() => id),
  endEarly: (id: string, body: { requestId: string; expectedRowVersion: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/end-early`, { method: 'POST', json: body }).then(() => id),
  retryLeg: (id: string, body: { requestId: string; expectedRowVersion: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/retry-leg`, { method: 'POST', json: body }).then(() => id),
  /** No row version: it targets one command, which the server locks and checks is still UNKNOWN. */
  reconcile: (id: string, commandId: string, body: { requestId: string; reason: string }) =>
    apiClient<Mutation>(`/api/staff/manage/tours/${id}/commands/${commandId}/reconcile`, { method: 'POST', json: body }).then(() => id),
}
