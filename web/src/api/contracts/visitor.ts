/**
 * Visitor-facing endpoint DTOs and the one HTTP implementation of them.
 *
 * Shape and conventions are copied from `contracts/operations.ts` on purpose:
 * one `VisitorApi` type that both this HTTP client and the labelled fixtures in
 * `src/mocks/visitor-mock.ts` satisfy, so no screen ever learns which one it is
 * talking to and the switch is made exactly once, in
 * `features/visitor/visitor-hooks.ts`.
 *
 * Vocabulary rule (web/AGENTS.md §3): the API speaks enums (`InProgress`,
 * `Navigating`, `Library`). Those stay here, in the query filters and in the
 * cache keys. They never reach a screen — `features/visitor/visitor-status.ts`
 * and `visitor-content.ts` own every word a visitor reads.
 *
 * Nothing here is a business rule. Distance, ETA, battery and progress are
 * values the backend computes and this app displays; the frontend does not
 * derive them (web/AGENTS.md §3).
 */
import { apiClient } from '../client'

/* ── Campus locations ─────────────────────────────────────────────────────── */

/** Filter value sent to the API. `All` is client-side only and never sent. */
export type LocationCategory =
  | 'Classroom'
  | 'Library'
  | 'Lab'
  | 'Food'
  | 'StudentServices'
  | 'Event'

export type CampusLocation = {
  id: string
  name: string
  building: string
  /** Null for an outdoor place, which has no floor to print. */
  floor: string | null
  category: LocationCategory
  /** One or two sentences. Long-form copy lives on the detail screen. */
  summary: string
  description: string
  imageUrl: string
  /** Walking distance from the visitor, in metres, as returned by the backend. */
  distanceMeters: number | null
  /** Walking time from the visitor, in minutes, as returned by the backend. */
  walkMinutes: number | null
  /** Position on the campus plan, in percent of its width and height. */
  mapX: number
  mapY: number
  openingHours: string | null
  /** Short factual lines for the detail screen. Never invented client-side. */
  highlights: string[]
}

export type LocationFilters = {
  search?: string
  category?: LocationCategory
}

/* ── Bookings ─────────────────────────────────────────────────────────────── */

export type TourType = 'CampusTour' | 'SpecificDestination' | 'CustomTour'

/** Lifecycle as the API spells it. `visitor-status.ts` turns it into words. */
export type BookingStatus = 'Confirmed' | 'InProgress' | 'Completed' | 'Cancelled'

export type TimeSlot = {
  /** 24h local time, `HH:mm`. The API decides the grid, not the UI. */
  time: string
  available: boolean
  /** How many robots are free in this slot. Null when the API omits it. */
  robotsFree: number | null
}

export type VisitorBooking = {
  id: string
  /** Short human reference a visitor can read out at the meeting point. */
  reference: string
  /** ISO date, `YYYY-MM-DD`. */
  date: string
  /** 24h local time, `HH:mm`. */
  time: string
  meetingPointId: string
  meetingPointName: string
  tourType: TourType
  /** Chosen destinations for `SpecificDestination` and `CustomTour`. */
  destinationIds: string[]
  destinationNames: string[]
  /** Null until a robot is assigned. A missing value stays missing. */
  robotName: string | null
  status: BookingStatus
  durationMinutes: number
  /** Set once the tour is running, so "Active tour" has something to open. */
  sessionId: string | null
}

export type NewBooking = {
  date: string
  time: string
  meetingPointId: string
  tourType: TourType
  destinationIds?: string[]
  note?: string
}

/* ── Completed tours ──────────────────────────────────────────────────────── */

export type TourStop = {
  locationId: string
  name: string
  /** Null for a stop that was skipped or not reached. */
  arrivedAt: string | null
}

export type VisitorTour = {
  id: string
  bookingReference: string
  routeName: string
  startedAt: string
  endedAt: string | null
  status: BookingStatus
  robotName: string | null
  stops: TourStop[]
  distanceMeters: number | null
  /** The visitor's own rating, 1 to 5, or null if they have not left one. */
  rating: number | null
}

/* ── The tour happening right now ─────────────────────────────────────────── */

/** Robot state as the API spells it. Never printed raw. */
export type RobotState = 'Navigating' | 'Paused' | 'Arrived' | 'Waiting' | 'Returning'

