import { Link } from 'react-router'
import { ArrowRight, Calendar, Clock, Compass, Map, MapPin, MessageCircle } from 'lucide-react'
import { useAuthStore } from '../../stores/auth-store'
import { RobotMark } from '../../features/visitor/components/RobotMark'
import { LocationCard } from '../../features/visitor/components/LocationCard'
import { StatusBadge } from '../../features/visitor/components/StatusBadge'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../features/visitor/components/States'
import { useActiveTour, useCampusLocations, useMyBookings, useVisitorProfile } from '../../features/visitor/visitor-hooks'
import { formatDate, formatDuration } from '../../features/visitor/visitor-format'

/**
 * Home for a signed-in visitor.
 *
 * It opens on the same thing the landing page opens on: the campus footage, a
 * short claim, two actions. Same scrim recipe, same white copy, same pill
 * buttons, one third of the height — because the landing hero's job is to make
 * someone stay and this one's job is to greet them and get out of the way.
 *
 * Under it, in order of how urgent each thing is: a tour that is running right
 * now, the four things a visitor does here, the next booking, and a few places
 * to look at.
 */
const QUICK_ACTIONS = [
  { to: '/visit/explore', label: 'Explore campus', text: 'Browse buildings, labs, food and student services.', icon: Compass },
  { to: '/visit/map', label: 'Campus map', text: 'See where you are and how to get where you are going.', icon: Map },
  { to: '/visit/book', label: 'Book a robot', text: 'Pick a date, a time and a meeting point.', icon: Calendar },
  { to: '/visit/assistant', label: 'Ask the robot', text: 'Ask anything about the campus and get directions.', icon: MessageCircle },
]

