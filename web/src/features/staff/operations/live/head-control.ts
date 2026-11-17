import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiClient } from '../../../../api/client'
import type { ApiResponse } from '../../../../api/contracts/shared'

/**
 * Operator head control of a RUNNING Tour (ADR-0045, `docs/contracts/fleet-head/v1/`).
 * A head command only turns the camera head and never moves the robot, so no
 * press asks for confirmation. Queued is not executed: the robot's own report in
 * `GET .../head` says where the head is.
 */
export type HeadMode = 'AUTO' | 'MANUAL'
export type HeadCommand =
  | { kind: 'STEP'; panSteps: number; tiltSteps: number }
  | { kind: 'JOG'; panDir: -1 | 0 | 1; tiltDir: -1 | 0 | 1 }
  | { kind: 'STOP' }
  | { kind: 'ANGLE'; panDeg: number; tiltDeg: number }
  | { kind: 'SWEEP' }
  | { kind: 'HOME' }
export type HeadReport = { state: string; referenced: boolean; panDeg: number | null; tiltDeg: number | null; observedAt: string | null }
/** `GET /api/staff/manage/tours/{id}/head`, any Staff. `robotCode`: the assigned robot, or the one a READY Tour holds. */
export type TourHeadStatus = {
  enabled: boolean; mode: HeadMode | string; robotCode: string | null; connected: boolean
  lastPollAt: string | null; head: HeadReport | null; headReceivedAt?: string | null
}

const path = (tourId: string) => `/api/staff/manage/tours/${encodeURIComponent(tourId)}`
const STATUS_MS = 2_000

export const headKeys = { status: (tourId: string) => ['staff', 'tour-head', tourId] as const }

/** Only a well-formed answer counts; anything else reads as "no status yet". */
function isStatus(value: unknown): value is TourHeadStatus {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && typeof (value as TourHeadStatus).enabled === 'boolean' && typeof (value as TourHeadStatus).connected === 'boolean'
}

export function useTourHeadStatus(tourId: string, enabled: boolean) {
  return useQuery({
    queryKey: headKeys.status(tourId),
    queryFn: () => apiClient<ApiResponse<unknown>>(`${path(tourId)}/head`).then(response => (isStatus(response.data) ? response.data : null)),
    enabled: Boolean(tourId) && enabled,
    refetchInterval: STATUS_MS,
    retry: false,
  })
}

export function useHeadCommand(tourId: string) {
  return useMutation({
    mutationFn: (command: HeadCommand) =>
      apiClient<ApiResponse<{ seq: number; robotCode: string; issuedAt: string }>>(`${path(tourId)}/head-commands`, { method: 'POST', json: command }),
  })
}

export function useHeadMode(tourId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (mode: HeadMode) => apiClient<ApiResponse<{ tourId: string; mode: HeadMode }>>(`${path(tourId)}/head-mode`, { method: 'PUT', json: { mode } }),
    onSettled: () => client.invalidateQueries({ queryKey: headKeys.status(tourId) }),
  })
}

/** Why the buttons are locked, from the status or from the last refusal; the server's two lock codes first. */
export type HeadLock = 'disabled' | 'notConnected' | 'notOperator' | 'notRunning'

export const HEAD_LOCK_TEXT: Record<Exclude<HeadLock, 'notOperator'>, string> = {
  disabled: 'Máy chủ đang tắt chức năng xoay đầu camera. Báo Kỹ thuật nếu cần dùng.',
  notConnected: 'Robot chưa kết nối kênh đầu camera, nên nút tạm khóa. Kiểm tra robot đang bật và có mạng.',
  notRunning: 'Chỉ xoay được đầu camera khi Tour đang chạy.',
}

function errorCode(error: ApiError): string | null {
  try {
    const body: unknown = JSON.parse(error.body)
    const code = body && typeof body === 'object' ? (body as { errors?: { code?: unknown } }).errors?.code : null
    return typeof code === 'string' ? code : null
  } catch { return null }
}

/** A refused head command in words, and the lock it implies, if any. */
export function headRefusal(error: unknown): { lock: HeadLock | null; message: string } {
  if (error instanceof ApiError) {
    const code = errorCode(error)
    if (error.status === 409 && code === 'HEAD_CONTROL_DISABLED') return { lock: 'disabled', message: HEAD_LOCK_TEXT.disabled }
    if (error.status === 409 && code === 'HEAD_ROBOT_NOT_CONNECTED') return { lock: 'notConnected', message: HEAD_LOCK_TEXT.notConnected }
    if (error.status === 409 && code === 'TOUR_STATE_INVALID') return { lock: 'notRunning', message: HEAD_LOCK_TEXT.notRunning }
    if (error.status === 403) return { lock: 'notOperator', message: 'Chỉ người vận hành được giao cho Tour mới xoay được đầu camera.' }
    if (error.status === 429) return { lock: null, message: 'Bấm quá nhanh, máy chủ tạm từ chối. Chờ một chút rồi bấm lại.' }
    if (error.status === 404) return { lock: null, message: 'Máy chủ không còn thấy Tour này. Tải lại trang.' }
  }
  return { lock: null, message: 'Không gửi được lệnh tới máy chủ. Bấm lại.' }
}