export type ActiveTour = {
  sessionId: string
  bookingReference: string
  robotName: string
  robotState: RobotState
  /** Null when the robot reports no reading. Never filled in with a guess. */
  batteryPercent: number | null
  currentLocationName: string
  nextDestinationName: string | null
  /** Minutes to the next destination, from the backend. */
  etaMinutes: number | null
  progressPercent: number
  robotMapX: number
  robotMapY: number
  stops: Array<TourStop & { mapX: number; mapY: number; isCurrent: boolean }>
}

export type TourCommand = 'pause' | 'resume' | 'end'

/* ── Campus assistant ─────────────────────────────────────────────────────── */

export type AssistantAnswer = {
  id: string
  text: string
  /** Places the assistant is pointing at, so the UI can offer to go there. */
  locationIds: string[]
}

/* ── Notifications ────────────────────────────────────────────────────────── */

export type NotificationKind = 'Booking' | 'Tour' | 'Robot' | 'Campus'

export type VisitorNotification = {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  readAt: string | null
  /** In-app path this notification is about, if any. */
  href: string | null
}

/* ── Profile ──────────────────────────────────────────────────────────────── */

export type PreferredLanguage = 'vi' | 'en'

export type VisitorProfile = {
  fullName: string
  email: string
  phone: string | null
  preferredLanguage: PreferredLanguage
  avatarUrl: string | null
  notifyTourUpdates: boolean
  notifyBookingReminders: boolean
  notifyCampusNews: boolean
}

export type ProfileUpdate = Partial<Omit<VisitorProfile, 'email' | 'avatarUrl'>>

/* ── The contract ─────────────────────────────────────────────────────────── */

/**
 * What the visitor feature depends on. The HTTP implementation below and the
 * labelled mock both satisfy it, so the feature never learns which one it has.
 */
export type VisitorApi = {
  locations(filters?: LocationFilters): Promise<CampusLocation[]>
  location(id: string): Promise<CampusLocation>
  meetingPoints(): Promise<CampusLocation[]>
  slots(date: string): Promise<TimeSlot[]>
  bookings(): Promise<VisitorBooking[]>
  createBooking(booking: NewBooking): Promise<VisitorBooking>
  cancelBooking(id: string): Promise<VisitorBooking>
  tours(): Promise<VisitorTour[]>
  activeTour(): Promise<ActiveTour | null>
  commandTour(sessionId: string, command: TourCommand): Promise<ActiveTour | null>
  ask(question: string): Promise<AssistantAnswer>
  notifications(): Promise<VisitorNotification[]>
  markNotificationsRead(): Promise<VisitorNotification[]>
  profile(): Promise<VisitorProfile>
  updateProfile(update: ProfileUpdate): Promise<VisitorProfile>
}

function queryString(values: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const visitorApi: VisitorApi = {
  locations: (filters = {}) => apiClient(`/api/visitor/locations${queryString(filters)}`),
  location: (id) => apiClient(`/api/visitor/locations/${id}`),
  meetingPoints: () => apiClient('/api/visitor/meeting-points'),
  slots: (date) => apiClient(`/api/visitor/booking-slots${queryString({ date })}`),
  bookings: () => apiClient('/api/visitor/bookings'),
  createBooking: (booking) => apiClient('/api/visitor/bookings', { method: 'POST', json: booking }),
  cancelBooking: (id) => apiClient(`/api/visitor/bookings/${id}/cancel`, { method: 'POST' }),
  tours: () => apiClient('/api/visitor/tours'),
  activeTour: () => apiClient('/api/visitor/tours/active'),
  commandTour: (sessionId, command) =>
    apiClient(`/api/visitor/tours/${sessionId}/${command}`, { method: 'POST' }),
  ask: (question) => apiClient('/api/visitor/assistant/ask', { method: 'POST', json: { question } }),
  notifications: () => apiClient('/api/visitor/notifications'),
  markNotificationsRead: () => apiClient('/api/visitor/notifications/read', { method: 'POST' }),
  profile: () => apiClient('/api/visitor/profile'),
  updateProfile: (update) => apiClient('/api/visitor/profile', { method: 'PUT', json: update }),
}
