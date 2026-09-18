import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check, MapPin } from 'lucide-react'
import type { TourType } from '../../api/contracts/visitor'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { RobotMark } from '../../features/visitor/components/RobotMark'
import { EmptyState, ErrorState, LoadingPanel } from '../../features/visitor/components/States'
import { BookingCard } from '../../features/visitor/components/BookingCard'
import { TOUR_TYPES, TOUR_TYPE_LABEL } from '../../features/visitor/visitor-content'
import { useBookingSlots, useCampusLocations, useCreateBooking, useMeetingPoints } from '../../features/visitor/visitor-hooks'
import { formatDateLong } from '../../features/visitor/visitor-format'

/**
 * Booking a robot, as six short steps on one screen.
 *
 * One screen, not a wizard with six routes: each step is a small block, the ones
 * behind you collapse to a summary line, and the step you are on is the only one
 * asking for anything. A visitor can see the whole shape of the decision without
 * a long scrolling form, and going back is a tap rather than a browser Back.
 *
 * The stepper on top is `.lp-step__num`'s device — a numbered tick on a hairline
 * track — which is how the landing page already draws a sequence.
 */
const STEPS = ['Date', 'Time', 'Meeting point', 'Tour type', 'Destinations', 'Review'] as const

type Step = (typeof STEPS)[number]

/** The next seven days, which is as far ahead as the slot grid is published. */
function upcomingDays(count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { iso, date }
  })
}

