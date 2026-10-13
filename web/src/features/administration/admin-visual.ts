import type { TourState } from '../../api/contracts/admin'

/** Colours of the Tour states on the dashboard, the Tour tabs and the cards (the badges' tones, as solid colours). */
export const TOUR_COLOR: Record<TourState, string> = {
  Scheduled: '#d97706',
  Ready: '#16a34a',
  Running: '#2563eb',
  Completed: '#64748b',
  Cancelled: '#dc2626',
}

/** The flat white card of the dashboard-style admin pages. */
export const cardClass = 'min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05),0_0_0_1px_rgba(16,24,40,0.05)]'
