import type { TourSummary } from '../../administration/tours/types'

/** The one next step for a Tour, by its state. The page it opens says what the server allows. */
export function nextStep(tour: Pick<TourSummary, 'id' | 'state'>): { to: string; label: string } {
  switch (tour.state) {
    case 'SCHEDULED': return { to: `/staff/manage/tours/${tour.id}`, label: 'Chuẩn bị và chốt' }
    case 'READY': return { to: `/staff/tours/${tour.id}/start`, label: 'Mở Tour' }
    case 'RUNNING': return { to: `/staff/live/${tour.id}`, label: 'Mở điều hành' }
    // An ended Tour opens what fits it: the console if it ran (its end and any command left to reconcile), else preparation.
    default: return { to: `/staff/tours/${tour.id}`, label: 'Xem Tour' }
  }
}
