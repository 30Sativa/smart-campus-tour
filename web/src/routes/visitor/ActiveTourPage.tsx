import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BatteryMedium, Clock, MapPin, MessageCircle, Pause, Play, Square } from 'lucide-react'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { CampusMap, MapLegend } from '../../features/visitor/components/CampusMap'
import { CORRIDOR } from '../../features/visitor/campus-floorplan'
import { RobotMark } from '../../features/visitor/components/RobotMark'
import { StatusBadge } from '../../features/visitor/components/StatusBadge'
import { EmptyState, ErrorState, LoadingPanel } from '../../features/visitor/components/States'
import { useActiveTour, useTourCommand } from '../../features/visitor/visitor-hooks'
import { batteryTone, formatBattery, formatTime } from '../../features/visitor/visitor-format'
import { ConfirmDialog } from '../../features/visitor/components/ConfirmDialog'
import type { TourCommand } from '../../api/contracts/visitor'

/**
 * The screen a visitor has open while the robot is walking with them.
 *
 * What it shows is what somebody standing next to a robot needs: which robot,
 * what it is doing, where it is, where it is going next and roughly when. What it
 * deliberately does NOT show is the transport layer — no IP address, no SignalR
 * connection id, no socket state, no device id. Those belong to the operations
 * console, and putting them here would mean a visitor reading an error they can do
 * nothing about (web/AGENTS.md §3).
 *
 * The battery is a reading, not a promise: a robot that reports nothing says
 * "No reading" rather than showing a made-up percentage.
 */
