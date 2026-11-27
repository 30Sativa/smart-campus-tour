import { ApiError, apiErrorDetail } from '../../api/client'
import type { PhysicalRobotConnectionStatus } from './api/technical'

export const connectionStatusLabel = (status: PhysicalRobotConnectionStatus) => ({
  UNCONFIRMED: 'Chưa xác nhận kết nối',
  CONNECTED: 'Đã xác nhận · Đang kết nối',
  DISCONNECTED: 'Đã xác nhận · Mất kết nối',
  AWAITING_DATA: 'Đã xác nhận · Chưa nhận dữ liệu',
  WRONG_MAP: 'Sai bản đồ',
})[status]

/**
 * WRONG_MAP: the robot is sending, but on another map than the one it holds. The server's own sentence is used (it
 * also covers a FrameId-only mismatch); this text is for a report that carries none.
 */
export const wrongMapText = (report: { mapKey: string; message?: string | null }, assignedMapKey: string | null) =>
  report.message?.trim() || `Robot đang gửi dữ liệu theo ${report.mapKey}, bị từ chối vì đang gán ${assignedMapKey ?? 'bản đồ khác'}. Đổi MapKey/FrameId trên MiniPC.`

/** The robot line of the POI check and route test forms (round 3, W1). */
export const robotFieldText = {
  assignedLine: (robotCode: string, at: string) => `Gán bản đồ: ${robotCode} · gán lúc ${at}`,
  reportingLine: (mapKey: string) => `MiniPC báo về theo ${mapKey}`,
  reportingWrongMap: (sentMapKey: string) => `đang gửi ${sentMapKey}`,
  deploymentLine: 'Kiểm tra triển khai',
  nextStep: {
    ASSIGN_MAP: (robotCode: string) => `Gán bản đồ cho ${robotCode}`,
    CONFIRM_CONNECTION: (robotCode: string) => `Kết nối MiniPC cho ${robotCode}`,
    CONFIGURE_MINIPC: (robotCode: string) => `Cấu hình MiniPC cho ${robotCode}`,
    DEPLOYMENT_CHECK: (robotCode: string) => `Kiểm tra triển khai ${robotCode}`,
  },
  openSetup: (robotCode: string) => `Mở thiết lập ${robotCode}`,
  noRobot: 'Chưa có robot nào chạy bản đồ này.',
  otherMap: (robotCode: string, running: string, subject: string, own: string) => `${robotCode} đang chạy ${running}, khác bản đồ của ${subject} này (${own}).`,
  assignConsequence: 'Robot sẽ rời bản đồ đang chạy, Tour trên bản đồ đó không chạy được với robot này, điều phối tự tắt.',
  wrongMapPoi: 'Nếu POI đặt nhầm bản đồ, nhờ Staff xoá POI và tạo lại trên bản đồ robot đang chạy.',
  wrongMapRoute: 'Nếu tuyến đặt nhầm bản đồ, nhờ Staff tạo phiên bản tuyến mới trên bản đồ robot đang chạy.',
}

/** The strip on the robot page when it was opened from a POI check or a route test (round 3, W2). */
export const returnStripText = {
  preparing: (target: { kind: 'poi' | 'route'; name: string | null } | null) => !target?.name ? 'Đang chuẩn bị robot'
    : target.kind === 'poi' ? `Đang chuẩn bị robot để kiểm chứng POI ${target.name}` : `Đang chuẩn bị robot để chạy thử tuyến ${target.name}`,
  back: (target: { kind: 'poi' | 'route'; name: string | null } | null) => !target?.name ? 'Quay lại' : target.kind === 'poi' ? 'Quay lại POI' : 'Quay lại tuyến',
  ready: (target: { kind: 'poi' | 'route'; name: string | null } | null) => !target?.name ? 'Robot đã sẵn sàng · Quay lại'
    : target.kind === 'poi' ? `Robot đã sẵn sàng · Quay lại kiểm chứng POI ${target.name}` : `Robot đã sẵn sàng · Quay lại chạy thử tuyến ${target.name}`,
  /** Ready, but on another map than the POI's or route's (round 4, W1): the strip must not say "đã sẵn sàng". */
  otherMap: (target: { kind: 'poi' | 'route'; name: string }, robotCode: string, targetMap: string | null, readyMap: string) => {
    const where = targetMap ? ` (${targetMap})` : ''
    return target.kind === 'poi'
      ? `Đang chuẩn bị ${robotCode} để kiểm chứng POI ${target.name}${where}. ${robotCode} hiện sẵn sàng trên ${readyMap}, chưa phải bản đồ của POI này.`
      : `Đang chuẩn bị ${robotCode} để chạy thử tuyến ${target.name}${where}. ${robotCode} hiện sẵn sàng trên ${readyMap}, chưa phải bản đồ của tuyến này.`
  },
}

