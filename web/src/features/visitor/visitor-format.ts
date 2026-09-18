/**
 * Display formatting for the visitor app.
 *
 * Same job as `features/operations/formatters.ts`, one difference: the locale is
 * `en-GB` rather than `vi-VN`, because this surface is English. The rule that
 * matters is shared with that file and with the operations dashboard — a missing
 * reading prints as missing. Nothing here invents a value the API did not send.
 */
const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const DATE_LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

export function formatDate(value?: string | null): string {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : DATE.format(date)
}

export function formatDateLong(value?: string | null): string {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : DATE_LONG.format(date)
}

export function formatTime(value?: string | null): string {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : TIME.format(date)
}

/** A robot that reports no battery shows "No reading", never a made-up number. */
export function formatBattery(value?: number | null): string {
  return value == null ? 'No reading' : `${Math.round(value)}%`
}

/** Metres under a kilometre, one decimal above it. */
export function formatDistance(value?: number | null): string {
  if (value == null) return 'Distance unknown'
  if (value === 0) return 'You are here'
  return value < 1000 ? `${Math.round(value)} m away` : `${(value / 1000).toFixed(1)} km away`
}

export function formatWalk(value?: number | null): string {
  if (value == null) return ''
  if (value === 0) return 'At this spot'
  return `${Math.round(value)} min walk`
}

export function formatDuration(minutes?: number | null): string {
  if (minutes == null) return 'Duration unknown'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/**
 * "3 minutes ago", down to the minute, then to the day. Used on notifications,
 * where the exact timestamp matters less than how fresh the item is; the full
 * date is still in the `title` attribute at every call site.
 */
export function formatRelative(value?: string | null): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.round((Date.now() - then) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

/**
 * A `YYYY-MM-DD` date plus an `HH:mm` time, as one line. The API sends them
 * apart because a booking is made against a slot grid, not against an instant.
 */
export function formatSlot(date: string, time: string): string {
  return `${formatDate(`${date}T00:00:00`)} at ${time}`
}

/** Two initials for the avatar, from whatever name the profile holds. */
export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2)
  return `${parts[0][0]}${parts[parts.length - 1][0]}`
}

/** Battery tone for the meter. Thresholds are display-only, not a business rule. */
export function batteryTone(value?: number | null): 'ok' | 'warn' | 'danger' | undefined {
  if (value == null) return undefined
  if (value <= 15) return 'danger'
  if (value <= 35) return 'warn'
  return 'ok'
}
