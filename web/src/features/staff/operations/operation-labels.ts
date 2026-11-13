import type { StatusTone } from '../../../components/ui/status-tone'
import { formatRelative } from '../../../components/ui/date-time'
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
  telemetry: 'Robot tự báo',
  system: 'Hệ thống điều khiển',
  onsite: 'Xác nhận tại chỗ',
  other: 'Điều kiện khác',
}

/** Start check ids of `TourStartPreflight`, in the order an operator reads them. */
const CHECKS: Record<string, { label: string; group: CheckGroup }> = {
  tourReady: { label: 'Tour đã chốt', group: 'tour' },
  callerIsOperator: { label: 'Đăng nhập đúng người vận hành', group: 'tour' },
  withinStartWindow: { label: 'Trong khung giờ được bắt đầu', group: 'tour' },
  reservationActive: { label: 'Tour đang giữ chỗ robot', group: 'tour' },
  revisionStillSchedulable: { label: 'Tuyến vẫn còn kết quả chạy thử đạt', group: 'tour' },
  noPendingDecisions: { label: 'Không còn đăng ký chờ duyệt', group: 'tour' },
  hasAcceptedRows: { label: 'Có ít nhất một dòng đăng ký đã duyệt', group: 'tour' },
  allViewersJoined: { label: 'Điểm xem đã vào phòng chờ (chỉ cảnh báo, không chặn)', group: 'tour' },
  robotEligibleForRoute: { label: 'Robot dùng được cho tuyến', group: 'robot' },
  robotMapMatchesRoute: { label: 'Robot được gán đúng bản đồ của tuyến', group: 'robot' },
  robotNotNeedsInspection: { label: 'Robot không chờ kiểm tra tại chỗ', group: 'robot' },
  robotNotHeldByOtherTour: { label: 'Robot không bị Tour khác giữ', group: 'robot' },
  robotDispatchEnabled: { label: 'Robot được bật điều phối', group: 'robot' },
  noOpenIncident: { label: 'Không có sự cố đang mở trên robot', group: 'robot' },
  noUnresolvedCommand: { label: 'Robot không còn lệnh đang mở', group: 'robot' },
  telemetryFresh: { label: 'Robot vừa báo trạng thái', group: 'telemetry' },
  mapContextMatches: { label: 'Robot báo đúng bản đồ của tuyến', group: 'telemetry' },
  executionIdle: { label: 'Robot đang rảnh', group: 'telemetry' },
  robotLocalized: { label: 'Robot đã định vị', group: 'telemetry' },
  motionReady: { label: 'Robot sẵn sàng di chuyển', group: 'telemetry' },
  batteryInfo: { label: 'Pin robot (chỉ hiển thị, không chặn)', group: 'telemetry' },
  operatorConsoleConnected: { label: 'Trang của người vận hành đang mở', group: 'system' },
  commandTransportEnabled: { label: 'Kênh lệnh robot đang bật', group: 'system' },
  robotPlaced: { label: 'Robot đặt đúng điểm xuất phát', group: 'onsite' },
  areaClear: { label: 'Khu vực xuất phát thông thoáng', group: 'onsite' },
  attendantPresent: { label: 'Người phụ trách an toàn có mặt cạnh robot', group: 'onsite' },
  previewChecked: { label: 'Đã xem hình camera', group: 'onsite' },
}

export function checkInfo(id: string): { label: string; group: CheckGroup } {
  return CHECKS[id] ?? { label: CHECK_GROUP_LABEL.other, group: 'other' }
}

/** Informational rows always pass and never block (ADR-0042 D3, ADR-0057). */
export const INFO_CHECKS = new Set(['batteryInfo', 'allViewersJoined'])

/** A check the server did not run because a prerequisite failed is not a root cause. */
export type CheckVerdict = 'passed' | 'failed' | 'notRun' | 'info'
export function checkVerdict(check: { id: string; passed: boolean }, blockedBy: readonly string[]): CheckVerdict {
  if (INFO_CHECKS.has(check.id)) return 'info'
  if (check.passed) return 'passed'
  return blockedBy.includes(check.id) ? 'failed' : 'notRun'
}

/** How many checks passed, failed (a root cause), were not run behind one, or are information only. */
export type CheckCounts = { passed: number; failed: number; notRun: number; info: number; counted: number }
export function checkCounts(checks: ReadonlyArray<{ id: string; passed: boolean }>, blockedBy: readonly string[]): CheckCounts {
  const counts: CheckCounts = { passed: 0, failed: 0, notRun: 0, info: 0, counted: 0 }
  for (const check of checks) counts[checkVerdict(check, blockedBy)]++
  counts.counted = counts.passed + counts.failed + counts.notRun
  return counts
}
/** "3/6 đạt, 2 chưa đạt, 1 chưa kiểm tra": every counted check in one of the three, so the numbers add up. */
export function checkCountText(counts: CheckCounts): string {
  if (!counts.counted) return 'Thông tin'
  return [`${counts.passed}/${counts.counted} đạt`, counts.failed && `${counts.failed} chưa đạt`, counts.notRun && `${counts.notRun} chưa kiểm tra`]
    .filter(Boolean).join(', ')
}
/** The worst verdict of a group: any failure, else any check not run, else all passed (or information only). */
export function groupVerdict(counts: CheckCounts): CheckVerdict {
  return counts.failed ? 'failed' : counts.notRun ? 'notRun' : counts.counted ? 'passed' : 'info'
}

