import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { poisApi } from './api/pois'
import type { CreatePoiInput, PoiListQuery, UpdatePoiInput } from './types'

export const poiQueryKeys = {
  all: ['admin', 'pois'] as const,
  list: (query: PoiListQuery) => ['admin', 'pois', 'list', query.search ?? '', query.sort ?? '', query.page, query.size, query.isActive ?? 'all'] as const,
  detail: (id: string) => ['admin', 'pois', 'detail', id] as const,
}

export function usePois(query: PoiListQuery) {
  return useQuery({ queryKey: poiQueryKeys.list(query), queryFn: () => poisApi.list(query) })
}

export function usePoi(id: string | undefined) {
  return useQuery({
    queryKey: poiQueryKeys.detail(id ?? 'new'),
    queryFn: () => poisApi.get(id!).then((response) => response.data!),
    enabled: Boolean(id),
  })
}

function useInvalidatePois() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: poiQueryKeys.all })
}

export function useCreatePoi() {
  const invalidate = useInvalidatePois()
  return useMutation({ mutationFn: (input: CreatePoiInput) => poisApi.create(input), onSuccess: invalidate })
}

export function useUpdatePoi() {
  const invalidate = useInvalidatePois()
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdatePoiInput }) => poisApi.update(id, input), onSuccess: invalidate })
}

export function useSetPoiActive() {
  const invalidate = useInvalidatePois()
  return useMutation({
    mutationFn: ({ id, version, isActive }: { id: string; version: string; isActive: boolean }) => poisApi.setActive(id, version, isActive),
    onSuccess: invalidate,
  })
}
