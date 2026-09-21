import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { remotePreviewApi } from '../../mocks/remote-tour-mock'
import { useAuthStore } from '../../stores/auth-store'

export function useRemoteWorkspace() {
  const user = useAuthStore(s => s.user)
  return useQuery({ queryKey: ['remote', 'workspace', user?.userId, user?.role], queryFn: () => remotePreviewApi.workspace(), refetchInterval: 1500 })
}
export function useStudentSnapshot(tourId: string) {
  return useQuery({ queryKey: ['remote', 'student', tourId], queryFn: () => remotePreviewApi.student(tourId), enabled: Boolean(tourId), refetchInterval: 1500 })
}
export function useRemoteMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({ mutationFn, onSettled: async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['remote'] }),
      client.invalidateQueries({ queryKey: ['staff'] }),
      client.invalidateQueries({ queryKey: ['visitor', 'notifications'] }),
    ])
  } })
}
