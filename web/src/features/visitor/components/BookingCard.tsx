import { Link } from 'react-router'
import { CalendarDays, Clock, MapPin } from 'lucide-react'
import type { VisitorBooking } from '../../../api/contracts/visitor'
import { TOUR_TYPE_LABEL } from '../visitor-content'
import { formatDateLong, formatDuration } from '../visitor-format'
import { StatusBadge } from './StatusBadge'
import { RobotMark } from './RobotMark'

/**
 * One booking, as a padded `.vs-card` with the same hairline fact list the
 * landing page's overview section uses (`.lp-fact`), so a booking reads like the
 * rest of the product rather than like a receipt.
 *
 * A robot that has not been assigned yet says so. It is never filled in with a
 * placeholder name, because a visitor turning up at a meeting point needs the
 * difference between "Lotus-01" and "not assigned yet" to be real.
 */
export function BookingCard({
  booking,
  onCancel,
  cancelling = false,
}: {
  booking: VisitorBooking
  onCancel?: (booking: VisitorBooking) => void
  cancelling?: boolean
}) {
  const isUpcoming = booking.status === 'Confirmed'
  const destinations = booking.destinationNames.join(', ')

  return (
    <article className="vs-card vs-card--pad vs-booking" data-status={booking.status}>
      <div className="vs-row">
        <div className="vs-min">
          <h3 className="vs-card__title">{TOUR_TYPE_LABEL[booking.tourType]}</h3>
          <p className="vs-card__meta">Booking {booking.reference}</p>
        </div>
        <StatusBadge value={booking.status} />
      </div>

      <dl className="vs-facts" style={{ marginTop: 18 }}>
        <div className="vs-fact">
          <dt className="vs-fact__k">
            <CalendarDays size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
            Date
          </dt>
          <dd className="vs-fact__v">{formatDateLong(`${booking.date}T00:00:00`)}</dd>
        </div>
        <div className="vs-fact">
          <dt className="vs-fact__k">
            <Clock size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
            Time
          </dt>
          <dd className="vs-fact__v">
            {booking.time} · {formatDuration(booking.durationMinutes)}
          </dd>
        </div>
        <div className="vs-fact">
          <dt className="vs-fact__k">
            <MapPin size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
            Meeting point
          </dt>
          <dd className="vs-fact__v">{booking.meetingPointName}</dd>
        </div>
        {destinations && (
          <div className="vs-fact">
            <dt className="vs-fact__k">Destinations</dt>
            <dd className="vs-fact__v">{destinations}</dd>
          </div>
        )}
        <div className="vs-fact">
          <dt className="vs-fact__k">Robot</dt>
          <dd className="vs-fact__v">{booking.robotName ?? 'Not assigned yet'}</dd>
        </div>
      </dl>

      <div className="vs-card__foot">
        {booking.status === 'InProgress' && booking.sessionId && (
          <Link to="/visit/tour" className="lp-btn lp-btn--solid lp-btn--sm">
            <RobotMark size={15} />
            Open active tour
          </Link>
        )}
        {isUpcoming && onCancel && (
          <button
            type="button"
            className="lp-btn lp-btn--ghost lp-btn--sm"
            onClick={() => onCancel(booking)}
            disabled={cancelling}
            aria-busy={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Cancel booking'}
          </button>
        )}
        {(booking.status === 'Completed' || booking.status === 'Cancelled') && (
          <Link to="/visit/book" className="lp-btn lp-btn--ghost lp-btn--sm">
            Book again
          </Link>
        )}
      </div>
    </article>
  )
}
