import { Navigate, useParams } from 'react-router'
import { LoadingPanel } from '../../components/ui/ConsolePrimitives'
import { useOperationTour } from '../../features/staff/operations/hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'

/**
 * `/staff/tours/:id` opens the screen that fits the Tour now: preparation until
 * it is READY, the pre-start check while READY, the operations console once it
 * has started. There is no Tour event-log read API yet, so no log page of its own.
 */
export default function TourDetailPage() {
  const { tourId = '' } = useParams()
  const tour = useOperationTour(tourId)
  if (tour.isPending) return <StaffPage><LoadingPanel /></StaffPage>
  if (tour.isError) return <StaffPage><ErrorPanel error={tour.error} onRetry={() => void tour.refetch()} /></StaffPage>
  const { tour: summary, startedAt } = tour.data
  const to = summary.state === 'READY' ? `/staff/tours/${summary.id}/start`
    : summary.state === 'RUNNING' || startedAt ? `/staff/live/${summary.id}`
    : `/staff/manage/tours/${summary.id}`
  return <Navigate to={to} replace />
}
