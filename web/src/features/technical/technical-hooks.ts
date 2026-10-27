import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockTechnicalService as api } from '../../mocks/technical-mock'

/** Labelled sample data until `/api/technical/*` exists (proposal B7); swap the binding above. */
const keys = { all: ['technical'] as const, maps: ['technical', 'maps'] as const, confirmations: ['technical', 'confirmations'] as const }

export function useMapVersions() {
  return useQuery({ queryKey: keys.maps, queryFn: () => api.maps() })
}

export function useRouteConfirmations() {
  return useQuery({ queryKey: keys.confirmations, queryFn: () => api.confirmations() })
}

function useTechnicalMutation<T>(run: (input: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({ mutationFn: async (input: T) => run(input), onSuccess: () => client.invalidateQueries({ queryKey: keys.all }) })
}

export const useRecordDeployment = () => useTechnicalMutation((mapKey: string) => api.recordDeployment(mapKey))
export const useRecordLocalization = () =>
  useTechnicalMutation(({ mapKey, passed, note }: { mapKey: string; passed: boolean; note: string }) => api.recordLocalization(mapKey, passed, note))
export const useConfirmRoute = () => useTechnicalMutation(({ id, note }: { id: string; note: string }) => api.confirm(id, note))
export const useRevokeConfirmation = () => useTechnicalMutation(({ id, reason }: { id: string; reason: string }) => api.revoke(id, reason))
