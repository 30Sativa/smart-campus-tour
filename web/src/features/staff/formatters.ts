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

/**
 * How long ago something happened, in the words an operator would use.
 *
 * Operational rows are read as "how long has this been wrong", not as a
 * timestamp, and a clock face makes the reader do that subtraction themselves.
 * `now` is a parameter so the caller can tick it and so this can be tested.
 */
export function formatElapsed(value?: string | null, now: number = Date.now()): string | null {
  if (!value) return null
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return null
  const minutes = Math.floor((now - then) / 60_000)
  if (minutes < 0) return null
  if (minutes < 1) return 'vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest === 0 ? `${hours} giờ trước` : `${hours} giờ ${rest} phút trước`
  return `${Math.floor(hours / 24)} ngày trước`
}

/** "còn 12 phút" for something that has not happened yet. Null once it has. */
export function formatCountdown(value?: string | null, now: number = Date.now()): string | null {
  if (!value) return null
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return null
  const minutes = Math.round((then - now) / 60_000)
  if (minutes <= 0) return null
  if (minutes < 60) return `còn ${minutes} phút`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `còn ${hours} giờ` : `còn ${hours} giờ ${rest} phút`
}
