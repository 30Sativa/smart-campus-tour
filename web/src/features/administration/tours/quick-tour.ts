import type { TourSummary } from './types'

export const MINUTE = 60_000

/** Which form "Tạo Tour" opens (ADR-0053): a Tour on a shift, or a quick Tour. */
export type TourKind = 'normal' | 'quick'
/** `?kind=`; `short`, the ADR-0050 name, still opens the quick form. */
export const tourKindOf = (value: string | null): TourKind | null =>
  value === 'normal' ? 'normal' : value === 'quick' || value === 'short' ? 'quick' : null

/** How long is left before a quick Tour's latest Start; display only, the server decides (ADR-0053). */
export function quickDeadlineLabel(tour: Pick<TourSummary, 'state' | 'scheduledStartAt'>, now: number): string | null {
  if (tour.state !== 'SCHEDULED' && tour.state !== 'READY') return null
  const left = new Date(tour.scheduledStartAt).getTime() - now
  if (left <= 0) return null
  const minutes = Math.ceil(left / MINUTE)
  return `Còn ${minutes >= 60 ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút` : `${minutes} phút`} để Start`
}
