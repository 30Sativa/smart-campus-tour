import { Link } from 'react-router'
import { Route, Star } from 'lucide-react'
import type { VisitorTour } from '../../../api/contracts/visitor'
import { formatDateLong, formatTime } from '../visitor-format'
import { StatusBadge } from './StatusBadge'

/**
 * One finished tour: where it went, when, and how far.
 *
 * The stops are the timeline component rather than a comma list, because the
 * order is the point — and a stop the robot never reached stays visibly
 * unreached instead of being dropped from the list.
 */
export function TourCard({ tour }: { tour: VisitorTour }) {
  const reached = tour.stops.filter((stop) => stop.arrivedAt).length

  return (
    <article className="vs-card vs-card--pad">
      <div className="vs-row">
        <div className="vs-min">
          <h3 className="vs-card__title">{tour.routeName}</h3>
          <p className="vs-card__meta">
            {formatDateLong(tour.startedAt)} · {formatTime(tour.startedAt)}
            {tour.endedAt ? ` to ${formatTime(tour.endedAt)}` : ''}
          </p>
        </div>
        <StatusBadge value={tour.status} />
      </div>

      <p className="vs-card__text">
        <Route size={14} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
        {reached} of {tour.stops.length} stops
        {tour.distanceMeters != null ? ` · ${(tour.distanceMeters / 1000).toFixed(1)} km walked` : ''}
        {tour.robotName ? ` · with ${tour.robotName}` : ''}
      </p>

      <details className="vs-tour-details">
      <summary>View {tour.stops.length} stops on this tour</summary>
      <ol className="vs-timeline" style={{ marginTop: 18 }}>
        {tour.stops.map((stop, index) => (
          <li key={stop.locationId} className="vs-tl" data-state={stop.arrivedAt ? 'done' : 'todo'}>
            <span className="vs-tl__mark">{index + 1}</span>
            <div className="vs-min">
              <p className="vs-tl__name">{stop.name}</p>
              <p className="vs-tl__meta">{stop.arrivedAt ? formatTime(stop.arrivedAt) : 'Not reached'}</p>
            </div>
          </li>
        ))}
      </ol>
      </details>

      <div className="vs-card__foot">
        {tour.rating != null ? (
          <span className="vs-badge vs-badge--ok">
            <Star size={12} strokeWidth={2.2} aria-hidden="true" />
            You rated this {tour.rating} out of 5
          </span>
        ) : (
          <span className="vs-badge">Not rated</span>
        )}
        <Link to="/visit/book" className="lp-btn lp-btn--ghost lp-btn--sm">
          Take this tour again
        </Link>
      </div>
    </article>
  )
}
