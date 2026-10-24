import { apiClient } from '../../../../api/client'
import type { ApiResponse, PagedApiResponse } from '../../../../api/contracts/shared'
import type { RouteDetails, RouteInput, RouteListItem, RouteListQuery } from '../types'

export const routesApi = {
  list: (query: RouteListQuery) => {
    const params = new URLSearchParams({ page: String(query.page), size: String(query.size) })
    if (query.search?.trim()) params.set('search', query.search.trim())
    if (query.isActive != null) params.set('isActive', String(query.isActive))
    return apiClient<PagedApiResponse<RouteListItem>>(`/api/admin/routes?${params}`)
  },
  get: (id: string) => apiClient<ApiResponse<RouteDetails>>(`/api/admin/routes/${id}`).then(r => r.data!),
  create: (input: RouteInput) => apiClient<ApiResponse<{ id: string }>>('/api/admin/routes', { method: 'POST', json: input }),
  update: (id: string, expectedVersion: string, configuration: RouteInput) => apiClient<ApiResponse<null>>(`/api/admin/routes/${id}`, { method: 'PUT', json: { expectedVersion, configuration } }),
  setActive: (id: string, expectedVersion: string, active: boolean) => apiClient<ApiResponse<null>>(`/api/admin/routes/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST', json: { expectedVersion } }),
  delete: (id: string, expectedVersion: string) => apiClient<ApiResponse<null>>(`/api/admin/routes/${id}`, { method: 'DELETE', json: { expectedVersion } }),
}
