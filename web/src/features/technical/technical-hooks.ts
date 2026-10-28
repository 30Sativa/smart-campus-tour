import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notify, type ToastInput } from '../../components/ui/toast-store'
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

/** Every technical record ends with a notification saying what was written; refusals stay on the form. */
function useTechnicalMutation<T, R>(run: (input: T) => Promise<R>, invalidate: readonly unknown[], done: (input: T, result: R) => ToastInput) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: (result, input) => {
      notify(done(input, result))
      return client.invalidateQueries({ queryKey: invalidate })
    },
  })
}

export const useUploadMap = () => useTechnicalMutation(technicalApi.uploadMap, keys.maps, (input, map) => ({
  title: `Đã lưu ${map?.mapKey ?? input.package.name}`,
  detail: 'Upload chưa triển khai map lên robot. Ghi kiểm tra sau khi robot đã nạp đúng package.',
}))

export const useRecordDeployment = () => useTechnicalMutation(technicalApi.recordDeployment, keys.maps, (input, check) => check?.passed
  ? { title: `Đã ghi kiểm tra trên ${input.robotCode}: đạt`, detail: 'Localization và hiển thị map đều đạt.' }
  : { tone: 'info', title: `Đã ghi kiểm tra trên ${input.robotCode}: chưa đạt`, detail: 'Version này chưa dùng được cho tới khi kiểm tra lại đạt.' })

export const useVerifyPoi = () => useTechnicalMutation(technicalApi.verifyPoi, keys.poiProposals, (input) => input.resultCode === 'PASS'
  ? { title: 'Đã ghi POI đạt', detail: `Kiểm tra cùng robot ${input.robotCode}, gắn với revision ${input.revisionNumber}.` }
  : { tone: 'info', title: 'Đã ghi POI không đạt', detail: 'Staff cần chỉnh POI rồi gửi lại để kiểm chứng.' })