export default function ActiveTourPage() {
  const navigate = useNavigate()
  const tour = useActiveTour()
  const command = useTourCommand()
  const [confirmation, setConfirmation] = useState<TourCommand | null>(null)
  const [notice, setNotice] = useState('')

  if (tour.isPending) {
    return (
      <div className="vs-page">
        <LoadingPanel minHeight={420} />
      </div>
    )
  }

  if (tour.isError) {
    return (
      <div className="vs-page">
        <ErrorState error={tour.error} onRetry={() => void tour.refetch()} />
      </div>
    )
  }

  if (!tour.data) {
    return (
      <div className="vs-page vs-stack">
        <PageHeader eyebrow="Active tour" title="No tour running" />
        <EmptyState
          title="No robot is with you right now"
          text="When a tour starts, this screen shows where your robot is, where it is going next and how long that takes."
          icon={<RobotMark size={24} />}
          actions={
            <>
              <Link to="/visit/book" className="lp-btn lp-btn--solid lp-btn--sm">
                Book a robot
              </Link>
              <Link to="/visit/bookings" className="lp-btn lp-btn--ghost lp-btn--sm">
                My bookings
              </Link>
            </>
          }
        />
      </div>
    )
  }

  const active = tour.data
  const paused = active.robotState === 'Paused'
  const busy = command.isPending

  const run = (next: 'pause' | 'resume' | 'end') => {
    command.mutate(
      { sessionId: active.sessionId, command: next },
      { onSuccess: (result) => { setConfirmation(null); setNotice(next === 'pause' ? 'Tour paused. Resume when you are ready.' : 'Tour resumed. Your robot is ready to continue.'); if (!result) navigate('/visit/tours') } },
    )
  }

  return (
    <div className="vs-page vs-stack">
      <PageHeader
        eyebrow="Active tour"
        title={`${active.robotName} is with you`}
        description={`Booking ${active.bookingReference}. Keep this open and the robot will tell you what is next.`}
        actions={
          <Link to="/visit/assistant" className="lp-btn lp-btn--ghost lp-btn--sm">
            <MessageCircle size={15} strokeWidth={2} aria-hidden="true" />
            Ask the robot
          </Link>
        }
      />
      {notice && <p role="status" className="vs-feedback">{notice}</p>}

      <div className="vs-split" data-visitor-reveal>
        <CampusMap
          pins={[
            ...active.stops.map((stop) => ({
              id: stop.locationId,
              name: stop.name,
              x: stop.mapX,
              y: stop.mapY,
              role: stop.isCurrent ? ('destination' as const) : ('place' as const),
            })),
            { id: 'robot', name: active.robotName, x: active.robotMapX, y: active.robotMapY, role: 'robot' as const },
          ]}
          /* The circulation ring, which is the path the robot actually takes.
             Joining the stops directly would draw a line straight through the
             atrium and through several walls. */
          route={[...CORRIDOR, CORRIDOR[0]]}
          note="Campus plan preview. The robot's position updates as it moves."
        >
          <MapLegend />
        </CampusMap>

        <aside className="vs-rail">
          <div className="vs-card vs-card--pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="vs-live__mark" aria-hidden="true">
                <RobotMark size={24} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 className="vs-h3">{active.robotName}</h2>
                <p className="vs-card__meta">Your robot</p>
              </div>
              <StatusBadge value={active.robotState} />
            </div>

            <dl className="vs-facts" style={{ marginTop: 18 }}>
              <div className="vs-fact">
                <dt className="vs-fact__k">
                  <MapPin size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                  Right now
                </dt>
                <dd className="vs-fact__v">{active.currentLocationName}</dd>
              </div>
              <div className="vs-fact">
                <dt className="vs-fact__k">Next stop</dt>
                <dd className="vs-fact__v">{active.nextDestinationName ?? 'Last stop of the tour'}</dd>
              </div>
              <div className="vs-fact">
                <dt className="vs-fact__k">
                  <Clock size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                  Arriving in
                </dt>
                <dd className="vs-fact__v">{active.etaMinutes != null ? `About ${active.etaMinutes} min` : 'Not available'}</dd>
              </div>
              <div className="vs-fact">
                <dt className="vs-fact__k">
                  <BatteryMedium size={13} strokeWidth={1.9} aria-hidden="true" className="vs-ico" />
                  Battery
                </dt>
                <dd className="vs-fact__v">{formatBattery(active.batteryPercent)}</dd>
              </div>
            </dl>

            {active.batteryPercent != null && (
              <div className="vs-meter" style={{ marginTop: 14 }} role="meter" aria-label="Robot battery" aria-valuenow={active.batteryPercent} aria-valuemin={0} aria-valuemax={100}>
                <div className="vs-meter__fill" data-tone={batteryTone(active.batteryPercent)} style={{ transform: `scaleX(${Math.max(0, Math.min(100, active.batteryPercent)) / 100})` }} />
              </div>
            )}

            <p className="vs-card__meta" style={{ marginTop: 18 }}>
              Tour progress · {active.progressPercent}%
            </p>
            <div className="vs-meter" style={{ marginTop: 8 }} role="progressbar" aria-label="Tour progress" aria-valuenow={active.progressPercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="vs-meter__fill" style={{ transform: `scaleX(${Math.max(0, Math.min(100, active.progressPercent)) / 100})` }} />
            </div>

            <div className="vs-card__foot">
              <button
                type="button"
                className="lp-btn lp-btn--ghost lp-btn--sm"
                onClick={() => { command.reset(); setConfirmation(paused ? 'resume' : 'pause') }}
                disabled={busy}
                aria-busy={busy}
              >
                {paused ? <Play size={15} strokeWidth={2} aria-hidden="true" /> : <Pause size={15} strokeWidth={2} aria-hidden="true" />}
                {paused ? 'Resume tour' : 'Pause tour'}
              </button>
              <Link to="/visit/map" className="lp-btn lp-btn--ghost lp-btn--sm">
                Explore the map
              </Link>
              <button
                type="button"
                className="lp-btn lp-btn--ghost lp-btn--sm"
                onClick={() => { command.reset(); setConfirmation('end') }}
                disabled={busy}
                aria-busy={busy}
              >
                <Square size={14} strokeWidth={2} aria-hidden="true" />
                End tour
              </button>
            </div>

            {command.isError && (
              <div className="auth-alert" role="alert" style={{ marginTop: 16 }}>
                The robot did not pick that up. Try again in a moment.
              </div>
            )}
          </div>

          <div className="vs-card vs-card--pad">
            <h2 className="vs-h3">Stops on this tour</h2>
            <ol className="vs-timeline" style={{ marginTop: 16 }}>
              {active.stops.map((stop, index) => (
                <li
                  key={stop.locationId}
                  className="vs-tl"
                  data-state={stop.isCurrent ? 'current' : stop.arrivedAt ? 'done' : 'todo'}
                >
                  <span className="vs-tl__mark">{index + 1}</span>
                  <div className="vs-min">
                    <p className="vs-tl__name">{stop.name}</p>
                    <p className="vs-tl__meta">
                      {stop.isCurrent ? 'You are here' : stop.arrivedAt ? formatTime(stop.arrivedAt) : 'Still to come'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
      <ConfirmDialog open={confirmation !== null} title={confirmation === 'end' ? 'End your tour?' : confirmation === 'pause' ? 'Pause your tour?' : 'Resume your tour?'}
        confirmLabel={confirmation === 'end' ? 'End tour' : confirmation === 'pause' ? 'Pause tour' : 'Resume tour'} pending={busy}
        error={command.isError ? 'Your robot did not receive the request. Please try again.' : undefined}
        onClose={() => setConfirmation(null)} onConfirm={() => { if (confirmation) run(confirmation) }}>
        {confirmation === 'end' ? 'This ends the current guided walk. You can book a new tour whenever you are ready.' : confirmation === 'pause' ? 'Your robot will pause the guided walk. You can resume from this screen.' : 'Your robot will continue the guided walk from its current stop.'}
      </ConfirmDialog>
    </div>
  )
}
