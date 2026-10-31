import { apiClient } from '../../../api/client'
import type { PagedApiResponse, ApiResponse } from '../../../api/contracts/shared'
import type { RouteDetails, RouteListItem, RouteListQuery } from './types'

// This read-only projection is retained for the legacy Tour form. Versioned
// Route authoring uses versioned-api.ts; no mutable Route operation belongs here.
export const legacyRouteReadApi = {
  list: (query: RouteListQuery) => {
    const params = new URLSearchParams({ page: String(query.page), size: String(query.size) })
    if (query.search?.trim()) params.set('search', query.search.trim())
    if (query.isActive != null) params.set('isActive', String(query.isActive))
    return apiClient<PagedApiResponse<RouteListItem>>(`/api/staff/manage/routes?${params}`)
  },
  get: (id: string) => apiClient<ApiResponse<RouteDetails>>(`/api/staff/manage/routes/${id}`).then(response => response.data!),
}