/**
 * The server's detail of a Start check (`TourStartPreflight`), in words for the operator. The server's text carries
 * check ids, state names, configuration keys and raw seconds; this keeps only what the reader acts on.
 */
export function checkDetail(check: { id: string; passed: boolean; detail: string }, blockedBy: readonly string[], now: number = Date.now()): string {
  const verdict = checkVerdict(check, blockedBy)
  if (verdict === 'notRun') {
    const prerequisite = /Chưa kiểm tra vì (\w+) chưa đạt/.exec(check.detail)?.[1]
    return prerequisite && CHECKS[prerequisite] ? `Chưa kiểm tra vì mục "${CHECKS[prerequisite].label}" chưa đạt.` : 'Chưa kiểm tra vì một mục khác chưa đạt.'
  }
  const own = DETAIL[check.id]
  if (own) {
    const text = own(check.passed, check.detail, now)
    if (text) return text
  }
  return plainDetail(check.detail)
}

/** Words the server uses that a Staff screen does not: the English action name and bracketed codes. */
function plainDetail(detail: string): string {
  return detail
    .replace(/\s*\([A-Za-z]+(?:[:.][A-Za-z]+)*\s*=\s*[^)]*\)/g, '')
    .replace(/\s*\([A-Z][A-Z0-9_]+\)/g, '')
    .replace(/^[A-Z][A-Z0-9_]+:\s*/, '')
    .replace(/Start sớm/g, 'bắt đầu sớm')
    .replace(/không chặn Start/g, 'không chặn bắt đầu')
    .replace(/\bStart\b/g, 'bắt đầu')
}

const ago = (detail: string, now: number) => {
  const seconds = Number(/cách đây ([\d.,]+) giây/.exec(detail)?.[1]?.replace(',', '.'))
  return Number.isFinite(seconds) ? formatRelative(now - seconds * 1000, now) : null
}

type DetailText = (passed: boolean, detail: string, now: number) => string | null
const DETAIL: Record<string, DetailText> = {
  tourReady: passed => passed ? 'Tour đã chốt.' : 'Tour chưa ở trạng thái đã chốt.',
  callerIsOperator: passed => passed ? 'Bạn đang đăng nhập bằng tài khoản người vận hành của Tour.' : 'Tài khoản đang đăng nhập không phải người vận hành được giao.',
  withinStartWindow: (passed, detail) => {
    const late = /Đã quá (\d+) phút/.exec(detail)?.[1]
    if (late) return `Đã quá ${late} phút sau giờ bắt đầu của Tour.`
    if (!passed) return 'Chưa tới giờ được bắt đầu.'
    return /sớm/.test(detail) ? 'Đang trong khung bắt đầu sớm.' : 'Đang trong khung giờ được bắt đầu.'
  },
  robotDispatchEnabled: passed => passed ? 'Robot được phép điều phối.' : 'Robot chưa được bật điều phối.',
  noOpenIncident: passed => passed ? 'Không có sự cố đang mở.' : 'Một Tour đang giữ robot cần hỗ trợ.',
  telemetryFresh: (passed, detail, now) => {
    if (passed) return 'Robot vừa báo trạng thái.'
    const when = ago(detail, now)
    return when ? `Robot báo lần cuối ${when}, đã quá lâu.` : 'Máy chủ chưa nhận được báo cáo nào từ robot.'
  },
  mapContextMatches: passed => passed ? 'Robot báo đúng bản đồ của tuyến.' : 'Robot báo đang dùng bản đồ khác bản đồ của tuyến.',
  executionIdle: passed => passed ? 'Robot đang rảnh.' : 'Robot đang làm việc khác, chưa rảnh.',
  operatorConsoleConnected: (passed, detail) => passed ? 'Đã kết nối.'
    : /chưa có người vận hành/i.test(detail) ? 'Tour chưa có người vận hành.'
    : /Chưa có nguồn/.test(detail) ? 'Máy chủ chưa theo dõi được kết nối này.'
    : 'Người vận hành chưa mở trang Staff, hoặc trang đã mất kết nối.',
  commandTransportEnabled: passed => passed ? 'Kênh lệnh robot đang bật.' : 'Máy chủ đang tắt kênh lệnh robot, nên chưa tạo được lệnh cho robot.',
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
  hasAcceptedRows: 'Không còn ai để chạy Tour cho. Bấm Hủy Tour ở cuối trang chuẩn bị Tour để trả robot và ca.',
  robotEligibleForRoute: 'Technical Staff kiểm tra robot với phiên bản tuyến.',
  robotMapMatchesRoute: 'Technical Staff gán đúng bản đồ của tuyến cho robot.',
  robotNotNeedsInspection: 'Kiểm tra robot tại chỗ rồi xác nhận ở Robot & thiết bị.',
  robotNotHeldByOtherTour: 'Chờ Tour đang giữ robot kết thúc.',
  noOpenIncident: 'Xử lý sự cố ở màn hình điều hành của Tour đang giữ robot.',
  noUnresolvedCommand: 'Đóng lệnh còn mở ở màn hình điều hành (Đối soát).',
  telemetryFresh: 'Bật robot và kiểm tra mạng của robot. Còn lỗi thì báo Kỹ thuật kiểm tra. Mục này tự đạt khi robot báo lại.',
  operatorConsoleConnected: 'Người vận hành mở trang Staff trên máy của mình và giữ trang mở.',
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
  CommandExpired: { label: 'Robot không lấy lệnh kịp', hint: 'Robot vẫn báo trạng thái nhưng không lấy lệnh trước thời hạn, nên lệnh đã hết hiệu lực và robot chưa nhận lệnh này.' },
  RobotDisconnected: { label: 'Mất kết nối robot', hint: 'Robot không lấy lệnh trước thời hạn và máy chủ không còn nhận báo cáo mới từ robot. Không coi là robot đã dừng: kiểm tra robot tại chỗ.' },
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
  STREAM_CHANGED: 'Robot đã khởi động lại kết nối sau khi lấy lệnh',
  LEG_ENDED: 'Chặng đã đóng nên lệnh này không còn cần',
  UNKNOWN_LEG: 'Robot không nhận ra chặng này',
  WITHDRAWN: 'Lệnh đã được rút trước khi robot lấy',
  // robot/ros2_ws/src/fleet_bridge/fleet_bridge/{commands,nav2,readiness}.py
  NAV2_CANCELED: 'Bộ điều hướng của robot đã hủy chặng',
  NAV2_ABORTED: 'Robot không tới được đích, bộ điều hướng dừng giữa chừng',
  NAV2_RESULT_UNKNOWN: 'Robot không rõ kết quả chặng',
  NAV2_REJECTED: 'Bộ điều hướng của robot từ chối chặng',
  NAV2_SEND_FAILED: 'Robot không chuyển được chặng tới bộ điều hướng',
  NOT_LOCALIZED: 'Robot chưa định vị',
  NOT_MOTION_READY: 'Robot chưa sẵn sàng di chuyển',
  LOCAL_LINK_LOSS: 'Robot mất kết nối với máy chủ nên tự dừng chặng',
}

