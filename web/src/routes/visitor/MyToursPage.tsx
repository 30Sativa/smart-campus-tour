import { Link } from 'react-router'
import { ArrowRight, Route } from 'lucide-react'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { TourCard } from '../../features/visitor/components/TourCard'
import { RobotMark } from '../../features/visitor/components/RobotMark'
import { StatusBadge } from '../../features/visitor/components/StatusBadge'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../features/visitor/components/States'
import { useActiveTour, useMyTours } from '../../features/visitor/visitor-hooks'

/**
 * Where a visitor has been, and where they are right now.
 *
 * A running tour is pulled to the top as its own strip rather than mixed into the
 * history, because it is the only row on this page that is still changing.
 */
export default function MyToursPage() {
  const tours = useMyTours()
  const { data: activeTour } = useActiveTour()

  return (
    <div className="vs-page vs-stack vs-stack--editorial">
      <PageHeader
        eyebrow="My tours"
        title="My tours"
        description="Every tour you have walked with a robot, the stops it made and how far you went."
        actions={
          <Link to="/visit/book" className="lp-btn lp-btn--solid lp-btn--sm">
            Book another tour
          </Link>
        }
      />

      {activeTour && (
        <div className="vs-live">
          <span className="vs-live__mark">
            <RobotMark size={24} />
          </span>
          <div className="vs-live__body">
            <p className="vs-live__title">A tour is running now</p>
            <p className="vs-live__text">
              {activeTour.robotName} is at {activeTour.currentLocationName}
              {activeTour.nextDestinationName ? `, heading to ${activeTour.nextDestinationName}` : ''}.
            </p>
          </div>
          <StatusBadge value={activeTour.robotState} />
          <Link to="/visit/tour" className="lp-btn lp-btn--solid lp-btn--sm">
            Open tour
            <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      )}

      <section aria-label="Tour history" data-visitor-reveal>
        {tours.isPending ? (
          <LoadingSkeleton rows={2} />
        ) : tours.isError ? (
          <ErrorState error={tours.error} onRetry={() => void tours.refetch()} />
        ) : tours.data.length === 0 ? (
          <EmptyState
            title="No tours yet"
            text="Book a robot and your first walk around campus will show up here, stop by stop."
            icon={<Route size={22} strokeWidth={1.9} aria-hidden="true" />}
            actions={
              <Link to="/visit/book" className="lp-btn lp-btn--solid lp-btn--sm">
                Book a robot
              </Link>
            }
          />
        ) : (
          <div className="vs-grid vs-grid--2">
            {tours.data.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
