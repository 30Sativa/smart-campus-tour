import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notify, type ToastInput } from '../../components/ui/toast-store'
import { versionedRoutesApi } from '../administration/routes/versioned-api'
import { technicalApi, type RouteTestRunInput } from './api/technical'

const keys = {
  maps: ['technical', 'maps'] as const,
  physicalRobots: ['technical', 'physical-robots'] as const,
  poiProposals: ['technical', 'poi-proposals'] as const,
  routeTests: ['technical', 'route-tests'] as const,
}

export function useMapVersions() {
  return useQuery({ queryKey: keys.maps, queryFn: technicalApi.listMaps })
}

export function useMapAreas(enabled = true) {
  return useQuery({ queryKey: ['technical', 'map-areas'], queryFn: technicalApi.listMapAreas, enabled })
}

export function usePhysicalRobots(enabled = true) {
  return useQuery({ queryKey: keys.physicalRobots, queryFn: technicalApi.listPhysicalRobots, enabled })
}

/** The robot page only; every picker uses usePhysicalRobots, which leaves deactivated robots out. */
export function useAllPhysicalRobots() {
  return useQuery({ queryKey: [...keys.physicalRobots, 'all'], queryFn: technicalApi.listAllPhysicalRobots })
}

/** The robot's MiniPC key status; the key panel invalidates this same key after issue, rotate or revoke. */
export function useRobotCredential(robotCode: string, enabled = true) {
  return useQuery({ queryKey: ['technical', 'robot-credential', robotCode], queryFn: () => technicalApi.getRobotCredential(robotCode), enabled })
}

export function useRobotAffectedTours(robotId: string, mapVersionId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...keys.physicalRobots, 'affected-tours', robotId, mapVersionId ?? ''], queryFn: () => technicalApi.listRobotAffectedTours(robotId, mapVersionId), enabled })
}

export function usePoiProposals() {
  return useQuery({ queryKey: keys.poiProposals, queryFn: () => technicalApi.listPoiProposals() })
}

export function usePoiVerificationQueue() {
  return useQuery({ queryKey: [...keys.poiProposals, 'verification-queue'], queryFn: () => technicalApi.listPoiVerificationQueue() })
}

export function usePoiHistory(proposalId: string) {
  return useQuery({ queryKey: [...keys.poiProposals, 'history', proposalId], queryFn: () => technicalApi.getPoiHistory(proposalId) })
}

export function useRouteTestQueue() {
  return useQuery({ queryKey: [...keys.routeTests, 'queue'], queryFn: technicalApi.listRouteTestQueue })
}

/** Current revisions, the only place recorded route results can be listed from. */
export function useSubmittedRoutes() {
  return useQuery({ queryKey: [...keys.routeTests, 'routes'], queryFn: () => versionedRoutesApi.list() })
}

export function useRouteRevision(routeId: string, revisionId: string) {
  return useQuery({ queryKey: [...keys.routeTests, 'detail', revisionId], queryFn: () => versionedRoutesApi.get(routeId, revisionId) })
}

export function useRouteTestParticipants() {
  return useQuery({ queryKey: [...keys.routeTests, 'participants'], queryFn: technicalApi.listRouteTestParticipants })
}

export const useRecordRouteTest = () => useTechnicalMutation(
  ({ run }: { routeName: string; run: RouteTestRunInput }) => technicalApi.recordRouteTest(run),
  keys.routeTests,
  ({ routeName, run }) => run.resultCode === 'PASS'
    ? { title: `Đã ghi chạy thử đạt: ${routeName}`, detail: 'Đây là bằng chứng thủ công, chưa làm tuyến READY.' }
    : { tone: 'info', title: `Đã ghi chạy thử không đạt: ${routeName}`, detail: 'Staff cần tạo phiên bản mới nếu phải đổi tuyến.' })

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
  title: `Đã lưu ${map?.mapKey ?? input.package.name} · v${map?.versionNumber ?? ''}`,
  detail: 'Upload chỉ lưu phiên bản trên hệ thống; chưa nạp map lên robot.',
}))

/** Preview changes nothing on the server, so it neither invalidates data nor notifies. */
export function usePreviewPoiImport() {
  return useMutation({ mutationFn: technicalApi.previewPoiImport })
}

export const useImportPoiFiles = () => useTechnicalMutation(technicalApi.importPoiFiles, keys.poiProposals, (_input, result) => ({
  title: `Đã nhập ${result.files.length} tệp POI`,
  detail: 'Staff cần bổ sung tên và thuyết minh cho POI mới.',
}))

export const useRecordDeployment = () => useTechnicalMutation(technicalApi.recordDeployment, keys.maps, (input, check) => check?.passed
  ? { title: `Đã ghi kiểm tra trên ${input.robotCode}: đạt`, detail: 'Localization và hiển thị map đều đạt.' }
  : { tone: 'info', title: `Đã ghi kiểm tra trên ${input.robotCode}: chưa đạt`, detail: 'Version này chưa dùng được cho tới khi kiểm tra lại đạt.' })

export const useRegisterPhysicalRobot = () => useTechnicalMutation(technicalApi.registerPhysicalRobot, keys.physicalRobots, (_input, robot) => ({
  title: `Đã đăng ký ${robot.robotCode}`,
  detail: 'Đăng ký tạo danh tính robot trong hệ thống. Thiết lập kết nối ROS2 được thực hiện riêng.',
}))

export const useDeactivateRobot = () => useTechnicalMutation(technicalApi.deactivateRobot, keys.physicalRobots, (_input, result) => ({
  title: `Đã ngừng sử dụng ${result.robotCode}`,
  detail: 'Khóa kết nối đã bị thu hồi và bản đồ đã được gỡ gán.',
}))

export const useActivateRobot = () => useTechnicalMutation(technicalApi.activateRobot, keys.physicalRobots, (_input, result) => ({
  title: `Đã kích hoạt lại ${result.robotCode}`,
  detail: 'Cần cấp khóa mới và gán lại bản đồ trước khi dùng robot.',
}))

export function useAssignRobotMap() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; requestId: string; expectedRowVersion: string; mapVersionId: string }) => technicalApi.assignRobotMap(id, input),
    onSuccess: async result => {
      notify({ title: `Đã gán ${result.assignedMapKey} cho ${result.robotCode}`, detail: 'Cập nhật MapKey/FrameId trên MiniPC trước khi gửi Fleet Sync.' })
      await Promise.all([client.invalidateQueries({ queryKey: keys.physicalRobots }), client.invalidateQueries({ queryKey: keys.maps })])
    },
  })
}

export function useClearRobotMap() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; requestId: string; expectedRowVersion: string }) => technicalApi.clearRobotMap(id, input),
    onSuccess: async result => {
      notify({ title: `Đã gỡ gán bản đồ khỏi ${result.robotCode}` })
      await Promise.all([client.invalidateQueries({ queryKey: keys.physicalRobots }), client.invalidateQueries({ queryKey: keys.maps })])
    },
  })
}

export const useVerifyPoi = () => useTechnicalMutation(technicalApi.verifyPoi, keys.poiProposals, (input) => input.resultCode === 'PASS'
  ? { title: 'Đã ghi POI đạt', detail: `Kiểm tra cùng robot ${input.robotCode}, gắn với revision ${input.revisionNumber}.` }
  : { tone: 'info', title: 'Đã ghi POI không đạt', detail: 'Staff cần chỉnh POI rồi gửi lại để kiểm chứng.' })
