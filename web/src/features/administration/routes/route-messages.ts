import { ApiError } from '../../../api/client'
import { MISSING_ENDPOINT_MESSAGE, backendMessage } from '../tours/tour-messages'
import type { StopDraft } from './RouteStopsEditor'
import type { VersionedRoute } from './versioned-api'

const fitMinutes = (seconds: number) => `${Math.ceil(seconds / 60)} phút`

/** docs/lich-tour-theo-ca.md §4: the words for a route that does not sit comfortably in a shift; null when it fits or is not measured yet. */
export function scheduleFitLabel(route: Pick<VersionedRoute, 'scheduleFit' | 'expectedDurationSeconds'>): { tone: 'danger' | 'warn'; text: string; detail: string } | null {
  const expected = route.expectedDurationSeconds ? `Dự kiến ${fitMinutes(route.expectedDurationSeconds)}` : 'Thời lượng dự kiến'
  if (route.scheduleFit === 'TOO_LONG_FOR_SHIFT')
    return { tone: 'danger', text: 'Quá dài cho 1 ca', detail: `${expected}, vượt thời lượng tối đa của mọi ca nên không xếp lịch được.` }
  if (route.scheduleFit === 'OVER_RECOMMENDED')
    return { tone: 'warn', text: 'Dài hơn mức khuyến nghị', detail: `${expected}, dài hơn mức khuyến nghị. Vẫn xếp lịch được.` }
  return null
}

/** A revision's state as words and colour: draft, submitted and waiting, passed, failed. */
export function revisionTone(submitted: boolean, status: string) {
  if (!submitted) return { label: 'Bản nháp', chip: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]' }
  if (status === 'PASS') return { label: 'Đã kiểm chứng', chip: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]' }
  if (status === 'FAIL') return { label: 'Không đạt', chip: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]' }
  return { label: 'Chờ kiểm chứng', chip: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]' }
}

const ISSUES: Record<string, string> = {
  MAP_REQUIRED: 'Chưa có map và frame.', START_POSE_INVALID: 'Pose bắt đầu không hợp lệ.',
  END_POSE_REQUIRED: 'Điểm kết thúc cần đủ x, y và yaw hợp lệ.', END_MODE_INVALID: 'Cách kết thúc và pose kết thúc không khớp.',
  STOPS_REQUIRED: 'Cần ít nhất một POI.', STOP_ORDER_INVALID: 'Thứ tự điểm dừng phải liên tiếp từ 1.',
  DUPLICATE_POI: 'Mỗi POI chỉ xuất hiện một lần trong tuyến.', POI_NOT_FOUND: 'Có POI không còn tồn tại.',
  POI_MAP_MISMATCH: 'Tất cả POI phải có cùng map và frame với tuyến.', DWELL_INVALID: 'Thời gian dừng phải lớn hơn 0.',
  POI_POSE_INVALID: 'Có POI chứa tọa độ hoặc hướng không hợp lệ. Kiểm tra lại POI.',
  HEAD_STEPS_INVALID: 'Mỗi góc nhìn cần thời gian giữ dương, tổng không vượt thời gian dừng.',
  POI_INACTIVE: 'Có POI chưa khả dụng. Kích hoạt POI trước khi kích hoạt tuyến.',
}
export function routeIssue(code: string): string { return ISSUES[code] ?? 'Cấu hình cần được kiểm tra lại.' }
export function routeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không thể kết nối máy chủ. Hãy thử lại.'
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản không có quyền quản lý tuyến.'
  if (error.status === 404) return 'Tuyến không còn tồn tại. Hãy tải lại danh sách.'
  let body: { errors?: { code?: string } | Record<string, string[]> } = {}
  try {
    const decoded: unknown = JSON.parse(error.body)
    if (decoded && typeof decoded === 'object') body = decoded as typeof body
  } catch { /* Use the status message below. */ }
  if (error.status === 409 && body.errors?.code === 'ROUTE_CONCURRENT_CHANGE') return 'Dữ liệu liên quan đang được cập nhật đồng thời. Nội dung đang nhập vẫn được giữ; tải lại và thử lại.'
  if (error.status === 409) return body.errors?.code === 'STALE_ROUTE'
    ? 'Tuyến đã thay đổi. Nội dung đang nhập vẫn được giữ; tải lại trang để lấy phiên bản mới trước khi sửa tiếp.'
    : 'Tuyến đang được tham chiếu hoặc được Tour đã chốt sử dụng. Hãy tải lại; sao chép tuyến nếu cần đổi hành trình.'
  if (error.status === 400) {
    const codes = Object.values(body.errors ?? {}).flat().filter((v): v is string => typeof v === 'string' && v in ISSUES)
    return codes.length ? [...new Set(codes)].map(routeIssue).join(' ') : 'Dữ liệu chưa hợp lệ. Kiểm tra tên, map, pose, điểm dừng và thời gian giữ góc nhìn.'
  }
  return 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.'
}

/** Deactivate and activate speak in the backend's words, which name the actual refusal. */
export function routeAvailabilityError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không thể kết nối máy chủ. Hãy thử lại.'
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản không có quyền quản lý tuyến.'
  const message = backendMessage(error)
  if (message) return message
  if (error.status === 404) return error.body.trim() ? 'Không tìm thấy tuyến. Hãy tải lại danh sách.' : MISSING_ENDPOINT_MESSAGE
  return 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.'
}

/** Same rule the backend enforces (HEAD_STEPS_INVALID / DWELL_INVALID), checked early so the wizard can block "Tiếp". */
export function stopIssue(stop: StopDraft): string | null {
  if (!(stop.dwellSeconds > 0)) return 'Nhập thời gian dừng lớn hơn 0.'
  if (stop.headSteps.some(h => !(h.holdSeconds > 0))) return 'Nhập thời gian giữ lớn hơn 0 cho mọi góc nhìn.'
  const total = stop.headSteps.reduce((sum, h) => sum + h.holdSeconds, 0)
  return total > stop.dwellSeconds ? `Tổng góc nhìn ${total}s vượt thời gian dừng ${stop.dwellSeconds}s.` : null
}
