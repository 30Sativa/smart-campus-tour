import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarPlus } from 'lucide-react'
import type { VisitorBooking } from '../../api/contracts/visitor'
import { PageHeader } from '../../features/visitor/components/PageHeader'
import { BookingCard } from '../../features/visitor/components/BookingCard'
import { RobotMark } from '../../features/visitor/components/RobotMark'
import { EmptyState, ErrorState, LoadingSkeleton } from '../../features/visitor/components/States'
import { useCancelBooking, useMyBookings } from '../../features/visitor/visitor-hooks'
import { ConfirmDialog } from '../../features/visitor/components/ConfirmDialog'

/**
 * Every booking this account has, in three tabs.
 *
 * The tab is UI state and lives here. The counts are on the tabs because
 * "Cancelled 1" answers the question the tab is for without opening it.
 */
const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
] as const

type TabId = (typeof TABS)[number]['id']

function bucketOf(booking: VisitorBooking): TabId {
  if (booking.status === 'Cancelled') return 'cancelled'
  if (booking.status === 'Completed') return 'completed'
  return 'upcoming'
}

const EMPTY: Record<TabId, { title: string; text: string }> = {
  upcoming: {
    title: 'No tours coming up',
    text: 'Book a robot and it will be waiting for you at the meeting point you choose.',
  },
  completed: {
    title: 'No finished tours yet',
    text: 'Once you have walked a tour with a robot it will show up here.',
  },
  cancelled: {
    title: 'Nothing cancelled',
    text: 'Bookings you cancel are kept here so you can book the same tour again.',
  },
}

export default function MyBookingsPage() {
  const [tab, setTab] = useState<TabId>('upcoming')
  const bookings = useMyBookings()
  const cancel = useCancelBooking()
  const [cancelTarget, setCancelTarget] = useState<VisitorBooking | null>(null)
  const [notice, setNotice] = useState('')

  const counts: Record<TabId, number> = { upcoming: 0, completed: 0, cancelled: 0 }
  for (const booking of bookings.data ?? []) counts[bucketOf(booking)] += 1

  const visible = (bookings.data ?? [])
    .filter((booking) => bucketOf(booking) === tab)
    .sort((a, b) => tab === 'upcoming' ? `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) : `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))

  return (
    <div className="vs-page vs-stack vs-stack--editorial">
      <PageHeader
        eyebrow="My bookings"
        title="My bookings"
        description="Tours you have booked, walked and cancelled, with the reference to show at the meeting point."
        actions={
          <Link to="/visit/book" className="lp-btn lp-btn--solid lp-btn--sm">
            <CalendarPlus size={15} strokeWidth={2} aria-hidden="true" />
            Book a robot
          </Link>
        }
      />

      {notice && <p className="vs-feedback" role="status">{notice}</p>}

      <div className="vs-tabs" role="tablist" aria-label="Booking status">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="vs-tab"
            aria-selected={tab === id}
            id={`booking-tab-${id}`}
            aria-controls="booking-results"
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => {
              const index = TABS.findIndex((item) => item.id === id)
              const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1
              if (next < 0) return
              event.preventDefault()
              setTab(TABS[next].id)
              document.getElementById(`booking-tab-${TABS[next].id}`)?.focus()
            }}
            onClick={() => setTab(id)}
          >
            {label}
            <span className="vs-tab__count">{counts[id]}</span>
          </button>
        ))}
      </div>

      <section role="tabpanel" id="booking-results" aria-labelledby={`booking-tab-${tab}`} tabIndex={0} data-visitor-reveal>
        {bookings.isPending ? (
          <LoadingSkeleton rows={2} />
        ) : bookings.isError ? (
          <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={EMPTY[tab].title}
            text={EMPTY[tab].text}
            icon={<RobotMark size={24} />}
            actions={
              tab === 'upcoming' ? (
                <Link to="/visit/book" className="lp-btn lp-btn--solid lp-btn--sm">
                  Book a robot
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="vs-grid vs-grid--2">
            {visible.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onCancel={(item) => { cancel.reset(); setCancelTarget(item) }}
                cancelling={cancel.isPending && cancel.variables === booking.id}
              />
            ))}
          </div>
        )}

        {cancel.isError && (
          <div className="auth-alert" role="alert" style={{ marginTop: 18 }}>
            We could not cancel that booking. Check your connection and try again.
          </div>
        )}
      </section>
      <ConfirmDialog open={Boolean(cancelTarget)} title="Cancel this booking?" confirmLabel="Cancel booking" pending={cancel.isPending}
        error={cancel.isError ? 'We could not cancel your booking. Please try again.' : undefined}
        onClose={() => setCancelTarget(null)} onConfirm={() => {
          if (cancelTarget) cancel.mutate(cancelTarget.id, { onSuccess: () => { setNotice(`Booking ${cancelTarget.reference} was cancelled.`); setCancelTarget(null) } })
        }}>
        {cancelTarget && <>Your tour on {cancelTarget.date} at {cancelTarget.time} will be cancelled. You can book another time whenever you are ready.</>}
      </ConfirmDialog>
    </div>
  )
}
