import { ApiError } from '../../../api/client'
import { formatDateTime } from '../../../components/ui/date-time'
import type { TourState, TourSummary } from './types'

export const TOUR_STATE_LABEL: Record<TourState, string> = {
  SCHEDULED: 'Đang nhận đăng ký', READY: 'Đã chốt', RUNNING: 'Đang diễn ra', COMPLETED: 'Đã kết thúc', CANCELLED: 'Đã hủy',
}

/** The filter picks every SCHEDULED Tour, whether or not its registration has closed, so it cannot use a word for only one half. */
export const TOUR_STATE_FILTER_LABEL: Record<TourState, string> = { ...TOUR_STATE_LABEL, SCHEDULED: 'Chưa chốt' }

export const REGISTRATION_CLOSED_LABEL = 'Đã đóng đăng ký'
/** Backend `TourSchedule.RegistrationClose`; used only for a server that does not send `registrationClosesAt`. */
const REGISTRATION_CLOSE_MS = 48 * 3600_000
type TourTiming = Pick<TourSummary, 'state' | 'scheduledStartAt' | 'registrationClosesAt' | 'isShortNotice'>

/**
 * Backend `TourSchedule.RegistrationClosesAt`. The 48-hour fallback is only for a Tour on a shift: a quick Tour's
 * registration stays open until its latest Start (`scheduledStartAt`), which is under 48 hours away from creation.
 */
export const registrationClosesAtOf = (tour: Pick<TourTiming, 'scheduledStartAt' | 'registrationClosesAt' | 'isShortNotice'>) =>
  tour.registrationClosesAt ? new Date(tour.registrationClosesAt).getTime()
    : new Date(tour.scheduledStartAt).getTime() - (tour.isShortNotice ? 0 : REGISTRATION_CLOSE_MS)

/** Display only: a SCHEDULED Tour past the close of registration. The Tour's state does not change at this mark. */
export const isRegistrationClosed = (tour: TourTiming, now: number) => tour.state === 'SCHEDULED' && now >= registrationClosesAtOf(tour)

/** The state as Staff reads it: SCHEDULED says whether groups can still register. */
export const tourStateLabel = (tour: TourTiming, now: number) => isRegistrationClosed(tour, now) ? REGISTRATION_CLOSED_LABEL : TOUR_STATE_LABEL[tour.state]

const CONFLICTS: Record<string, string> = {
  STALE_VERSION: 'Tour đã thay đổi. Nội dung đang nhập vẫn được giữ; tải lại trang để lấy phiên bản mới.',
  STALE_ROUTE: 'Tuyến vừa được cập nhật. Chọn lại tuyến để xem cấu hình mới rồi lưu lại.',
  ROUTE_UNAVAILABLE: 'Tuyến không còn khả dụng cho Tour mới. Chọn tuyến khác.',
  ROUTE_VERSION_REQUIRED: 'Cần tải cấu hình tuyến mới trước khi đổi tuyến. Chọn lại tuyến.',
  TOUR_DURATION_UNAVAILABLE: 'Chưa đổi được lịch hoặc tuyến của Tour đã tạo. Hãy hủy Tour rồi tạo lại.',
  ROBOT_RESERVATION_CONFLICT: 'Robot đã có Tour khác trong ca này. Chọn ca khác hoặc robot khác.',
  TOUR_LEAD_TIME_TOO_SHORT: 'Ca này quá gần hiện tại, cần tạo trước ít nhất 72 giờ. Chọn ca khác.',
  TOUR_SLOT_NOT_ALLOWED: 'Giờ bắt đầu không khớp ca nào. Chọn lại một ca.',
  SHIFT_BLOCKED: 'Ca này vừa bị Admin khoá. Chọn ca hoặc ngày khác.',
  ROUTE_TOO_LONG_FOR_SHIFT:'Tuyến dài hơn thời lượng tối đa của ca. Chọn tuyến ngắn hơn hoặc giảm thời gian dừng.',
  OPERATOR_REQUIRED: 'Người vận hành phải là tài khoản Staff đang hoạt động. Chọn lại người vận hành.',
  ROUTE_TEST_PASS_REQUIRED: 'Phiên bản tuyến này không còn kết quả chạy thử đạt. Tải lại trang rồi chọn tuyến khác.',
  ROUTE_NOT_SUBMITTED: 'Phiên bản tuyến này chưa được gửi kiểm chứng.',
  POI_VERIFICATION_STALE: 'Có POI trong tuyến không còn kết quả đạt. Tạo phiên bản tuyến mới và chạy thử lại.',
  TECHNICAL_CHECK_NOT_PASSED: 'Bản đồ của tuyến không còn kiểm tra kỹ thuật đạt. Nhờ Kỹ thuật kiểm tra lại bản đồ.',
  TECHNICAL_CHECK_PENDING: 'Bản đồ của tuyến chưa có kết quả kiểm tra kỹ thuật.',
  TOUR_LOCKED: 'Tour không còn sửa hoặc hủy được ở trạng thái hiện tại.',
  CAPACITY_BELOW_HELD: 'Không giảm được sức chứa xuống dưới số chỗ đang được giữ.',
  TOUR_CONFIGURATION_LOCKED: 'Tour đã có đăng ký hoặc lịch sử nên không đổi được lịch và tuyến. Chỉ sửa tên, mô tả.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu trùng với một thao tác trước đó. Tải lại trang rồi thử lại.',
}

