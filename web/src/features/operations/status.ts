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

/** Severity order for sorting an alert list: the worst thing first. */
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
export const toneClass: Record<StatusTone, string> = {
  ok: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]',
  info: 'border-[#cfe1fb] bg-[#eef5ff] text-[#2f62b8]',
  warn: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]',
  danger: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]',
  muted: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]',
}
