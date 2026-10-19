import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { routesApi } from './api/routes'
import { poiQueryKeys } from '../pois/hooks'
import type { RouteInput, RouteListQuery } from './types'

// Deliberately separate from the Tour demo's ['admin', 'routes'] cache.
export const routeKeys = {
  all: ['admin', 'route-management'] as const,
  list: (query: RouteListQuery) => ['admin', 'route-management', 'list', query] as const,
  detail: (id: string) => ['admin', 'route-management', 'detail', id] as const,
}
export function useRoutes(query: RouteListQuery) {
  return useQuery({ queryKey: routeKeys.list(query), queryFn: () => routesApi.list(query) })
}
export function useRoute(id: string | undefined) {
  return useQuery({ queryKey: routeKeys.detail(id ?? ''), queryFn: () => routesApi.get(id!), enabled: Boolean(id), refetchOnWindowFocus: false })
}
function useInvalidateRoutes() {
  const client = useQueryClient()
  return () => Promise.all([client.invalidateQueries({ queryKey: routeKeys.all }), client.invalidateQueries({ queryKey: poiQueryKeys.all })])
}
export function useSaveRoute() {
  const onSuccess = useInvalidateRoutes()
  return useMutation({ mutationFn: ({ id, version, input }: { id?: string; version?: string; input: RouteInput }) =>
    id ? routesApi.update(id, version!, input).then(() => id) : routesApi.create(input).then(r => r.data!.id), onSuccess })
}
export function useRouteAction() {
  const onSuccess = useInvalidateRoutes()
  return useMutation({ mutationFn: ({ route, action }: { route: { id: string; version: string }; action: 'activate' | 'deactivate' | 'delete' }) =>
    action === 'delete' ? routesApi.delete(route.id, route.version) : routesApi.setActive(route.id, route.version, action === 'activate'), onSuccess })
}
