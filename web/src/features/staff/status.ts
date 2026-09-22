/**
 * Backend status vocabulary, translated once.
 *
 * The API speaks English enums (`InProgress`, `Live`, `Critical`). Those stay in
 * the code, the contracts and the query filters; they must never reach a screen,
 * because half a Vietnamese sentence in English is not a design choice, it is an
 * untranslated string.
 *
 * Every status also carries a `tone`, and the tone table is the whole colour
 * system for operational state:
 *
 *   ok      khỏe mạnh, hoàn tất, trực tuyến
 *   info    đã lên lịch, đang chạy bình thường
 *   warn    cảnh báo, dữ liệu chậm, tạm dừng
 *   danger  nghiêm trọng, mất kết nối, thất bại
 *   muted   đang chờ, không xác định
 *
 * Colour is never the only carrier: `StatusBadge` prints the label and, for the
 * two tones that mean "act now", an icon as well.
 */
export type StatusTone = 'ok' | 'info' | 'warn' | 'danger' | 'muted'

type Entry = { label: string; tone: StatusTone }

/** Keyed by the enum value lowercased, so casing from the API never matters. */
const STATUS: Record<string, Entry> = {
  // Tour session / booking
  scheduled: { label: 'Đã lên lịch', tone: 'info' },
  pending: { label: 'Chờ điều phối', tone: 'muted' },
  inprogress: { label: 'Đang diễn ra', tone: 'info' },
  active: { label: 'Đang diễn ra', tone: 'info' },
  paused: { label: 'Tạm dừng', tone: 'warn' },
  completed: { label: 'Hoàn thành', tone: 'ok' },
  cancelled: { label: 'Đã hủy', tone: 'danger' },
  canceled: { label: 'Đã hủy', tone: 'danger' },
  confirmed: { label: 'Đã xác nhận', tone: 'ok' },
  upcoming: { label: 'Sắp tới', tone: 'info' },

  // TourState (remote-tour scope): Scheduled → Ready → Running → Completed | Cancelled
  ready: { label: 'Sẵn sàng', tone: 'ok' },
  running: { label: 'Đang chạy', tone: 'info' },

  // OperationalStatus, only while Running
  normal: { label: 'Bình thường', tone: 'ok' },
  needsassistance: { label: 'Cần hỗ trợ', tone: 'danger' },

  // Group registration (decided by Admin; Staff reads it)
  submitted: { label: 'Chờ duyệt', tone: 'warn' },
  approved: { label: 'Đã duyệt', tone: 'ok' },
  rejected: { label: 'Từ chối', tone: 'danger' },

  // Robot data source: anything not physical is labelled
  physical: { label: 'Robot thật', tone: 'info' },
  gazebo: { label: 'Gazebo', tone: 'muted' },
  emulator: { label: 'Emulator', tone: 'muted' },

  // Robot execution and the livestream
  stopped: { label: 'Đã dừng', tone: 'muted' },
  connecting: { label: 'Đang kết nối', tone: 'warn' },

  // Route stops
  current: { label: 'Hiện tại', tone: 'info' },
  skipped: { label: 'Bỏ qua', tone: 'muted' },

  // AMR connection
  live: { label: 'Trực tuyến', tone: 'ok' },
  stale: { label: 'Dữ liệu chậm', tone: 'warn' },
  disconnected: { label: 'Mất kết nối', tone: 'danger' },

  // AMR operational / mission
  navigating: { label: 'Đang di chuyển', tone: 'info' },
  idle: { label: 'Đang chờ', tone: 'muted' },
  charging: { label: 'Đang sạc', tone: 'info' },
  docked: { label: 'Đang ở trạm', tone: 'muted' },
  offline: { label: 'Ngoại tuyến', tone: 'danger' },
  fault: { label: 'Lỗi thiết bị', tone: 'danger' },
  error: { label: 'Lỗi', tone: 'danger' },
  emergency: { label: 'Khẩn cấp', tone: 'danger' },
  recall: { label: 'Đang gọi về', tone: 'warn' },
  maintenance: { label: 'Đang bảo trì', tone: 'warn' },

  // Alert severity
  critical: { label: 'Nghiêm trọng', tone: 'danger' },
  warning: { label: 'Cảnh báo', tone: 'warn' },
  information: { label: 'Thông tin', tone: 'info' },
  info: { label: 'Thông tin', tone: 'info' },

  // Booking lifecycle and sensor health, which share this vocabulary.
  closed: { label: 'Đã đóng', tone: 'muted' },
  healthy: { label: 'Bình thường', tone: 'ok' },
  degraded: { label: 'Suy giảm', tone: 'warn' },
  unknown: { label: 'Không rõ', tone: 'muted' },
}

/**
 * An unknown value is shown as it came rather than hidden behind "Không xác
 * định": a status this table has not learned yet is a gap to notice, not one to
 * paper over. It is toned `muted`, so it never borrows the authority of a
 * healthy or a critical state.
 */
export function statusInfo(value?: string | null): Entry {
  if (!value) return { label: 'Chưa xác định', tone: 'muted' }
  return STATUS[value.trim().toLowerCase()] ?? { label: value, tone: 'muted' }
}

export function statusLabel(value?: string | null): string {
  return statusInfo(value).label
}

