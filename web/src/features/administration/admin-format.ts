/** Date helpers for administration. Local campus time; the server stores instants. */

const pad = (value: number) => String(value).padStart(2, '0')

/** `dd/mm/yyyy hh:mm`, the one timestamp format admin screens print. */
export function formatStamp(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return '-'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** A Tour's slot: "T2 21/09/2026 14:30". */
export function formatSlot(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return '-'
  return `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Weekday and day: "T3 22/09", for a row that already shows the time. */
export function formatShortDay(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return '-'
  return `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/** `yyyy-mm-dd` of a local date. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type DateRangeKey = 'all' | 'today' | 'week' | 'custom'

/** Today, or Monday–Sunday of this week, as the API's inclusive `from`/`to`. */
export function rangeFor(key: DateRangeKey, now: Date = new Date(), custom: { from?: string; to?: string } = {}): { from?: string; to?: string } {
  if (key === 'today') return { from: dayKey(now), to: dayKey(now) }
  if (key === 'week') {
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: dayKey(monday), to: dayKey(sunday) }
  }
  if (key === 'custom') return { from: custom.from || undefined, to: custom.to || undefined }
  return {}
}

/** ISO instant → value for `<input type="datetime-local">`. */
export function toLocalInput(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `<input type="datetime-local">` value → ISO instant, or '' when empty/invalid. */
export function fromLocalInput(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString() : ''
}

/** "sau 3 giờ", "sau 2 ngày", "đã qua" - how far away a Tour is. */
export function untilText(value: string, now: number = Date.now()): string {
  const minutes = Math.round((new Date(value).getTime() - now) / 60_000)
  if (minutes < 0) return 'đã qua giờ dự kiến'
  if (minutes < 60) return `sau ${minutes} phút`
  if (minutes < 60 * 24) return `sau ${Math.round(minutes / 60)} giờ`
  return `sau ${Math.round(minutes / (60 * 24))} ngày`
}
