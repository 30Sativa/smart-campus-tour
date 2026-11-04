import { ApiError } from '../../../api/client'
import type { TourBlocker, TourStartCheck } from '../../administration/tours/types'
import { tourError } from '../../administration/tours/tour-messages'

/** A refused READY/Reopen/Start/Next, with whatever structured reason the server sent. */
export type OperationRefusal = {
  message: string
  code: string | null
  /** START_/MOVE_PRECONDITION_FAILED and COMMAND_TRANSPORT_DISABLED carry the checks they evaluated. */
  checks: TourStartCheck[] | null
  blockedBy: string[]
  /** READY_PRECONDITION_FAILED lists every failing READY condition. */
  blockers: TourBlocker[]
}

const MESSAGES: Record<string, string> = {
  STALE_VERSION: 'Tour vừa thay đổi trên máy chủ. Trạng thái mới đã được tải lại, hãy kiểm tra rồi thử lại.',
  READY_PRECONDITION_FAILED: 'Tour chưa đủ điều kiện chốt. Xử lý các mục dưới đây rồi thử lại.',
  START_PRECONDITION_FAILED: 'Máy chủ từ chối bắt đầu vì còn điều kiện chưa đạt. Danh sách điều kiện đã cập nhật.',
  COMMAND_TRANSPORT_DISABLED: 'Máy chủ đang tắt kênh lệnh robot, nên không bắt đầu được. Tour vẫn ở trạng thái đã chốt và không có lệnh nào được tạo.',
  MOVE_PRECONDITION_FAILED: 'Chưa đủ điều kiện để robot di chuyển tiếp. Không có lệnh nào được tạo.',
  TOUR_COMMAND_OPEN: 'Robot còn lệnh đang mở. Chờ lệnh hiện tại kết thúc rồi thử lại.',
  ROBOT_CLAIM_FAILED: 'Robot vừa thay đổi đúng lúc bắt đầu nên máy chủ không nhận robot. Tải lại rồi kiểm tra điều kiện.',
  TOUR_STATE_INVALID: 'Tour không còn ở trạng thái cho phép thao tác này. Trạng thái mới đã được tải lại.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu trùng mã với một thao tác khác. Tải lại trang rồi thử lại.',
}

type Body = { errors?: { code?: unknown; checks?: unknown; blockedBy?: unknown; blockers?: unknown } }

function parse(error: ApiError): Body {
  try {
    const decoded: unknown = JSON.parse(error.body)
    return decoded && typeof decoded === 'object' ? decoded as Body : {}
  } catch { return {} }
}

const isCheck = (value: unknown): value is TourStartCheck =>
  Boolean(value) && typeof value === 'object' && typeof (value as TourStartCheck).id === 'string' && typeof (value as TourStartCheck).passed === 'boolean'
const isBlocker = (value: unknown): value is TourBlocker =>
  Boolean(value) && typeof value === 'object' && typeof (value as TourBlocker).message === 'string'

/**
 * `operator` words a 403 for the Operator-only actions (Start, Next); READY and
 * Reopen are any Staff's, so their 403 means the role.
 */
export function operationRefusal(error: unknown, { operator = false }: { operator?: boolean } = {}): OperationRefusal {
  const empty = { code: null, checks: null, blockedBy: [], blockers: [] }
  if (!(error instanceof ApiError)) return { ...empty, message: tourError(error) }
  if (error.status === 403) return { ...empty, message: operator ? 'Chỉ người vận hành được giao cho Tour mới thao tác được.' : 'Tài khoản không có quyền thao tác Tour này.' }
  const errors = parse(error).errors
  const code = typeof errors?.code === 'string' ? errors.code : null
  const checks = Array.isArray(errors?.checks) ? errors.checks.filter(isCheck) : null
  const blockedBy = Array.isArray(errors?.blockedBy) ? errors.blockedBy.filter((id): id is string => typeof id === 'string') : []
  const blockers = Array.isArray(errors?.blockers) ? errors.blockers.filter(isBlocker) : []
  const message = error.status === 409 && code && MESSAGES[code] ? MESSAGES[code] : tourError(error)
  return { message, code, checks, blockedBy, blockers }
}
