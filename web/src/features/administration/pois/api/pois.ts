import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { CreatePoiInput, PoiDetails, PoiListItem, PoiListQuery, UpdatePoiInput } from '../types'

function listPath(query: PoiListQuery): string {
  const params = new URLSearchParams()
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.sort) params.set('sort', query.sort)
  if (query.isActive != null) params.set('isActive', String(query.isActive))
  params.set('page', String(query.page))
  params.set('size', String(query.size))
  return `/api/admin/pois?${params.toString()}`
}

export const poisApi = {
  list: (query: PoiListQuery) => apiClient<PagedApiResponse<PoiListItem>>(listPath(query)),
  get: (id: string) => apiClient<ApiResponse<PoiDetails>>(`/api/admin/pois/${id}`),
  create: (input: CreatePoiInput) => apiClient<ApiResponse<{ id: string }>>('/api/admin/pois', { method: 'POST', json: input }),
  update: (id: string, input: UpdatePoiInput) => apiClient<ApiResponse<null>>(`/api/admin/pois/${id}`, { method: 'PUT', json: input }),
  setActive: (id: string, expectedRowVersion: string, isActive: boolean) => apiClient<ApiResponse<null>>(
    `/api/admin/pois/${id}/${isActive ? 'activate' : 'deactivate'}`,
    { method: 'POST', json: { expectedRowVersion } },
  ),
}