/**
 * Step 3 of the robot setup (round 5, W1). A check recorded before the current assignment no longer counts: the robot
 * moved away and back, so it is said as history to redo, never as done. `at` is null when the server no longer sends
 * that check's time (it then names both times in `readiness.detail`).
 */
export const deploymentStepText = {
  previous: (passed: boolean, at: string | null) => `Lần trước: ${passed ? 'Đạt' : 'Không đạt'}${at ? ` ${at}` : ''}`,
  beforeAssignment: (at: string | null, assignedAt: string) => `Lần trước: Đạt${at ? ` ${at}` : ''}, trước lần gán ${assignedAt}. Cần kiểm lại.`,
}

/** A robot running a Tour keeps its map, its activation and its key until the Tour ends (round 5, W2). */
export const runningTourText = {
  blocked: (tourName: string | null) => `Robot đang chạy Tour${tourName ? ` ${tourName}` : ''}. Kết thúc Tour rồi mới đổi.`,
  revokeWarning: (tourName: string | null) => `Robot đang chạy Tour${tourName ? ` ${tourName}` : ''}; thu hồi khóa làm robot mất kết nối giữa Tour.`,
}

export function errorText(error: unknown) {
  const detail = apiErrorDetail(error)
  if (detail) return detail
  if (error instanceof ApiError && error.body) {
    try {
      const payload = JSON.parse(error.body) as { message?: unknown }
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
    } catch { /* Non-JSON responses use the transport error below. */ }
  }
  return error instanceof Error ? error.message : 'Không lưu được. Thử lại.'
}

/** The `errors.code` of a refused request, when the backend sent one. */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.body) return null
  try {
    const code = (JSON.parse(error.body) as { errors?: { code?: unknown } }).errors?.code
    return typeof code === 'string' ? code : null
  } catch { return null }
}

/** The refusal's own `message`, which the server writes in Vietnamese for the readiness codes. */
function serverMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.body) return null
  try {
    const message = (JSON.parse(error.body) as { message?: unknown }).message
    return typeof message === 'string' && message.trim() ? message : null
  } catch { return null }
}

/**
 * Refusals that mean "this robot is not ready on this map". The server's sentence names the robot, the map and the
 * missing condition, so it is shown as is; the fixed text is only for an older server that sent none.
 */
const readinessRefusals: Record<string, string> = {
  ROBOT_MAP_NOT_ASSIGNED: 'Robot không đang gán bản đồ này. Đổi bản đồ cho robot ở trang Robot trước khi ghi kiểm tra triển khai.',
  ROBOT_NOT_REPORTING: 'Robot chưa gửi dữ liệu theo bản đồ đang gán. Bật fleet_bridge với MapKey và FrameId của bản đồ này rồi bấm Cập nhật trạng thái.',
  MAP_NOT_DEPLOYED: 'Robot chưa sẵn sàng trên bản đồ của POI này. Mở thiết lập robot để xem lý do.',
  ROBOT_NOT_READY_FOR_ROUTE: 'Robot chưa sẵn sàng trên bản đồ của tuyến này. Mở thiết lập robot để xem lý do.',
  ROBOT_CONNECTION_UNCONFIRMED: 'Robot này chưa xác nhận kết nối. Chạy bridge Fleet Sync bằng khóa hiện tại, bấm Cập nhật trạng thái rồi thử lại.',
  MAP_NOT_CURRENTLY_DEPLOYED: 'Robot chưa sẵn sàng trên bản đồ và checksum của phiên bản tuyến này. Mở thiết lập robot để xem lý do.',
  ROBOT_DEPLOYMENT_CHECK_REQUIRED: 'Robot chưa có kiểm tra triển khai đạt trên bản đồ đang gán.',
  ROBOT_DEACTIVATED: 'Robot đã ngừng sử dụng.',
}