type ErrorBody = { message?: unknown; errors?: { code?: string } | Record<string, string[]> }
function errorBody(error: ApiError): ErrorBody {
  try {
    const decoded: unknown = JSON.parse(error.body)
    return decoded && typeof decoded === 'object' ? decoded as ErrorBody : {}
  } catch { return {} }
}

/** The backend's own explanation of a 4xx; null when it sent none, which is what a route the server lacks looks like. */
export function backendMessage(error: ApiError): string | null {
  if (error.status < 400 || error.status >= 500) return null
  const { message } = errorBody(error)
  return typeof message === 'string' && message.trim() ? message.trim() : null
}

export const MISSING_ENDPOINT_MESSAGE = 'Không kết nối được chức năng này, có thể máy chủ chưa cập nhật.'

/** Seats still free (never negative); null when the server has not sent seats. */
export function seatsLeft(tour: { capacity?: number; heldSeats?: number }): number | null {
  if (tour.capacity == null || tour.heldSeats == null) return null
  return Math.max(0, tour.capacity - tour.heldSeats)
}

/** "Còn 12/20 chỗ"; null when the server has not sent seats. */
export function seatsLabel(tour: { capacity?: number; heldSeats?: number }): string | null {
  const left = seatsLeft(tour)
  return left == null ? null : `Còn ${left}/${tour.capacity} chỗ`
}

/**
 * The READY confirmation's warning for a Tour on a shift that is closed before its registration deadline: READY closes
 * registration early. The seats still free join the sentence when there are any. Null once the deadline has passed
 * (registration is already closed, seats free or not) and for a quick Tour, whose list Staff closes with READY anyway.
 * Display only: READY is not blocked.
 */
export function earlyReadyWarning(tour: TourTiming & { capacity?: number; heldSeats?: number }, now: number): string | null {
  if (tour.isShortNotice) return null
  const closesAt = registrationClosesAtOf(tour)
  if (now >= closesAt) return null
  const left = seatsLeft(tour)
  const seats = left ? ` và Tour còn ${left} chỗ` : ''
  return `Hạn đăng ký là ${formatDateTime(closesAt)}${seats}. Chốt bây giờ sẽ đóng đăng ký sớm: trường khác không đăng ký thêm được. Có thể mở lại trước giờ bắt đầu.`
}

/** Seats for a Tour that can still fill them; an ended Tour has nothing left to book. */
export function openSeatsLabel(tour: { state: TourState; capacity?: number; heldSeats?: number }): string | null {
  return tour.state === 'CANCELLED' || tour.state === 'COMPLETED' ? null : seatsLabel(tour)
}

/** A quick Tour has no shift, so a robot clash there speaks of the hold, not of "ca". */
const QUICK_CONFLICTS: Record<string, string> = {
  ROBOT_RESERVATION_CONFLICT: 'Robot đang được giữ cho Tour khác trong khoảng thời gian này. Chọn robot khác.',
}

export function tourError(error: unknown, context: { quick?: boolean } = {}): string {
  if (!(error instanceof ApiError)) return 'Không thể kết nối máy chủ. Hãy thử lại.'
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản không có quyền quản lý Tour.'
  const body = errorBody(error)
  const code = (body.errors as { code?: string } | undefined)?.code
  // ADR-0062: the server names the retired POIs ("Tuyến có POI đã ngưng dùng: {tên}. …"), so its wording is kept.
  if (error.status === 409 && code === 'ROUTE_HAS_RETIRED_POI')
    return backendMessage(error) ?? 'Tuyến có POI đã ngưng dùng. Lưu phiên bản tuyến mới không có POI này, hoặc dùng lại POI.'
  if (error.status === 409 && code && context.quick && QUICK_CONFLICTS[code]) return QUICK_CONFLICTS[code]
  if (error.status === 409 && code && CONFLICTS[code]) return CONFLICTS[code]
  if (error.status === 400) {
    const messages = Object.values(body.errors ?? {}).flat().filter((v): v is string => typeof v === 'string')
    if (messages.length) return [...new Set(messages)].join(' ')
  }
  const message = backendMessage(error)
  if (message) return message
  // An empty 404 never reached our API code; a JSON one did, and only lacks the wording.
  if (error.status === 404) return error.body.trim() ? 'Không tìm thấy Tour hoặc tuyến. Hãy tải lại danh sách.' : MISSING_ENDPOINT_MESSAGE
  if (error.status === 409) return 'Dữ liệu đang được cập nhật đồng thời. Tải lại rồi thử lại.'
  if (error.status === 400) return 'Dữ liệu chưa hợp lệ. Kiểm tra tên, lịch, tuyến và video dự phòng.'
  return 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.'
}
