export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function formatTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

/** A robot that reports no battery reading shows "no data", never a made-up number. */
export function formatBattery(value?: number | null) {
  return value == null ? 'Không có dữ liệu' : `${value.toFixed(0)}%`
}