/**
 * Event and alert *types*, which are a different vocabulary from status.
 *
 * `StaffAlert.type` and `TourTimelineEvent.type` are `string` in the contract, so
 * they were being passed through `statusLabel`, which has never held a type and
 * therefore echoed the raw `ObstacleDetected` / `AMRAssigned` back onto a
 * Vietnamese screen. They get their own table.
 *
 * Only the values the contract and its fixtures actually produce are listed. An
 * unlisted type still prints as it arrived, deliberately: an untranslated type
 * is a gap to notice when the backend lands, not something to hide behind a
 * guessed Vietnamese phrase.
 */
const EVENT_TYPES: Record<string, string> = {
  // Alert types
  obstacledetected: 'Phát hiện vật cản',
  lowbattery: 'Pin yếu',
  missionprogress: 'Tiến độ nhiệm vụ',
  // Tour timeline types
  tourscheduled: 'Đã tạo phiên tour',
  amrassigned: 'Đã gán AMR',
  waitingforassignment: 'Chờ điều phối AMR',
  missionstarted: 'Bắt đầu nhiệm vụ',
  // Assistance reasons (also the alert types administration reads)
  navigationfailed: 'Lỗi điều hướng',
  robotdisconnected: 'Mất kết nối robot',
  headfailure: 'Lỗi đầu xoay',
  streamunavailable: 'Mất nguồn livestream',
  commandunknown: 'Lệnh chưa rõ kết quả',
  backendrestarted: 'Backend khởi động lại',
  // Tour log (scope §4.4, §12)
  tourcreated: 'Tạo buổi',
  readyconfirmed: 'Admin chốt buổi',
  tourcancelled: 'Hủy buổi',
  tourstarted: 'Bắt đầu phiên',
  legsent: 'Gửi chặng',
  legsucceeded: 'Chặng thành công',
  legfailed: 'Chặng thất bại',
  visitopened: 'Mở lượt dừng',
  narrationstarted: 'Bắt đầu thuyết minh',
  headstep: 'Chuyển góc quan sát',
  holdset: 'Giữ tại POI',
  visitclosed: 'Đóng lượt dừng',
  commandsucceeded: 'Lệnh hoàn tất',
  commandfailed: 'Lệnh thất bại',
  assistancerequired: 'Cần hỗ trợ',
  recovered: 'Phục hồi',
  streamlost: 'Mất nguồn hình',
  streamrestored: 'Nguồn hình trở lại',
  heldatpoi: 'Đứng giữ tại POI',
  heldatend: 'Đứng giữ tại điểm cuối',
  cancelsent: 'Gửi yêu cầu hủy',
  tourcompleted: 'Hoàn thành',
  tourendedearly: 'Kết thúc sớm',
  robotreleased: 'Giải phóng robot',
}

export function eventTypeLabel(value?: string | null): string {
  if (!value) return 'Không rõ'
  return EVENT_TYPES[value.trim().toLowerCase()] ?? value
}

/** Severity order for sorting an alert list: the worst thing first. */
/** Where a running Tour is inside its flow, in the operator's words. */
export const STEP_LABEL: Record<string, string> = {
  PreparingStart: 'Chuẩn bị chặng đầu (quay FRONT)',
  Navigating: 'Đang di chuyển tới POI',
  PreparingView: 'Chuẩn bị góc quan sát',
  Observing: 'Đang quan sát & thuyết minh',
  HeldAtPoi: 'Đứng giữ tại POI',
  ReturningFront: 'Quay FRONT trước chặng kế',
  ReturningToEnd: 'Về điểm kết thúc',
  Finished: 'Đã kết thúc',
}

export function stepLabel(value?: string | null): string {
  if (!value) return '-'
  return STEP_LABEL[value] ?? value
}

/** Head presets. Rotating the camera head never turns the body marker. */
export const HEAD_LABEL: Record<string, string> = { FRONT: 'Phía trước', LEFT: 'Bên trái', RIGHT: 'Bên phải' }

/** Start checks, by the id the server evaluates. */
export const START_CHECK_LABEL: Record<string, string> = {
  groupsApproved: 'Có đoàn đã được duyệt',
  robotConnected: 'Robot đang kết nối',
  robotLocalized: 'Robot đã định vị',
  robotFree: 'Robot không phục vụ buổi khác',
  headAtFront: 'Đầu xoay ở FRONT',
  batteryMeasured: 'Nguồn / pin',
  streamLive: 'Nguồn livestream có tín hiệu',
}

export function severityRank(value?: string | null): number {
  switch (value?.trim().toLowerCase()) {
    case 'critical':
      return 0
    case 'warning':
      return 1
    default:
      return 2
  }
}

/**
 * The one tone table. Every operational colour in the staff area resolves here,
 * so a status can never be given a colour that disagrees with its meaning.
 * It lives beside the tones rather than in the component file, which keeps that
 * file exporting components only.
 */
/** Solid dot per tone; the one place a tone becomes a fill colour. */
export const dotClass: Record<StatusTone, string> = {
  ok: 'bg-[#2f8f6b]',
  info: 'bg-[#5b91ed]',
  warn: 'bg-[#d69412]',
  danger: 'bg-[#c9534a]',
  muted: 'bg-[#a8b6c9]',
}

export const toneClass: Record<StatusTone, string> = {
  ok: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]',
  info: 'border-[#cfe1fb] bg-[#eef5ff] text-[#2f62b8]',
  warn: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]',
  danger: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]',
  muted: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]',
}
