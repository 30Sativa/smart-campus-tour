import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { technicalApi } from './api/technical'

const keys = {
  maps: ['technical', 'maps'] as const,
  poiProposals: ['technical', 'poi-proposals'] as const,
}

export function useMapVersions() {
  return useQuery({ queryKey: keys.maps, queryFn: technicalApi.listMaps })
}

export function usePoiProposals() {
  return useQuery({ queryKey: keys.poiProposals, queryFn: technicalApi.listPoiProposals })
}

function useTechnicalMutation<T>(run: (input: T) => Promise<unknown>, invalidate: readonly unknown[]) {
  const client = useQueryClient()
  return useMutation({ mutationFn: run, onSuccess: () => client.invalidateQueries({ queryKey: invalidate }) })
}

export const useUploadMap = () => useTechnicalMutation(technicalApi.uploadMap, keys.maps)
export const useRecordDeployment = () => useTechnicalMutation(technicalApi.recordDeployment, keys.maps)
export const useVerifyPoi = () => useTechnicalMutation(technicalApi.verifyPoi, keys.poiProposals)
