/**
 * The one way the web app prints a date or time. Always campus time
 * (Asia/Ho_Chi_Minh), never the browser's zone or language, so a Staff laptop
 * set to another locale reads the same "13/11/2026 14:30" as everyone else.
 * The server stores instants; only these functions turn one into words.
 */

export const CAMPUS_TIME_ZONE = 'Asia/Ho_Chi_Minh'

export type DateValue = string | number | Date | null | undefined

const EMPTY = '-'

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAMPUS_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
})

const WEEKDAY_SHORT: Record<string, string> = { Sun: 'CN', Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7' }
const WEEKDAY_LONG: Record<string, string> = {
  Sun: 'Chủ nhật', Mon: 'Thứ hai', Tue: 'Thứ ba', Wed: 'Thứ tư', Thu: 'Thứ năm', Fri: 'Thứ sáu', Sat: 'Thứ bảy',
}

type CampusParts = { year: string; month: string; day: string; hour: string; minute: string; weekday: string }

function toDate(value: DateValue): Date | null {
  if (value == null || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function campusParts(value: DateValue): CampusParts | null {
  const date = toDate(value)
  if (!date) return null
  const parts = Object.fromEntries(partsFormat.formatToParts(date).map((part) => [part.type, part.value]))
  return parts as CampusParts
}

/** "13/11/2026 14:30". `-` when there is no value or it is not a date. */
export function formatDateTime(value: DateValue): string {
  const p = campusParts(value)
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : EMPTY
}

/**
 * "13/11/2026". `weekday: 'short'` gives "T6 13/11/2026", `'long'` gives
 * "Thứ sáu, 13/11/2026".
 */
export function formatDate(value: DateValue, options: { weekday?: 'short' | 'long' } = {}): string {
  const p = campusParts(value)
  if (!p) return EMPTY
  const day = `${p.day}/${p.month}/${p.year}`
  if (options.weekday === 'short') return `${WEEKDAY_SHORT[p.weekday]} ${day}`
  if (options.weekday === 'long') return `${WEEKDAY_LONG[p.weekday]}, ${day}`
  return day
}

/** "14:30", 24-hour. */
export function formatTime(value: DateValue): string {
  const p = campusParts(value)
  return p ? `${p.hour}:${p.minute}` : EMPTY
}

/**
 * How far away an instant is, in whole units: "vừa xong", "5 phút trước",
 * "16 giờ trước", "3 ngày trước", or "sau 12 phút" for the future. Past
 * 30 days it prints the date instead. `now` is a parameter so a caller can tick
 * it and a test can pin it.
 */
export function formatRelative(value: DateValue, now: number = Date.now()): string {
  const date = toDate(value)
  if (!date) return EMPTY
  const diffMinutes = Math.round((now - date.getTime()) / 60_000)
  const minutes = Math.abs(diffMinutes)
  if (minutes < 1) return 'vừa xong'
  const words = minutes < 60 ? `${minutes} phút`
    : minutes < 24 * 60 ? `${Math.floor(minutes / 60)} giờ`
      : minutes < 30 * 24 * 60 ? `${Math.floor(minutes / (24 * 60))} ngày`
        : null
  if (!words) return formatDate(date)
  return diffMinutes > 0 ? `${words} trước` : `sau ${words}`
}

/**
 * A length of time given in seconds: "45 giây", "12 phút", "1 giờ 10 phút",
 * "2 ngày 3 giờ". Two units at most, so a value like 59488.2 reads "16 giờ 31 phút".
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return EMPTY
  const total = Math.floor(seconds)
  if (total < 60) return `${total} giây`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours} giờ ${minutes % 60} phút` : `${hours} giờ`
  const days = Math.floor(hours / 24)
  return hours % 24 ? `${days} ngày ${hours % 24} giờ` : `${days} ngày`
}

/** The time between two instants, as `formatDuration`. `-` when either is missing or `to` is earlier. */
export function formatDurationBetween(from: DateValue, to: DateValue): string {
  const start = toDate(from)
  const end = toDate(to)
  if (!start || !end) return EMPTY
  return formatDuration((end.getTime() - start.getTime()) / 1000)
}

/** The campus calendar day of an instant as `yyyy-mm-dd`, the value a date field and the API's `from`/`to` use. */
export function campusDateKey(value: DateValue): string {
  const p = campusParts(value)
  return p ? `${p.year}-${p.month}-${p.day}` : ''
}

/* ── Typed dates (DateInput) ─────────────────────────────────────────────── */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `yyyy-mm-dd` -> `dd/mm/yyyy`; `''` for anything else. */
export function isoToDisplay(iso: string): string {
  const match = ISO_DATE.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

/** Typed text -> `yyyy-mm-dd`, or `''` when it is incomplete or not a calendar date (31/02/2026). */
export function parseDisplayDate(text: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim())
  if (!match) return ''
  const [, dd, mm, yyyy] = match
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  if (year < 1000 || month < 1 || month > 12 || day < 1) return ''
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth ? `${yyyy}-${mm}-${dd}` : ''
}

/** Digits only, at most eight, with the slashes put back: "1311" -> "13/11". A pasted `yyyy-mm-dd` is turned round. */
export function maskDateText(raw: string): string {
  const iso = isoToDisplay(raw.trim())
  if (iso) return iso
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}
