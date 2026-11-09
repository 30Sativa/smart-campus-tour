import type { StatusTone } from '../../../components/ui/status-tone'
import type { RobotCommandState, TourLegKind, TourOperationalStatus, TourStep } from '../../administration/tours/types'

/**
 * The words of Tour operation (ADR-0042/0043), translated once. The API keeps its
 * English/UPPER_SNAKE values; nothing below lets one reach a screen untranslated.
 * A Tour's state and the state of the robot command it sent are separate
 * vocabularies on purpose: a RUNNING Tour can hold a command nobody has picked up.
 */

export type CheckGroup = 'tour' | 'robot' | 'telemetry' | 'system' | 'onsite' | 'other'

export const CHECK_GROUP_LABEL: Record<CheckGroup, string> = {
  tour: 'Tour và lịch',
  robot: 'Robot',
  telemetry: 'Telemetry robot',
  system: 'Hệ thống điều khiển',
  onsite: 'Xác nhận tại chỗ',
  other: 'Điều kiện khác',
}

/** Start check ids of `TourStartPreflight`, in the order an operator reads them. */
const CHECKS: Record<string, { label: string; group: CheckGroup }> = {
  tourReady: { label: 'Tour đã chốt', group: 'tour' },
  callerIsOperator: { label: 'Bạn là người vận hành của Tour', group: 'tour' },
  withinStartWindow: { label: 'Trong khung giờ được bắt đầu', group: 'tour' },
  reservationActive: { label: 'Tour đang giữ chỗ robot', group: 'tour' },
  revisionStillSchedulable: { label: 'Tuyến vẫn còn kết quả chạy thử đạt', group: 'tour' },
  noPendingDecisions: { label: 'Không còn đăng ký chờ duyệt', group: 'tour' },
  allViewersJoined: { label: 'Mọi điểm xem đã vào phòng chờ (khi bắt đầu sớm)', group: 'tour' },
  robotEligibleForRoute: { label: 'Robot dùng được cho tuyến', group: 'robot' },
  robotMapMatchesRoute: { label: 'Robot được gán đúng bản đồ của tuyến', group: 'robot' },
  robotNotNeedsInspection: { label: 'Robot không chờ kiểm tra tại chỗ', group: 'robot' },
  robotNotHeldByOtherTour: { label: 'Robot không bị Tour khác giữ', group: 'robot' },
  robotDispatchEnabled: { label: 'Robot được bật điều phối', group: 'robot' },
  noOpenIncident: { label: 'Không có sự cố đang mở trên robot', group: 'robot' },
  noUnresolvedCommand: { label: 'Robot không còn lệnh đang mở', group: 'robot' },
  telemetryFresh: { label: 'Telemetry robot còn mới', group: 'telemetry' },
  mapContextMatches: { label: 'Robot báo đúng bản đồ của tuyến', group: 'telemetry' },
  executionIdle: { label: 'Robot đang rảnh', group: 'telemetry' },
  robotLocalized: { label: 'Robot đã định vị', group: 'telemetry' },
  motionReady: { label: 'Robot sẵn sàng di chuyển', group: 'telemetry' },
  batteryInfo: { label: 'Pin robot (chỉ hiển thị, không chặn)', group: 'telemetry' },
  operatorConsoleConnected: { label: 'Console của người vận hành đang kết nối', group: 'system' },
  commandTransportEnabled: { label: 'Kênh lệnh robot đang bật', group: 'system' },
  robotPlaced: { label: 'Robot đặt đúng điểm xuất phát', group: 'onsite' },
  areaClear: { label: 'Khu vực xuất phát thông thoáng', group: 'onsite' },
  attendantPresent: { label: 'Người phụ trách an toàn có mặt cạnh robot', group: 'onsite' },
  previewChecked: { label: 'Đã xem hình camera', group: 'onsite' },
}

export function checkInfo(id: string): { label: string; group: CheckGroup } {
  return CHECKS[id] ?? { label: CHECK_GROUP_LABEL.other, group: 'other' }
}

/** Informational rows always pass and never block (ADR-0042 D3). */
export const INFO_CHECKS = new Set(['batteryInfo'])

/** A check the server did not run because a prerequisite failed is not a root cause. */
export type CheckVerdict = 'passed' | 'failed' | 'notRun' | 'info'
export function checkVerdict(check: { id: string; passed: boolean }, blockedBy: readonly string[]): CheckVerdict {
  if (INFO_CHECKS.has(check.id)) return 'info'
  if (check.passed) return 'passed'
  return blockedBy.includes(check.id) ? 'failed' : 'notRun'
}

