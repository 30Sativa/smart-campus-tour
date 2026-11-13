import { formatDateTime } from '../../../components/ui/date-time'

/** Campus time, "13/11/2026 14:30". A list names the zone once at its top, not on every row. */
export const reviewTime = (value: string) => formatDateTime(value)

/** The tag a registration carries once its Tour is over, so a decision there reads as history; null while the Tour is live. */
export const endedTourLabel = (tourState: string | null | undefined) =>
  tourState === 'CANCELLED' ? 'Tour đã huỷ' : tourState === 'COMPLETED' ? 'Tour đã kết thúc' : null

/** T-24h (BR-05): an undecided row expires here. Display only; the server decides. */
export const pendingExpiresAt = (tourStart: string) => new Date(new Date(tourStart).getTime() - 24 * 3600_000).toISOString()

/** "Hết hạn lúc …" while that moment is still ahead; null once it has passed, when the line would read as a mistake. */
export const expiryLabel = (expiresAt: string, now: number) => new Date(expiresAt).getTime() > now ? `Hết hạn lúc ${reviewTime(expiresAt)}` : null

/** Calendar dates refer to Vietnam time; the server's upper boundary is exclusive. */
export function dateBoundary(day: string, end = false) {
  if (!day) return undefined
  const instant = new Date(`${day}T00:00:00+07:00`)
  if (!Number.isFinite(instant.getTime())) return undefined
  return new Date(instant.getTime() + (end ? 86400000 : 0)).toISOString()
}
