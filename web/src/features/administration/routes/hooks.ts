import { useQuery } from '@tanstack/react-query'
import { legacyRouteReadApi } from './legacy-read-api'
import type { RouteListQuery } from './types'

// These keys also let the retained legacy Tour views refresh their Route reads.
export const routeKeys = {
  all: ['admin', 'route-management'] as const,
  list: (query: RouteListQuery) => ['admin', 'route-management', 'list', query] as const,
  detail: (id: string) => ['admin', 'route-management', 'detail', id] as const,
}

export function useRoutes(query: RouteListQuery) {
  return useQuery({ queryKey: routeKeys.list(query), queryFn: () => legacyRouteReadApi.list(query) })
}

export function useRoute(id: string | undefined) {
  return useQuery({ queryKey: routeKeys.detail(id ?? ''), queryFn: () => legacyRouteReadApi.get(id!), enabled: Boolean(id), refetchOnWindowFocus: false })
}