/**
 * The checks that say the system itself may not move a robot yet, whatever the
 * operator does: the command transport switch and the per-robot dispatch flag
 * (ADR-0042 §6, ADR-0043 D11, M2.3 safety evidence).
 */
export const SYSTEM_GATES = ['commandTransportEnabled', 'robotDispatchEnabled'] as const

/**
 * Who clears a failed Start check. `system` is what nobody on this screen can
 * change (the M2.3 gates and the console presence the backend cannot see yet);
 * `robot` is what the robot reports or what is recorded about it.
 */
export type BlockerOwner = 'tour' | 'robot' | 'system'
export function blockerOwner(id: string): BlockerOwner {
  if ((SYSTEM_GATES as readonly string[]).includes(id) || id === 'operatorConsoleConnected') return 'system'
  const group = checkInfo(id).group
  return group === 'robot' || group === 'telemetry' ? 'robot' : 'tour'
}

/** Where the server read a check from (the `source` of `TourStartPreflight`), in words. */
export const CHECK_SOURCE_LABEL: Record<string, string> = {
  DB: 'Dữ liệu hệ thống',
  TELEMETRY: 'Robot tự báo',
  CONFIG: 'Cấu hình máy chủ',
  CONSOLE: 'Kết nối console',
}

/** What to do about a failed check, when someone on site can do something. The server's detail says why it failed. */
export const CHECK_FIX: Record<string, string> = {
  tourReady: 'Chốt Tour ở trang chuẩn bị Tour.',
  callerIsOperator: 'Đăng nhập bằng tài khoản người vận hành được giao, hoặc đổi người vận hành ở trang chuẩn bị Tour.',
  reservationActive: 'Giữ lại robot cho khung giờ ở trang chuẩn bị Tour.',
  revisionStillSchedulable: 'Tuyến cần một lần chạy thử đạt (Technical Staff).',
  noPendingDecisions: 'Duyệt hết các đăng ký còn chờ ở mục Đăng ký đoàn.',
  allViewersJoined: 'Chờ các điểm xem vào phòng chờ. Từ giờ công bố mục này tự đạt.',
  robotEligibleForRoute: 'Technical Staff kiểm tra robot với phiên bản tuyến.',
  robotMapMatchesRoute: 'Technical Staff gán đúng bản đồ của tuyến cho robot.',
  robotNotNeedsInspection: 'Kiểm tra robot tại chỗ rồi xác nhận ở Robot & thiết bị.',
  robotNotHeldByOtherTour: 'Chờ Tour đang giữ robot kết thúc.',
  noOpenIncident: 'Xử lý sự cố ở màn hình điều hành của Tour đang giữ robot.',
  noUnresolvedCommand: 'Đóng lệnh còn mở ở màn hình điều hành (Đối soát).',
  telemetryFresh: 'Bật robot và cầu nối telemetry trên miniPC. Mục này tự đạt khi máy chủ nhận được báo cáo mới.',
  mapContextMatches: 'Cho robot chạy đúng bản đồ của tuyến.',
  executionIdle: 'Chờ robot làm xong việc đang làm.',
  robotLocalized: 'Định vị lại robot trên bản đồ (đặt vị trí ban đầu).',
  motionReady: 'Kiểm tra nút dừng khẩn cấp và động cơ của robot.',
}

export const STEP_LABEL: Record<TourStep, string> = {
  NAVIGATING: 'Đang di chuyển tới POI',
  OBSERVING: 'Đang dừng tại POI',
  RETURNING_TO_END: 'Đang về điểm kết thúc',
}

export const LEG_LABEL: Record<TourLegKind, string> = { TO_POI: 'Chặng tới POI', TO_END: 'Chặng về điểm kết thúc' }

export const OPERATIONAL_LABEL: Record<TourOperationalStatus, { label: string; tone: StatusTone }> = {
  NORMAL: { label: 'Bình thường', tone: 'ok' },
  NEEDS_ASSISTANCE: { label: 'Cần hỗ trợ', tone: 'danger' },
}

