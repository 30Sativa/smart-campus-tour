import { ApiError } from '../../api/client'
import type { PhysicalRobotConnectionStatus } from './api/technical'

export const connectionStatusLabel = (status: PhysicalRobotConnectionStatus) => ({
  UNCONFIRMED: 'Chưa xác nhận kết nối',
  CONNECTED: 'Đã xác nhận · Đang kết nối',
  DISCONNECTED: 'Đã xác nhận · Mất kết nối',
  AWAITING_DATA: 'Đã xác nhận · Chưa nhận dữ liệu',
})[status]

export function errorText(error: unknown) {
  if (error instanceof ApiError && error.body) {
    try {
      const payload = JSON.parse(error.body) as { message?: unknown }
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
    } catch { /* Non-JSON responses use the transport error below. */ }
  }
  return error instanceof Error ? error.message : 'Không lưu được. Thử lại.'
}

export function mapUploadFieldErrors(error: unknown): { areaKey?: string; areaName?: string; package?: string; form?: string } {
  if (!(error instanceof ApiError) || !error.body) return { form: errorText(error) }
  try {
    const payload = JSON.parse(error.body) as { errors?: Record<string, unknown>; message?: unknown }
    const errors = payload.errors
    if (typeof errors === 'object' && errors !== null && 'code' in errors && errors.code === 'MAP_AREA_NAME_CONFLICT')
      return { areaKey: 'Mã khu vực này đã tồn tại. Hãy chuyển sang “Khu vực đã có” để giữ nguyên tên đã lưu.' }
    if (typeof errors === 'object' && errors !== null && 'code' in errors && errors.code === 'MAP_PACKAGE_DUPLICATE')
      return { package: typeof payload.message === 'string' ? payload.message : 'Gói này đã được tải lên ở khu vực này.' }
    if (!errors || typeof errors !== 'object') return { form: typeof payload.message === 'string' ? payload.message : 'Không upload được package map.' }
    const mapped: { areaKey?: string; areaName?: string; package?: string; form?: string } = {}
    for (const [field, raw] of Object.entries(errors)) {
      const messages = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : typeof raw === 'string' ? [raw] : []
      const message = messages[0]
      if (!message) continue
      const normalized = field.toLowerCase()
      if (normalized.includes('areakey')) mapped.areaKey = 'Mã khu vực chỉ gồm chữ thường không dấu, số và dấu gạch nối; ký tự đầu/cuối phải là chữ hoặc số.'
      else if (normalized.includes('areaname')) mapped.areaName = 'Tên khu vực không được để trống và tối đa 150 ký tự.'
      else if (normalized.includes('package') || normalized.includes('image') || normalized.includes('yaml')) mapped.package = message
      else mapped.form = message
    }
    return Object.keys(mapped).length ? mapped : { form: typeof payload.message === 'string' ? payload.message : 'Dữ liệu upload chưa hợp lệ.' }
  } catch {
    return { form: 'Không upload được package map. Kiểm tra ZIP và thử lại.' }
  }
}

export type PoiVerifyErrors = { robotCode?: string; reason?: string; evidenceNote?: string; form?: string }

const poiVerifyConflicts: Record<string, PoiVerifyErrors> = {
  MAP_NOT_DEPLOYED: { robotCode: 'Robot này chưa có kiểm tra triển khai đạt mới nhất trên đúng phiên bản map của POI. Ghi kết quả kiểm tra map cho robot trước rồi thử lại.' },
  STALE_VERSION: { form: 'POI vừa được Staff thay đổi. Đóng cửa sổ này và mở lại để kiểm tra revision mới nhất.' },
  IDEMPOTENCY_CONFLICT: { form: 'Yêu cầu này đã được gửi với nội dung khác. Đóng cửa sổ này và mở lại.' },
}

/**
 * Vietnamese, field-level text for a refused POI result. The handler's own
 * PASS/FAIL rule refusals reach the wire as the generic 400 with an empty
 * `errors` map, so that case can only be explained by restating the rule.
 */
