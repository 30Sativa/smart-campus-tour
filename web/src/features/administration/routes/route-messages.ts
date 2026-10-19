import { ApiError } from '../../../api/client'

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
