import { ApiError } from '../../api/client'
import type { StatusTone } from '../../components/ui/status-tone'
import type {
  CameraAngle, ConfirmationState, MapVersionStatus, PoiCheckState, PoiSource, RouteVersionConfirmation, TechnicalPoi,
} from './types'

export const CONFIRMATION_STATE: Record<ConfirmationState, { label: string; tone: StatusTone }> = {
  CONFIRMED: { label: 'Đã xác nhận', tone: 'ok' },
  UNCONFIRMED: { label: 'Chưa xác nhận', tone: 'warn' },
  NEEDS_RECONFIRM: { label: 'Cần xác nhận lại', tone: 'danger' },
}

export const POI_STATE: Record<PoiCheckState, { label: string; tone: StatusTone }> = {
  VERIFIED: { label: 'Đã xác minh', tone: 'ok' },
  PENDING: { label: 'Chờ xác minh', tone: 'warn' },
  FAILED: { label: 'Không đạt', tone: 'danger' },
}

export const POI_SOURCE: Record<PoiSource, string> = { STAFF_PROPOSAL: 'Staff đề xuất', YAML_IMPORT: 'Import YAML' }

export const CAMERA_ANGLES: CameraAngle[] = ['LEFT', 'FRONT', 'RIGHT']

/** One status word for a map version, in the order the work happens. */
export function mapState(map: MapVersionStatus): { label: string; tone: StatusTone } {
  if (!map.deployedAt) return { label: 'Chờ deploy', tone: 'warn' }
  if (!map.localization) return { label: 'Chờ localization', tone: 'warn' }
  if (!map.localization.passed) return { label: 'Localization lỗi', tone: 'danger' }
  return map.onRobot ? { label: 'Trên robot', tone: 'ok' } : { label: 'Đã kiểm tra', tone: 'muted' }
}

export type StepState = 'done' | 'doing' | 'todo' | 'fail'
export type PipelineStep = { key: 'upload' | 'deploy' | 'localization' | 'poi' | 'route'; label: string; state: StepState; done: number; total: number }

/** The five steps a map version goes through before a tour can use it. */
export function mapPipeline(map: MapVersionStatus, pois: TechnicalPoi[], routes: RouteVersionConfirmation[]): PipelineStep[] {
  const own = pois.filter((p) => p.mapKey === map.mapKey)
  const checked = own.filter((p) => p.state === 'VERIFIED').length
  const used = routes.filter((r) => r.mapKey === map.mapKey)
  const confirmed = used.filter((r) => r.state === 'CONFIRMED').length
  const share = (done: number, total: number): StepState => total === 0 ? 'todo' : done === total ? 'done' : 'doing'
  return [
    { key: 'upload', label: 'Upload', state: 'done', done: 1, total: 1 },
    { key: 'deploy', label: 'Deploy', state: map.deployedAt ? 'done' : 'doing', done: map.deployedAt ? 1 : 0, total: 1 },
    { key: 'localization', label: 'Localization', state: !map.deployedAt ? 'todo' : !map.localization ? 'doing' : map.localization.passed ? 'done' : 'fail', done: map.localization?.passed ? 1 : 0, total: 1 },
    { key: 'poi', label: `POI ${checked}/${own.length}`, state: share(checked, own.length), done: checked, total: own.length },
    { key: 'route', label: `Tuyến ${confirmed}/${used.length}`, state: share(confirmed, used.length), done: confirmed, total: used.length },
  ]
}

export const STEP_CLASS: Record<StepState, string> = {
  done: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]',
  doing: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]',
  fail: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]',
  todo: 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]',
}

/** What still stands between a route version and its confirmation, in words. */
export function confirmationGaps(route: RouteVersionConfirmation, maps: MapVersionStatus[], pois: TechnicalPoi[]): string[] {
  const gaps: string[] = []
  const map = maps.find((m) => m.mapKey === route.mapKey)
  if (!map?.localization?.passed) gaps.push(`Map ${route.mapKey} chưa đạt localization`)
  const open = route.stopIds.map((id) => pois.find((p) => p.id === id)).filter((p) => p?.state !== 'VERIFIED')
  if (open.length) gaps.push(`POI chưa xác minh: ${open.map((p) => p?.name ?? '?').join(', ')}`)
  return gaps
}

export const routeLabel = (route: RouteVersionConfirmation) => `${route.routeName} · v${route.routeVersion}`

export function errorText(error: unknown) {
  if (error instanceof ApiError && error.body) return error.body
  return error instanceof Error ? error.message : 'Không lưu được. Thử lại.'
}

export const stamp = (iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-'
