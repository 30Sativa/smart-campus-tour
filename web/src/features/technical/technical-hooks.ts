import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockTechnicalService as api } from '../../mocks/technical-mock'
import { notify, type ToastInput } from '../../components/ui/toast-store'
import type { CameraAngle, DeploymentInput, LocalizationInput, MapUploadInput, PoiCheckInput, RouteTestInput, RouteVersionConfirmation, TechnicalPoi } from './types'

/** Robots and operators to choose from; fixed lists until the technical API serves them. */
export { TECHNICAL_OPERATORS, TECHNICAL_ROBOTS } from '../../mocks/technical-mock'

/** Labelled sample data until `/api/technical/*` exists (proposal B7); swap the binding above. */
const keys = {
  all: ['technical'] as const,
  maps: ['technical', 'maps'] as const,
  pois: ['technical', 'pois'] as const,
  confirmations: ['technical', 'confirmations'] as const,
  activity: ['technical', 'activity'] as const,
}

export const useMapVersions = () => useQuery({ queryKey: keys.maps, queryFn: () => api.maps() })
export const useTechnicalPois = () => useQuery({ queryKey: keys.pois, queryFn: () => api.pois() })
export const useRouteConfirmations = () => useQuery({ queryKey: keys.confirmations, queryFn: () => api.confirmations() })
export const useTechnicalActivity = () => useQuery({ queryKey: keys.activity, queryFn: () => api.activity() })

/** Everything the overview and the route pages read together. */
export function useTechnicalData() {
  const maps = useMapVersions()
  const pois = useTechnicalPois()
  const routes = useRouteConfirmations()
  const pending = maps.isPending || pois.isPending || routes.isPending
  return { pending, maps: maps.data ?? [], pois: pois.data ?? [], routes: routes.data ?? [] }
}

type Lookup = { poi: (id: string) => TechnicalPoi | undefined; route: (id: string) => RouteVersionConfirmation | undefined }

/**
 * Every technical record ends with a notification saying what was written and
 * what it unlocks; the page keeps showing any refusal inline.
 */
function useTechnicalMutation<T>(run: (input: T) => Promise<unknown>, done: (input: T, find: Lookup) => ToastInput) {
  const client = useQueryClient()
  const find: Lookup = {
    poi: (id) => client.getQueryData<TechnicalPoi[]>(keys.pois)?.find((poi) => poi.id === id),
    route: (id) => client.getQueryData<RouteVersionConfirmation[]>(keys.confirmations)?.find((route) => route.id === id),
  }
  return useMutation({
    mutationFn: async (input: T) => run(input),
    onSuccess: (_data, input) => {
      notify(done(input, find))
      return client.invalidateQueries({ queryKey: keys.all })
    },
  })
}

const ANGLE: Record<CameraAngle, string> = { LEFT: 'Trái', FRONT: 'Trước', RIGHT: 'Phải' }
const routeName = (route: RouteVersionConfirmation | undefined) => (route ? `${route.routeName} ${route.routeVersion}` : 'tuyến')

export const useUploadMapVersion = () => useTechnicalMutation((input: MapUploadInput) => api.uploadMap(input), (input) => ({
  title: `Đã lưu ${input.mapKey}`,
  detail: 'Chưa deploy lên robot. Ghi deploy khi robot đã nạp đúng file.',
}))
export const useRecordDeployment = () => useTechnicalMutation((input: DeploymentInput) => api.recordDeployment(input), (input) => ({
  title: `Đã ghi deploy ${input.mapKey} lên ${input.robot}`,
  detail: 'Bước tiếp theo: kiểm tra localization tại các điểm mốc.',
}))
export const useRecordLocalization = () => useTechnicalMutation((input: LocalizationInput) => api.recordLocalization(input), (input) => input.passed
  ? { title: `Localization ${input.mapKey} đạt`, detail: `Sai lệch ${input.errorCm.toLocaleString('vi-VN')} cm. Có thể xác minh POI trên map này.`, action: { label: 'Xác minh POI', to: '/technical/pois' } }
  : { tone: 'info', title: `Đã ghi localization ${input.mapKey} không đạt`, detail: 'POI trên map này chưa xác minh được cho tới khi đo lại đạt.' })
export const useReopenLocalization = () => useTechnicalMutation((mapKey: string) => api.reopenLocalization(mapKey), (mapKey) => ({
  tone: 'info',
  title: `Đã mở lại kiểm tra localization ${mapKey}`,
  detail: 'Ghi kết quả đo mới để tiếp tục.',
}))
export const useVerifyPoi = () => useTechnicalMutation((input: PoiCheckInput) => api.verifyPoi(input), (input, find) => {
  const name = find.poi(input.id)?.name ?? 'POI'
  return input.passed
    ? { title: `Đã xác minh ${name}`, detail: [input.cameraAngle && `Góc camera ${ANGLE[input.cameraAngle]}`, input.errorCm != null && `lệch ${input.errorCm.toLocaleString('vi-VN')} cm`].filter(Boolean).join(', ') || undefined }
    : { tone: 'info', title: `Đã ghi ${name} không đạt`, detail: 'Staff cần chỉnh lại POI trước khi xác minh lại.' }
})
export const useConfirmRoute = () => useTechnicalMutation(({ id, note, operator }: RouteTestInput) => api.confirm(id, note, operator), (input, find) => ({
  title: `Đã xác nhận ${routeName(find.route(input.id))}`,
  detail: `Test cùng ${input.operator}. Staff có thể tạo Tour trên version này.`,
}))
export const useRecordFailedTest = () => useTechnicalMutation((input: RouteTestInput) => api.recordFailedTest(input), (input, find) => ({
  tone: 'info',
  title: `Đã ghi test ${routeName(find.route(input.id))} không đạt`,
  detail: 'Version vẫn chưa được xác nhận. Ghi chú đã vào lịch sử tuyến.',
}))
export const useRevokeConfirmation = () => useTechnicalMutation(({ id, reason }: { id: string; reason: string }) => api.revoke(id, reason), (input, find) => ({
  tone: 'info',
  title: `Đã thu hồi xác nhận ${routeName(find.route(input.id))}`,
  detail: 'Tour mới không dùng được version này cho tới khi xác nhận lại.',
}))