/** What to say for a robot code nobody mapped: never the raw code. */
export const ROBOT_FAULT_FALLBACK = 'Robot báo lỗi kỹ thuật, báo Kỹ thuật kiểm tra'

/**
 * The robot's `faultCode` (ADR-0049 Decision 3, robot/ros2_ws/src/fleet_bridge/fleet_bridge/readiness.py and
 * goal_monitor.py), root cause first, in words an operator can act on.
 */
const ROBOT_FAULT: Record<string, string> = {
  ESTOP_ENGAGED: 'Nút dừng khẩn cấp trên robot đang bị nhấn',
  FOREIGN_NAV_GOAL: 'Robot đang nhận lệnh đi từ nơi khác ngoài hệ thống, báo Kỹ thuật kiểm tra',
  UNOWNED_GOAL_AT_STARTUP: 'Robot còn lệnh đi cũ từ trước khi khởi động lại, báo Kỹ thuật kiểm tra',
  MAP_CONTENT_MISMATCH: 'Bản đồ trên robot khác bản đồ đã duyệt, báo Kỹ thuật kiểm tra',
  MAP_EVIDENCE_MISSING: 'Robot chưa xác nhận được bản đồ đang dùng, báo Kỹ thuật kiểm tra',
  MOTION_GATE_DISABLED: 'Robot đang khóa di chuyển',
  STM32_LINK_STALE: 'Robot mất kết nối với bo mạch điều khiển động cơ, báo Kỹ thuật kiểm tra',
  NAV2_UNAVAILABLE: 'Bộ điều hướng của robot chưa chạy, báo Kỹ thuật kiểm tra',
  TF_STALE: 'Robot không cập nhật được vị trí của mình, báo Kỹ thuật kiểm tra',
  MOTION_GATE_LATCHED: 'Robot đã tự khóa di chuyển sau một lỗi, cần mở khóa tại chỗ',
}
export function robotFaultText(code: string | null | undefined): string | null {
  if (!code) return null
  return ROBOT_FAULT[code] ?? ROBOT_FAULT_FALLBACK
}
/** A robot or server reason code in words; an unlisted one is never shown raw. */
export function robotReasonText(code: string | null | undefined): string | null {
  if (!code) return null
  return ROBOT_REASON[code] ?? ROBOT_FAULT[code] ?? ROBOT_FAULT_FALLBACK
}