/** Vietnamese text for a readiness refusal, or null when the error is something else. */
export function readinessRefusalText(error: unknown): string | null {
  const code = apiErrorCode(error)
  if (!code || !readinessRefusals[code]) return null
  return serverMessage(error) ?? readinessRefusals[code]
}

/** A refused deployment check: the robot must hold this map, and a pass needs live data on it. */
export const deploymentErrorText = (error: unknown) => readinessRefusalText(error) ?? errorText(error)

const narrationConflicts: Record<string, string> = {
  NARRATION_SELF_APPROVAL_FORBIDDEN: 'Bạn là người sửa bản này lần cuối nên không duyệt được. Cần một Staff khác duyệt. Dữ liệu mới nhất đã được tải lại.',
  STALE_VERSION: 'Thuyết minh vừa được người khác thay đổi. Dữ liệu mới nhất đã được tải lại, hãy kiểm tra rồi thử lại.',
  NARRATION_NOT_DRAFT: 'Bản này không còn là bản đang soạn, có thể đã được duyệt hoặc bỏ. Dữ liệu mới nhất đã được tải lại.',
  POI_PROPOSAL_DISCARDED: 'POI này đã bị xoá khỏi danh sách nên không sửa được thuyết minh.',
  POI_RETIRED: 'POI này đã ngưng dùng nên không sửa được thuyết minh. Dùng lại POI trước.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu này đã được gửi với nội dung khác. Tải lại trang rồi thử lại.',
}

/** Vietnamese text for a refused narration write, and whether the page should reload its data. */
export function narrationErrorText(error: unknown): { text: string; reload: boolean } {
  const code = apiErrorCode(error)
  if (code && narrationConflicts[code]) return { text: narrationConflicts[code], reload: code !== 'IDEMPOTENCY_CONFLICT' }
  if (error instanceof ApiError && error.status === 400) return { text: 'Thuyết minh cần 1 đến 4000 ký tự.', reload: false }
  return { text: errorText(error), reload: false }
}

export function mapUploadFieldErrors(error: unknown): { areaKey?: string; areaName?: string; package?: string; form?: string } {
  if (!(error instanceof ApiError) || !error.body) return { form: errorText(error) }
  try {
    const payload = JSON.parse(error.body) as { errors?: Record<string, unknown>; message?: unknown }
    const errors = payload.errors
    if (typeof errors === 'object' && errors !== null && 'code' in errors && errors.code === 'MAP_AREA_NAME_CONFLICT')
      return { areaKey: 'Mã khu vực này đã tồn tại. Hãy chuyển sang “Khu vực đã có” để giữ nguyên tên đã lưu.' }
    if (typeof errors === 'object' && errors !== null && 'code' in errors && errors.code === 'MAP_AREA_NAME_TAKEN')
      return { areaName: typeof payload.message === 'string' && payload.message.trim() ? payload.message : 'Đã có khu vực trùng tên. Chọn Khu vực đã có hoặc đặt tên khác.' }
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
  STALE_VERSION: { form: 'POI vừa được Staff thay đổi. Đóng cửa sổ này và mở lại để kiểm tra phiên bản mới nhất.' },
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
    const notReady = readinessRefusalText(error)
    if (notReady) return { robotCode: notReady }
    if (typeof errors.code === 'string' && poiVerifyConflicts[errors.code]) return poiVerifyConflicts[errors.code]
    if (message.includes('already exists')) return { form: 'Phiên bản POI này đã có kết quả kiểm chứng. Đóng cửa sổ này để tải lại danh sách.' }
  }
  if (error.status === 404 && message.toLowerCase().includes('robot')) return { robotCode: 'Robot này không còn trong danh sách đã đăng ký. Chọn robot khác.' }
  if (error.status !== 400) return { form: errorText(error) }
  const detail = apiErrorDetail(error)
  if (detail) return { form: detail }
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
  const notReady = readinessRefusalText(error)
  if (notReady) return { robotCode: notReady }
  if (typeof errors.code === 'string' && routeTestConflicts[errors.code]) return routeTestConflicts[errors.code]
  if (error.status === 404 && typeof payload.message === 'string' && payload.message.toLowerCase().includes('robot')) return { robotCode: 'Robot này không còn trong danh sách đã đăng ký. Chọn robot khác.' }
  if (error.status === 400) return { form: apiErrorDetail(error) ?? 'Máy chủ từ chối kết quả này. Đạt cần đủ cả ba mục; Không đạt cần lý do và ít nhất một mục chưa đạt.' }
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