export function poiVerifyErrors(error: unknown): PoiVerifyErrors {
  if (!(error instanceof ApiError)) return { form: errorText(error) }
  let payload: { message?: unknown; errors?: unknown } = {}
  try { payload = JSON.parse(error.body) as typeof payload } catch { /* Non-JSON responses use the status below. */ }
  const message = typeof payload.message === 'string' ? payload.message : ''
  const errors = typeof payload.errors === 'object' && payload.errors !== null ? payload.errors as Record<string, unknown> : {}
  if (error.status === 409) {
    if (typeof errors.code === 'string' && poiVerifyConflicts[errors.code]) return poiVerifyConflicts[errors.code]
    if (message.includes('already exists')) return { form: 'Revision này đã có kết quả kiểm chứng. Đóng cửa sổ này để tải lại danh sách.' }
  }
  if (error.status === 404 && message.toLowerCase().includes('robot')) return { robotCode: 'Robot này không còn trong danh sách đã đăng ký. Chọn robot khác.' }
  if (error.status !== 400) return { form: errorText(error) }
  const mapped: PoiVerifyErrors = {}
  for (const field of Object.keys(errors).map(name => name.toLowerCase())) {
    if (field.includes('robotcode')) mapped.robotCode = 'Chọn robot vật lý đã kiểm tra.'
    else if (field.includes('evidencenote')) mapped.evidenceNote = 'Nhập ghi chú bằng chứng, tối đa 2000 ký tự.'
    else if (field.includes('reason')) mapped.reason = 'Lý do không đạt tối đa 1000 ký tự.'
  }
  return Object.keys(mapped).length ? mapped : { form: 'Máy chủ từ chối kết quả này. Đạt cần đủ cả bốn mục; Không đạt cần lý do và ít nhất một mục chưa đạt.' }
}

export type RouteTestErrors = { robotCode?: string; staff?: string; form?: string }

const routeTestConflicts: Record<string, RouteTestErrors> = {
  MAP_NOT_CURRENTLY_DEPLOYED: { robotCode: 'Lần kiểm tra triển khai mới nhất của robot này phải đạt trên đúng bản đồ và checksum của phiên bản tuyến.' },
  STAFF_PARTICIPANT_REQUIRED: { staff: 'Người đi cùng phải là tài khoản Staff đang hoạt động. Chọn lại Staff.' },
  SEPARATE_TEST_ROLES_REQUIRED: { staff: 'Người kiểm tra và Staff đi cùng phải là hai tài khoản khác nhau.' },
  ROUTE_NOT_SUBMITTED: { form: 'Phiên bản tuyến này chưa được gửi kiểm chứng.' },
  POI_VERIFICATION_STALE: { form: 'Có POI trong tuyến không còn kết quả đạt. Staff cần tạo phiên bản tuyến mới.' },
  IDEMPOTENCY_CONFLICT: { form: 'Yêu cầu này đã được gửi với nội dung khác. Đóng cửa sổ này và mở lại.' },
}

export function routeTestErrors(error: unknown): RouteTestErrors {
  if (!(error instanceof ApiError)) return { form: errorText(error) }
  let payload: { errors?: unknown; message?: unknown } = {}
  try { payload = JSON.parse(error.body) as typeof payload } catch { /* Non-JSON responses use the text below. */ }
  const errors = typeof payload.errors === 'object' && payload.errors !== null ? payload.errors as { code?: unknown } : {}
  if (typeof errors.code === 'string' && routeTestConflicts[errors.code]) return routeTestConflicts[errors.code]
  if (error.status === 404 && typeof payload.message === 'string' && payload.message.toLowerCase().includes('robot')) return { robotCode: 'Robot này không còn trong danh sách đã đăng ký. Chọn robot khác.' }
  if (error.status === 400) return { form: 'Máy chủ từ chối kết quả này. Đạt cần đủ cả ba mục; Không đạt cần lý do và ít nhất một mục chưa đạt.' }
  return { form: errorText(error) }
}

const releaseInspectionRefusals: Record<string, string> = {
  ROBOT_TOUR_ACTIVE: 'Tour đang giữ robot này chưa kết thúc. Người vận hành cần kết thúc Tour trước khi trả robot.',
  ROBOT_COMMAND_OPEN: 'Robot còn lệnh đang mở hoặc lệnh chưa đối soát. Người vận hành cần đối soát lệnh đó trước.',
  ROBOT_NOT_HELD: 'Robot không còn bị giữ và không chờ kiểm tra. Đóng cửa sổ này để tải lại.',
  STALE_VERSION: 'Robot vừa thay đổi. Đóng cửa sổ này, bấm Cập nhật trạng thái rồi thử lại.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu này đã được gửi với nội dung khác. Đóng cửa sổ này và mở lại.',
}

/** Vietnamese text for a refused release-inspection (ADR-0043 D13); unknown refusals fall back to the server message. */
export function releaseInspectionError(error: unknown) {
  if (!(error instanceof ApiError)) return errorText(error)
  if (error.status === 403) return 'Chỉ Technical Staff được trả robot sau kiểm tra tại chỗ.'
  let payload: { errors?: unknown } = {}
  try { payload = JSON.parse(error.body) as typeof payload } catch { /* Non-JSON responses use the text below. */ }
  const errors = typeof payload.errors === 'object' && payload.errors !== null ? payload.errors as { code?: unknown } : {}
  if (typeof errors.code === 'string' && releaseInspectionRefusals[errors.code]) return releaseInspectionRefusals[errors.code]
  return errorText(error)
}

export const stamp =(iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-'
