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

/** "1:05:12" / "12:07" for an elapsed stopwatch, from two instants. */
export function formatStopwatch(from?: string | null, now: number = Date.now()): string {
  if (!from) return '—'
  const total = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000))
  const hours = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`
}

/** "45 phút" / "1 giờ 10 phút" between two instants. */
export function formatDuration(from?: string | null, to?: string | null): string {
  if (!from || !to) return '—'
  const minutes = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} phút`
  const rest = minutes % 60
  return rest === 0 ? `${Math.floor(minutes / 60)} giờ` : `${Math.floor(minutes / 60)} giờ ${rest} phút`
}

/** Heartbeat freshness: seconds while fresh, then the usual relative time. */
export function formatHeartbeat(ageSeconds?: number | null, lastSeenAt?: string | null, now: number = Date.now()): string {
  if (ageSeconds == null) return 'Không có dữ liệu'
  if (ageSeconds < 60) return ageSeconds <= 2 ? 'vừa xong' : `${ageSeconds} giây trước`
  return formatElapsed(lastSeenAt, now) ?? 'Không có dữ liệu'
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

/** m/s, one decimal; a robot that sends no speed gets no number. */
export function formatSpeed(value?: number | null) {
  return value == null ? 'Không có dữ liệu' : `${value.toFixed(1)} m/s`
}

/** "32 khách" or "31/32 khách" once the head count is confirmed. */
export function visitorLabel(tour: { visitorCount: number; confirmedVisitorCount?: number | null }) {
  return tour.confirmedVisitorCount != null ? `${tour.confirmedVisitorCount}/${tour.visitorCount} khách` : `${tour.visitorCount} khách`
}