export default function VisitorHomePage() {
  const user = useAuthStore((state) => state.user)
  const { data: profile } = useVisitorProfile()
  const { data: activeTour } = useActiveTour()
  const bookings = useMyBookings()
  const locations = useCampusLocations()

  const firstName = (profile?.fullName ?? user?.username ?? 'there').split(' ')[0]

  const nextBooking = bookings.data
    ?.filter((booking) => booking.status === 'Confirmed')
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0]

  const featured = locations.data?.slice(0, 3) ?? []

  return (
    <>
      <section className="vs-hero">
        <div className="vs-hero__media">
          <img src="/images/hero-campus.jpg" alt="" fetchPriority="high" />
        </div>
        <div className="vs-hero__scrim" aria-hidden="true" />

        <div className="vs-hero__body">
          <div className="vs-hero__copy">
            <p className="vs-hero__eyebrow">Campus tour</p>
            <h1 className="vs-hero__title">Welcome back, {firstName}</h1>
            <p className="vs-hero__lead">
              Where would you like to explore today? Discover campus locations, or start a guided
              tour with a Smart Campus robot.
            </p>
            <div className="vs-hero__cta">
              <Link to="/visit/explore" className="lp-btn lp-btn--solid lp-btn--lg">
                Explore campus
                <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
              </Link>
              <Link to="/visit/book" className="lp-btn lp-btn--onmedia">
                Book a robot
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="vs-page vs-stack vs-stack--editorial">
        {activeTour && (
          <section aria-label="Tour in progress" data-visitor-reveal>
            <div className="vs-live">
              <span className="vs-live__mark">
                <RobotMark size={24} />
              </span>
              <div className="vs-live__body">
                <p className="vs-live__title">
                  <span className="vs-live__dot" aria-hidden="true" />
                  {activeTour.robotName} is with you right now
                </p>
                <p className="vs-live__text">
                  At {activeTour.currentLocationName}
                  {activeTour.nextDestinationName ? `, heading to ${activeTour.nextDestinationName}` : ''}
                  {activeTour.etaMinutes != null ? ` · about ${activeTour.etaMinutes} min` : ''}
                </p>
              </div>
              <StatusBadge value={activeTour.robotState} />
              <Link to="/visit/tour" className="lp-btn lp-btn--solid lp-btn--sm">
                Open tour
                <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>
          </section>
        )}

        <section aria-labelledby="quick-actions" data-visitor-reveal>
          <div className="vs-open">
            <div className="vs-open__text">
              <p className="vs-eyebrow">Get started</p>
              <h2 className="vs-open__title" id="quick-actions">
                What would you like to do?
              </h2>
            </div>
            <p className="vs-open__lead">
              Four ways into the campus. Browse it yourself, or let a robot walk you there.
            </p>
          </div>

          <ol className="vs-actions">
            {QUICK_ACTIONS.map(({ to, label, text, icon: Icon }, index) => (
              <li key={to} className="vs-action">
                <Link to={to} className="vs-card__hit" aria-label={label} />
                <span className="vs-action__n" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="vs-action__body">
                  <span className="vs-choice__icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.9} />
                  </span>
                  <div className="vs-min">
                    <h3 className="vs-action__title">{label}</h3>
                    <p className="vs-action__text">{text}</p>
                  </div>
                </div>
                <span className="vs-action__go" aria-hidden="true">
                  <ArrowRight size={19} strokeWidth={2} />
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="next-visit" data-visitor-reveal>
          <div className="vs-open">
            <div className="vs-open__text">
              <p className="vs-eyebrow">Coming up</p>
              <h2 className="vs-open__title" id="next-visit">
                Your next visit
              </h2>
            </div>
            <Link to="/visit/bookings" className="lp-btn lp-btn--ghost lp-btn--sm">
              All bookings
            </Link>
          </div>

          {bookings.isPending ? (
            <LoadingSkeleton rows={1} />
          ) : bookings.isError ? (
            <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
          ) : nextBooking ? (
            <div className="vs-card vs-card--pad vs-upcoming">
              <div className="vs-date-tile" aria-hidden="true"><span>{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${nextBooking.date}T00:00:00`))}</span><strong>{new Date(`${nextBooking.date}T00:00:00`).getDate()}</strong></div>
              <div className="vs-min vs-upcoming__body">
                <p className="vs-eyebrow">Your next campus adventure</p>
                <h3 className="vs-card__title">{formatDate(`${nextBooking.date}T00:00:00`)}</h3>
                <p className="vs-card__meta"><Clock size={14} className="vs-ico" aria-hidden="true" />{nextBooking.time} · {formatDuration(nextBooking.durationMinutes)}</p>
                <p className="vs-card__meta"><MapPin size={14} className="vs-ico" aria-hidden="true" />{nextBooking.meetingPointName}</p>
                <p className="vs-card__meta">{nextBooking.robotName || 'We will show your robot here when assigned.'}</p>
              </div>
              <div className="vs-upcoming__actions">
                <StatusBadge value={nextBooking.status} />
                <Link to="/visit/bookings" className="lp-btn lp-btn--ghost lp-btn--sm">
                  Manage booking <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No tour booked yet"
              text="Pick a date, a time and a meeting point, and a robot will be waiting for you."
              icon={<RobotMark size={24} />}
              actions={
                <Link to="/visit/book" className="lp-btn lp-btn--solid lp-btn--sm">
                  Book a robot
                </Link>
              }
            />
          )}
        </section>

        <section aria-labelledby="worth-a-look" data-visitor-reveal>
          <div className="vs-open">
            <div className="vs-open__text">
              <p className="vs-eyebrow">Around campus</p>
              <h2 className="vs-open__title" id="worth-a-look">
                Worth a look
              </h2>
            </div>
            <Link to="/visit/explore" className="lp-btn lp-btn--ghost lp-btn--sm">
              Explore all
            </Link>
          </div>

          {locations.isPending ? (
            <LoadingSkeleton rows={3} media />
          ) : locations.isError ? (
            <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
          ) : featured.length === 0 ? (
            <EmptyState title="New places are on the way" text="Campus destinations will appear here as they are published." />
          ) : (
            <div className="vs-grid vs-grid--3">
              {featured.map((location) => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