export default function BookRobotPage() {
  const [params] = useSearchParams()
  const preselected = params.get('destination')

  const days = useMemo(() => upcomingDays(), [])
  const [step, setStep] = useState(0)
  const stepRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const heading = stepRef.current?.querySelector('h2')
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
  }, [step])
  const [date, setDate] = useState(days[0].iso)
  const [tourType, setTourType] = useState<TourType>(preselected ? 'SpecificDestination' : 'CampusTour')
  const [destinationIds, setDestinationIds] = useState<string[]>(preselected ? [preselected] : [])

  /**
   * A time only exists on its own date, so the chosen slot carries the date it
   * was chosen on. Changing the day therefore un-chooses the time by itself,
   * rather than by an effect that watches `date` and resets another piece of
   * state — which is the same answer arrived at one render later.
   */
  const [slotChoice, setSlotChoice] = useState<{ date: string; time: string } | null>(null)
  const time = slotChoice?.date === date ? slotChoice.time : null
  const setTime = (next: string) => setSlotChoice({ date, time: next })

  const meetingPoints = useMeetingPoints()
  const slots = useBookingSlots(date)
  const locations = useCampusLocations()
  const createBooking = useCreateBooking()

  /**
   * The first meeting point is the usual one, so it is the default — but the
   * default is read from the query rather than written into state when the query
   * lands. Nothing to reset, and no render where the field is briefly empty.
   */
  const [pickedMeetingPoint, setPickedMeetingPoint] = useState<string | null>(null)
  const meetingPointId = pickedMeetingPoint ?? meetingPoints.data?.[0]?.id ?? null
  const setMeetingPointId = setPickedMeetingPoint

  const needsDestinations = tourType !== 'CampusTour'
  // Annotated because TypeScript infers a narrowed element type from the filter
  // predicate, which would make `visibleSteps` a different union from `STEPS`.
  const visibleSteps: Step[] = needsDestinations ? [...STEPS] : STEPS.filter((label) => label !== 'Destinations')

  const meetingPoint = meetingPoints.data?.find((item) => item.id === meetingPointId) ?? null
  const chosenDestinations = (locations.data ?? []).filter((item) => destinationIds.includes(item.id))

  const canAdvance = [
    Boolean(date),
    Boolean(time && slots.data?.some((slot) => slot.time === time && slot.available)),
    Boolean(meetingPoint),
    Boolean(tourType),
    !needsDestinations || (chosenDestinations.length > 0 && chosenDestinations.length === destinationIds.length),
    true,
  ]

  const lastStep = visibleSteps.length - 1

  /** Skips the destinations step when the tour type does not have one. */
  const move = (direction: 1 | -1) => {
    let next = step + direction
    if (!needsDestinations && STEPS[next] === 'Destinations') next += direction
    setStep(Math.min(Math.max(next, 0), STEPS.length - 1))
  }

  const toggleDestination = (id: string) => {
    setDestinationIds((current) => {
      if (tourType === 'SpecificDestination') return [id]
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    })
  }

  const submit = () => {
    if (!time || !meetingPointId || !canAdvance.every(Boolean)) return
    createBooking.mutate(
      { date, time, meetingPointId, tourType, destinationIds: needsDestinations ? destinationIds : [] },
    )
  }

  const stateOf = (label: Step) => {
    const index = STEPS.indexOf(label)
    if (index === step) return 'current'
    return index < step ? 'done' : 'todo'
  }

  if (createBooking.isSuccess && createBooking.data) return <div className="vs-page vs-stack vs-booking-success">
    <div className="vs-success-mark"><Check size={28} aria-hidden="true" /></div>
    <PageHeader eyebrow="You are all set" title="Your booking is confirmed" description="Your campus adventure is on the calendar. Keep your booking reference and meet us at the location below." />
    <p role="status" className="vs-sr">Booking {createBooking.data.reference} confirmed.</p>
    <BookingCard booking={createBooking.data} />
    <div className="vs-card__foot"><Link to="/visit/bookings" className="lp-btn lp-btn--solid">Manage my bookings <ArrowRight size={16} aria-hidden="true" /></Link><Link to="/visit/explore" className="lp-btn lp-btn--ghost">Keep exploring</Link></div>
  </div>

  return (
    <div className="vs-page vs-stack">
      <PageHeader
        eyebrow="Book a robot"
        title="Book a robot"
        description="Choose when to visit, where to meet and what to explore. Review everything before you confirm."
      />

      <ol className="vs-steps" aria-label="Booking steps">
        {visibleSteps.map((label, index) => (
          <li key={label} className="vs-step" data-state={stateOf(label)} aria-current={stateOf(label) === 'current' ? 'step' : undefined}>
            <span className="vs-step__n">{String(index + 1).padStart(2, '0')}</span>
            <span className="vs-step__label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="vs-booking-layout">
      <div className="vs-card vs-card--pad vs-booking-form" ref={stepRef}>
        <div key={step} className="vs-step-content">
        {/* ── Step 1: date ─────────────────────────────────────────────────── */}
        {STEPS[step] === 'Date' && (
          <section aria-labelledby="step-date">
            <h2 className="vs-h3" id="step-date">
              Choose a date
            </h2>
            <p className="vs-lead">Tours run every day while the campus is open.</p>
            <div className="vs-slots" style={{ marginTop: 18 }}>
              {days.map(({ iso, date: day }) => (
                <button key={iso} type="button" className="vs-slot" aria-pressed={date === iso} onClick={() => setDate(iso)}>
                  {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(day)}
                  <span className="vs-slot__sub">{new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(day)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Step 2: time ─────────────────────────────────────────────────── */}
        {STEPS[step] === 'Time' && (
          <section aria-labelledby="step-time">
            <h2 className="vs-h3" id="step-time">
              Choose a time
            </h2>
            <p className="vs-lead">{formatDateLong(`${date}T00:00:00`)}. A crossed-out time has no robot free.</p>
            {slots.isPending ? (
              <div style={{ marginTop: 18 }}>
                <LoadingPanel minHeight={140} />
              </div>
            ) : slots.isError ? (
              <div style={{ marginTop: 18 }}>
                <ErrorState error={slots.error} onRetry={() => void slots.refetch()} />
              </div>
            ) : slots.data.length === 0 || !slots.data.some((slot) => slot.available) ? (
              <EmptyState title="No robots available on this date" text="Choose another day to find an available time." actions={<button type="button" className="lp-btn lp-btn--ghost lp-btn--sm" onClick={() => setStep(0)}>Choose another date</button>} />
            ) : (
              <div className="vs-slots" style={{ marginTop: 18 }}>
                {slots.data.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    className="vs-slot"
                    aria-pressed={time === slot.time}
                    disabled={!slot.available}
                    onClick={() => setTime(slot.time)}
                  >
                    {slot.time}
                    <span className="vs-slot__sub">
                      {slot.available ? (slot.robotsFree != null ? `${slot.robotsFree} free` : 'Available') : 'Full'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Step 3: meeting point ────────────────────────────────────────── */}
        {STEPS[step] === 'Meeting point' && (
          <section aria-labelledby="step-point">
            <h2 className="vs-h3" id="step-point">
              Choose where to meet your robot
            </h2>
            <p className="vs-lead">The robot will be waiting here at {time ?? 'your chosen time'}.</p>
            {meetingPoints.isPending ? (
              <div style={{ marginTop: 18 }}>
                <LoadingPanel minHeight={140} />
              </div>
            ) : meetingPoints.isError ? (
              <div style={{ marginTop: 18 }}>
                <ErrorState error={meetingPoints.error} onRetry={() => void meetingPoints.refetch()} />
              </div>
            ) : meetingPoints.data.length === 0 ? (
              <EmptyState title="No meeting points available" text="Please try booking again later, when a campus meeting point is available." />
            ) : (
              <div className="vs-grid" style={{ marginTop: 18 }}>
                {meetingPoints.data.map((point) => (
                  <button
                    key={point.id}
                    type="button"
                    className="vs-choice"
                    aria-pressed={meetingPointId === point.id}
                    data-on={meetingPointId === point.id}
                    onClick={() => setMeetingPointId(point.id)}
                  >
                    <span className="vs-choice__icon" aria-hidden="true">
                      <MapPin size={18} strokeWidth={1.9} />
                    </span>
                    <span className="vs-min">
                      <span className="vs-choice__title">{point.name}</span>
                      <span className="vs-choice__desc">{point.summary}</span>
                    </span>
                    {meetingPointId === point.id && <Check size={18} strokeWidth={2.2} className="vs-choice__check" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Step 4: tour type ────────────────────────────────────────────── */}
        {STEPS[step] === 'Tour type' && (
          <section aria-labelledby="step-type">
            <h2 className="vs-h3" id="step-type">
              Choose the kind of tour
            </h2>
            <p className="vs-lead">Choose a guided campus walk or the destinations you want to visit.</p>
            <div className="vs-grid" style={{ marginTop: 18 }}>
              {TOUR_TYPES.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className="vs-choice"
                  aria-pressed={tourType === value}
                  data-on={tourType === value}
                  onClick={() => {
                    setTourType(value)
                    if (value === 'CampusTour') setDestinationIds([])
                    if (value === 'SpecificDestination') setDestinationIds((ids) => ids.slice(0, 1))
                  }}
                >
                  <span className="vs-choice__icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={1.9} />
                  </span>
                  <span className="vs-min">
                    <span className="vs-choice__title">{label}</span>
                    <span className="vs-choice__desc">{description}</span>
                  </span>
                  {tourType === value && <Check size={18} strokeWidth={2.2} className="vs-choice__check" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Step 5: destinations, only when the tour type has any ────────── */}
        {STEPS[step] === 'Destinations' && (
          <section aria-labelledby="step-dest">
            <h2 className="vs-h3" id="step-dest">
              {tourType === 'SpecificDestination' ? 'Choose where to go' : 'Choose the places to visit'}
            </h2>
            <p className="vs-lead">
              {tourType === 'SpecificDestination'
                ? 'The robot will walk you straight there.'
                : 'Choose the places you would like to include in your visit.'}
            </p>
            {locations.isPending ? (
              <div style={{ marginTop: 18 }}>
                <LoadingPanel minHeight={200} />
              </div>
            ) : locations.isError ? (
              <div style={{ marginTop: 18 }}>
                <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
              </div>
            ) : locations.data.length === 0 ? (
              <EmptyState title="No destinations available" text="Go back to choose a campus tour, or try again later." />
            ) : (
              <div className="vs-grid vs-grid--2" style={{ marginTop: 18 }}>
                {locations.data.map((location) => {
                  const on = destinationIds.includes(location.id)
                  return (
                    <button
                      key={location.id}
                      type="button"
                      className="vs-choice"
                      aria-pressed={on}
                      data-on={on}
                      onClick={() => toggleDestination(location.id)}
                    >
                      <span className="vs-choice__icon" aria-hidden="true">
                        <MapPin size={18} strokeWidth={1.9} />
                      </span>
                      <span className="vs-min">
                        <span className="vs-choice__title">{location.name}</span>
                        <span className="vs-choice__desc">
                          {location.building}
                          {location.walkMinutes != null ? ` · ${location.walkMinutes} min walk` : ''}
                        </span>
                      </span>
                      {on && <Check size={18} strokeWidth={2.2} className="vs-choice__check" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Step 6: review ──────────────────────────────────────────────── */}
        {STEPS[step] === 'Review' && (
          <section aria-labelledby="step-review">
            <h2 className="vs-h3" id="step-review">
              Check your booking
            </h2>
            <p className="vs-lead">Nothing is booked until you confirm.</p>
            {!canAdvance.every(Boolean) && <p className="auth-alert" role="alert">One of your choices is no longer available. Go back to choose an available time, meeting point or destination.</p>}

            <dl className="vs-facts" style={{ marginTop: 18 }}>
              <div className="vs-fact">
                <dt className="vs-fact__k">Date</dt>
                <dd className="vs-fact__v">{formatDateLong(`${date}T00:00:00`)}</dd>
              </div>
              <div className="vs-fact">
                <dt className="vs-fact__k">Time</dt>
                <dd className="vs-fact__v">{time ?? 'Not chosen'}</dd>
              </div>
              <div className="vs-fact">
                <dt className="vs-fact__k">Meeting point</dt>
                <dd className="vs-fact__v">{meetingPoint?.name ?? 'Not chosen'}</dd>
              </div>
              <div className="vs-fact">
                <dt className="vs-fact__k">Tour type</dt>
                <dd className="vs-fact__v">{TOUR_TYPE_LABEL[tourType]}</dd>
              </div>
              {needsDestinations && (
                <div className="vs-fact">
                  <dt className="vs-fact__k">Destinations</dt>
                  <dd className="vs-fact__v">
                    {chosenDestinations.length > 0 ? chosenDestinations.map((item) => item.name).join(', ') : 'Not chosen'}
                  </dd>
                </div>
              )}
            </dl>

            {createBooking.isError && (
              <div className="auth-alert" role="alert" style={{ marginTop: 20 }}>
                We could not confirm that booking. Check your connection and try again.
              </div>
            )}
          </section>
        )}

        </div>
        {/* ── Step controls ───────────────────────────────────────────────── */}
        <div
          className="vs-card__foot"
          style={{ justifyContent: 'space-between', borderTop: '1px solid var(--lp-line)', marginTop: 24, paddingTop: 20 }}
        >
          <button
            type="button"
            className="lp-btn lp-btn--ghost lp-btn--sm"
            onClick={() => move(-1)}
            disabled={step === 0 || createBooking.isPending}
          >
            <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
            Back
          </button>

          {STEPS[step] === 'Review' ? (
            <button
              type="button"
              className="lp-btn lp-btn--solid"
              onClick={submit}
              disabled={createBooking.isPending || !canAdvance.every(Boolean)}
              aria-busy={createBooking.isPending}
            >
              {createBooking.isPending ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  Confirming...
                </>
              ) : (
                <>
                  <RobotMark size={16} />
                  Confirm booking
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="lp-btn lp-btn--solid lp-btn--sm"
              onClick={() => move(1)}
              disabled={!canAdvance[step]}
            >
              Continue
              <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <aside className="vs-card vs-card--pad vs-booking-summary" aria-label="Your visit summary">
        <span className="vs-choice__icon"><RobotMark size={24} /></span>
        <h2 className="vs-h3">Your campus visit</h2>
        <p className="vs-lead">A little planning. A lot to discover.</p>
        <dl className="vs-facts">
          <div className="vs-fact"><dt className="vs-fact__k">When</dt><dd className="vs-fact__v">{formatDateLong(`${date}T00:00:00`)}<br />{time || 'Choose a time'}</dd></div>
          <div className="vs-fact"><dt className="vs-fact__k">Meet at</dt><dd className="vs-fact__v">{meetingPoint?.name || 'Choose a meeting point'}</dd></div>
          <div className="vs-fact"><dt className="vs-fact__k">Your tour</dt><dd className="vs-fact__v">{TOUR_TYPE_LABEL[tourType]}</dd></div>
        </dl>
        <p className="vs-card__meta">Nothing is booked until you confirm. Your booking reference will appear on the next screen.</p>
      </aside>
      </div>

      <p className="lp-meta">
        Changed your mind? <Link to="/visit/bookings" style={{ color: 'var(--lp-accent)', fontWeight: 600 }}>See your bookings</Link>.
      </p>

      {/* The stepper counts the steps a visitor will actually see, so this keeps
          `lastStep` honest for a screen reader even when Destinations is skipped. */}
      <p className="lp-meta vs-sr" aria-live="polite">
        Step {visibleSteps.indexOf(STEPS[step]) + 1} of {lastStep + 1}
      </p>
    </div>
  )
}