const ASSISTANCE: Record<string, { label: string; hint: string }> = {
  NavigationFailed: { label: 'Lỗi điều hướng', hint: 'Robot báo không tới được đích. Kiểm tra đường đi tại chỗ.' },
  CommandRejected: { label: 'Robot từ chối lệnh', hint: 'Robot không nhận lệnh di chuyển. Xem lý do robot báo bên dưới.' },
  CommandUnknown: { label: 'Chưa rõ kết quả lệnh', hint: 'Không biết robot đã làm gì với lệnh. Kiểm tra robot tại chỗ trước khi làm gì tiếp.' },
  CommandExpired: { label: 'Robot không lấy lệnh kịp', hint: 'Robot vẫn gửi telemetry nhưng không lấy lệnh trước thời hạn, nên lệnh đã hết hiệu lực và robot chưa nhận lệnh này.' },
  RobotDisconnected: { label: 'Mất kết nối robot', hint: 'Robot không lấy lệnh trước thời hạn và máy chủ không còn nhận telemetry mới từ robot. Không coi là robot đã dừng: kiểm tra robot tại chỗ.' },
  BackendRestarted: { label: 'Máy chủ vừa khởi động lại', hint: 'Máy chủ không tự gửi lệnh mới sau khi khởi động lại. Robot có thể vẫn đang thực hiện lệnh cũ: xem trạng thái lệnh và kiểm tra robot tại chỗ.' },
}
export function assistanceInfo(reason: string | null | undefined): { label: string; hint: string } {
  return (reason && ASSISTANCE[reason]) || { label: 'Cần nhân viên kiểm tra', hint: 'Xem trạng thái lệnh robot bên dưới.' }
}

/** What each persisted command state means to a person watching it (ADR-0042 §3). */
export const COMMAND_STATE: Record<RobotCommandState, { label: string; tone: StatusTone; meaning: string }> = {
  PENDING: { label: 'Chờ robot lấy lệnh', tone: 'muted', meaning: 'Lệnh đã lưu trên máy chủ, robot chưa lấy về. Robot chưa di chuyển vì lệnh này.' },
  DELIVERED: { label: 'Robot đã lấy lệnh', tone: 'info', meaning: 'Robot đã lấy lệnh nhưng chưa báo nhận.' },
  ACCEPTED: { label: 'Robot đang thực hiện', tone: 'info', meaning: 'Robot đã nhận lệnh và đang thực hiện.' },
  ARRIVED: { label: 'Đã tới nơi', tone: 'ok', meaning: 'Robot báo đã tới đích.' },
  FAILED: { label: 'Thất bại', tone: 'danger', meaning: 'Robot báo không hoàn thành lệnh.' },
  CANCELLED: { label: 'Đã hủy', tone: 'muted', meaning: 'Lệnh đã bị hủy trước khi tới đích.' },
  EXPIRED: { label: 'Hết hạn', tone: 'warn', meaning: 'Robot không lấy lệnh kịp thời hạn nên lệnh không còn hiệu lực. Robot chưa nhận lệnh này.' },
  REJECTED: { label: 'Robot từ chối', tone: 'danger', meaning: 'Robot không nhận lệnh.' },
  UNKNOWN: { label: 'Chưa rõ kết quả', tone: 'danger', meaning: 'Robot có thể đã bắt đầu, nhưng máy chủ không biết kết quả. Lệnh vẫn chặn robot.' },
  RECONCILED: { label: 'Đã đối soát', tone: 'muted', meaning: 'Người vận hành đã đóng lệnh chưa rõ kết quả; robot cần kiểm tra tại chỗ.' },
}
export function commandStateInfo(state: string) {
  return COMMAND_STATE[state as RobotCommandState] ?? { label: 'Trạng thái lệnh khác', tone: 'muted' as const, meaning: 'Máy chủ báo một trạng thái lệnh chưa được mô tả.' }
}

export const COMMAND_KIND_LABEL: Record<string, string> = { GoTo: 'Lệnh di chuyển', Cancel: 'Lệnh hủy' }

const ROBOT_REASON: Record<string, string> = {
  MAP_MISMATCH: 'Robot đang dùng bản đồ khác bản đồ của lệnh',
  BUSY: 'Robot đang bận một lệnh khác',
  EXPIRED: 'Quá thời hạn nhận lệnh',
  ACK_TIMEOUT: 'Robot đã lấy lệnh nhưng không báo nhận trước thời hạn',
  LEG_RESULT_TIMEOUT: 'Robot không báo kết quả chặng trước thời hạn',
  STREAM_CHANGED: 'Kênh telemetry của robot đã đổi sau khi robot lấy lệnh (robot hoặc cầu nối có thể đã khởi động lại)',
  LEG_ENDED: 'Chặng đã đóng nên lệnh này không còn cần',
  UNKNOWN_LEG: 'Robot không nhận ra chặng này',
  WITHDRAWN: 'Lệnh đã được rút trước khi robot lấy',
}
/** A robot or server reason code in words; an unlisted one is shown as a code, labelled as such. */
export function robotReasonText(code: string | null | undefined): string | null {
  if (!code) return null
  return ROBOT_REASON[code] ?? `Mã lý do: ${code}`
}
