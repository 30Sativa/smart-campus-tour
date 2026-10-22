import { ApiError } from '../../../api/client'
import type { TourState } from './types'

export const TOUR_STATE_LABEL: Record<TourState, string> = {
  SCHEDULED: 'Đang nhận đăng ký', READY: 'Đã chốt', RUNNING: 'Đang diễn ra', COMPLETED: 'Đã kết thúc', CANCELLED: 'Đã hủy',
}

const CONFLICTS: Record<string, string> = {
  STALE_VERSION: 'Tour đã thay đổi. Nội dung đang nhập vẫn được giữ; tải lại trang để lấy phiên bản mới.',
  STALE_ROUTE: 'Tuyến vừa được cập nhật. Chọn lại tuyến để xem cấu hình mới rồi lưu lại.',
  ROUTE_UNAVAILABLE: 'Tuyến không còn khả dụng cho Tour mới. Chọn tuyến khác.',
  ROUTE_VERSION_REQUIRED: 'Cần tải cấu hình tuyến mới trước khi đổi tuyến. Chọn lại tuyến.',
  TOUR_LOCKED: 'Tour không còn sửa hoặc hủy được ở trạng thái hiện tại.',
  TOUR_CONFIGURATION_LOCKED: 'Tour đã có đăng ký hoặc lịch sử nên không đổi được lịch và tuyến. Chỉ sửa tên, mô tả.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu trùng với một thao tác trước đó. Tải lại trang rồi thử lại.',
}

export function tourError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không thể kết nối máy chủ. Hãy thử lại.'
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản không có quyền quản lý Tour.'
  if (error.status === 404) return 'Không tìm thấy Tour hoặc tuyến. Hãy tải lại danh sách.'
  let body: { message?: string; errors?: { code?: string } | Record<string, string[]> } = {}
  try {
    const decoded: unknown = JSON.parse(error.body)
    if (decoded && typeof decoded === 'object') body = decoded as typeof body
  } catch { /* Use the status message below. */ }
  const code = (body.errors as { code?: string } | undefined)?.code
  if (error.status === 409) return (code && CONFLICTS[code]) ?? 'Dữ liệu đang được cập nhật đồng thời. Tải lại rồi thử lại.'
  if (error.status === 400) {
    const messages = Object.values(body.errors ?? {}).flat().filter((v): v is string => typeof v === 'string')
    return messages.length ? [...new Set(messages)].join(' ') : 'Dữ liệu chưa hợp lệ. Kiểm tra tên, lịch, tuyến và video dự phòng.'
  }
  return 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.'
}
