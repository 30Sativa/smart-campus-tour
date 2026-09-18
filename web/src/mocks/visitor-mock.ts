/**
 * Labelled fixtures for the visitor app, used only while `USE_MOCK_API` is on
 * (see `mock-mode.ts`). They implement the same `VisitorApi` contract as the
 * HTTP client, so feature code is identical in both modes.
 *
 * Every value here is openly fake and each screen says so. Nothing in this file
 * is used to paper over a failed request: with the flag off, a transport error
 * stays an error (web/AGENTS.md — "Do not fabricate fallback data").
 *
 * Writes mutate module-level arrays, so a booking made in one screen shows up in
 * another for the rest of the page's life and disappears on reload. That is the
 * honest behaviour for a mock: it exercises the UI without pretending to persist.
 */
import type {
  ActiveTour,
  AssistantAnswer,
  CampusLocation,
  LocationFilters,
  NewBooking,
  ProfileUpdate,
  TimeSlot,
  TourCommand,
  VisitorApi,
  VisitorBooking,
  VisitorNotification,
  VisitorProfile,
  VisitorTour,
} from '../api/contracts/visitor'
import { mockDelay } from './mock-mode'
import { CORRIDOR } from '../features/visitor/campus-floorplan'

/**
 * Where the robot is, right now.
 *
 * The fixture used to report one frozen coordinate, which made "show the robot
 * on the map" impossible to actually see working. It now walks the building's
 * circulation ring — the corridor between the atrium columns and the perimeter
 * rooms, which is where a robot would really be — and the position is derived
 * from the clock, so every poll returns a new one and the marker moves.
 *
 * This is openly synthetic, like everything else in this file. It exists so the
 * feature can be exercised without a robot on the floor; the real position will
 * arrive on the same two fields from the telemetry endpoint.
 */
const LAP_MS = 180_000

function robotPose(now = Date.now()): { x: number; y: number; progress: number } {
  const loop = [...CORRIDOR, CORRIDOR[0]]
  const spans = loop.slice(1).map((point, index) => {
    const previous = loop[index]
    return Math.hypot(point.x - previous.x, point.y - previous.y)
  })
  const total = spans.reduce((sum, span) => sum + span, 0)
  const fraction = (now % LAP_MS) / LAP_MS
  let travelled = fraction * total

  for (let index = 0; index < spans.length; index += 1) {
    if (travelled > spans[index]) {
      travelled -= spans[index]
      continue
    }
    const from = loop[index]
    const to = loop[index + 1]
    const ratio = spans[index] === 0 ? 0 : travelled / spans[index]
    return {
      x: Number((from.x + (to.x - from.x) * ratio).toFixed(2)),
      y: Number((from.y + (to.y - from.y) * ratio).toFixed(2)),
      progress: Math.round(fraction * 100),
    }
  }
  return { x: CORRIDOR[0].x, y: CORRIDOR[0].y, progress: 0 }
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

/** `YYYY-MM-DD` for today plus `offset` days, in the browser's own timezone. */
function isoDate(offset = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/* ── Campus locations ─────────────────────────────────────────────────────── */

const locations: CampusLocation[] = [
  {
    id: 'loc-library',
    name: 'Central Library',
    building: 'Delta Building',
    floor: 'Floors 1-3',
    category: 'Library',
    summary: 'Three floors of reading rooms, group study booths and the campus archive.',
    description:
      'The Central Library holds the general collection on the first floor, quiet reading rooms on the second and bookable group study rooms on the third. Staff at the ground-floor desk can issue a visitor reading pass on the day.',
    imageUrl: '/images/images.jpg',
    distanceMeters: 180,
    walkMinutes: 3,
    mapX: 41.5,
    mapY: 11,
    openingHours: 'Mon - Sat, 07:30 - 21:00',
    highlights: ['Group study rooms on floor 3', 'Campus archive and thesis collection', 'Printing and scanning at the entrance'],
  },
  {
    id: 'loc-robotics-lab',
    name: 'Robotics Laboratory',
    building: 'Beta Building',
    floor: 'Floor 2',
    category: 'Lab',
    summary: 'Where the campus tour robots are built, calibrated and tested.',
    description:
      'The robotics laboratory runs the two-wheel differential-drive platform used by the campus tour fleet. Visitors can watch calibration runs from the observation window; entering the test floor needs a staff escort.',
    imageUrl: '/images/robot.avif',
    distanceMeters: 320,
    walkMinutes: 5,
    mapX: 88,
    mapY: 39,
    openingHours: 'Mon - Fri, 08:00 - 17:00',
    highlights: ['Observation window onto the test floor', 'Guided demonstrations on weekday afternoons', 'Staff escort required past the doors'],
  },
  {
    id: 'loc-lecture-hall',
    name: 'Lecture Hall A1',
    building: 'Alpha Building',
    floor: 'Floor 1',
    category: 'Classroom',
    summary: 'The 300-seat hall used for orientation sessions and guest lectures.',
    description:
      'Lecture Hall A1 is the largest teaching room on campus and the usual venue for orientation week. Seating is tiered, with step-free access from the north entrance and four wheelchair spaces on the front row.',
    imageUrl: '/images/hero-campus.jpg',
    distanceMeters: 95,
    walkMinutes: 2,
    mapX: 70,
    mapY: 10,
    openingHours: 'Mon - Sat, 07:00 - 20:00',
    highlights: ['300 tiered seats', 'Step-free access from the north entrance', 'Live captioning available on request'],
  },
  {
    id: 'loc-canteen',
    name: 'Campus Canteen',
    building: 'Gamma Building',
    floor: 'Ground floor',
    category: 'Food',
    summary: 'Hot meals, a noodle counter and a coffee bar, open through lunch.',
    description:
      'The canteen serves rotating hot dishes from 11:00, with a standing noodle counter and a coffee bar that opens earlier. Card and QR payment are accepted at every till; the seating terrace faces the sports field.',
    imageUrl: '/images/booking-app.avif',
    distanceMeters: 240,
    walkMinutes: 4,
    mapX: 47,
    mapY: 88,
    openingHours: 'Daily, 06:30 - 19:00',
    highlights: ['Hot dishes from 11:00', 'Vegetarian counter beside the noodle bar', 'Outdoor terrace facing the sports field'],
  },
  {
    id: 'loc-student-services',
    name: 'Student Services Centre',
    building: 'Alpha Building',
    floor: 'Floor 1',
    category: 'StudentServices',
    summary: 'Admissions, enrolment, student cards and the international desk.',
    description:
      'One counter for admissions, enrolment records, student card issues and the international student desk. Tickets are issued at the door; the quietest hours are before 10:00 and after 15:00.',
    imageUrl: '/images/ai-assistant.avif',
    distanceMeters: 110,
    walkMinutes: 2,
    mapX: 12,
    mapY: 31,
    openingHours: 'Mon - Fri, 08:00 - 17:00',
    highlights: ['Ticketed queue, no appointment needed', 'International student desk at counter 4', 'Student card reprints while you wait'],
  },
  {
    id: 'loc-innovation-hub',
    name: 'Innovation Hub',
    building: 'Delta Building',
    floor: 'Floor 4',
    category: 'Event',
    summary: 'Demo space for student projects, open during showcase weeks.',
    description:
      'The Innovation Hub is a flexible floor used for project showcases, hackathons and industry days. During a showcase week the whole floor is open to visitors and student teams staff their own stands.',
    imageUrl: '/images/digital-twin.jpg',
    distanceMeters: 210,
    walkMinutes: 4,
    mapX: 88,
    mapY: 25,
    openingHours: 'Event days, 09:00 - 18:00',
    highlights: ['Student project stands during showcase weeks', 'Open workshop area for hackathons', 'Industry day talks in the side room'],
  },
  {
    id: 'loc-sports-centre',
    name: 'Sports Centre',
    building: 'Sports Complex',
    floor: null,
    category: 'Event',
    summary: 'Indoor courts, a gym and the outdoor running track.',
    description:
      'The sports complex holds two indoor courts, a gym and changing rooms, with the 400m outdoor track behind it. Visitors may walk the track freely; court and gym access needs a day pass from reception.',
    imageUrl: '/images/ai-fleet-management-autonomous-robot-fleet.webp',
    distanceMeters: 480,
    walkMinutes: 7,
    mapX: 73,
    mapY: 88,
    openingHours: 'Daily, 06:00 - 21:30',
    highlights: ['Two indoor courts and a gym', '400m outdoor running track', 'Day passes from reception'],
  },
  {
    id: 'loc-main-gate',
    name: 'Main Gate Plaza',
    building: 'Campus entrance',
    floor: null,
    category: 'StudentServices',
    summary: 'The usual meeting point for a guided tour, beside the security desk.',
    description:
      'The plaza inside the main gate is where guided tours start. The robot waits beside the security desk, under cover, and there is seating and a water point while you wait.',
    imageUrl: '/images/hero-campus.jpg',
    distanceMeters: 0,
    walkMinutes: 0,
    mapX: 19,
    mapY: 72,
    openingHours: 'Open 24 hours',
    highlights: ['Covered waiting area', 'Beside the security desk', 'Seating and a water point'],
  },
]

const MEETING_POINT_IDS = ['loc-main-gate', 'loc-library', 'loc-student-services']

/* ── Bookings ─────────────────────────────────────────────────────────────── */

let bookings: VisitorBooking[] = [
  {
    id: 'mock-booking-501',
    reference: 'CT-2481',
    date: isoDate(0),
    time: '14:30',
    meetingPointId: 'loc-main-gate',
    meetingPointName: 'Main Gate Plaza',
    tourType: 'CampusTour',
    destinationIds: [],
    destinationNames: [],
    robotName: 'Lotus-01',
    status: 'Confirmed',
    durationMinutes: 45,
    sessionId: null,
  },
  {
    id: 'mock-booking-502',
    reference: 'CT-2477',
    date: isoDate(2),
    time: '09:00',
    meetingPointId: 'loc-library',
    meetingPointName: 'Central Library',
    tourType: 'SpecificDestination',
    destinationIds: ['loc-robotics-lab'],
    destinationNames: ['Robotics Laboratory'],
    robotName: null,
    status: 'Confirmed',
    durationMinutes: 25,
    sessionId: null,
  },
  {
    id: 'mock-booking-503',
    reference: 'CT-2390',
    date: isoDate(-4),
    time: '10:15',
    meetingPointId: 'loc-main-gate',
    meetingPointName: 'Main Gate Plaza',
    tourType: 'CampusTour',
    destinationIds: [],
    destinationNames: [],
    robotName: 'Lotus-02',
    status: 'Completed',
    durationMinutes: 45,
    sessionId: 'mock-session-390',
  },
  {
    id: 'mock-booking-504',
    reference: 'CT-2355',
    date: isoDate(-9),
    time: '16:00',
    meetingPointId: 'loc-student-services',
    meetingPointName: 'Student Services Centre',
    tourType: 'CustomTour',
    destinationIds: ['loc-canteen', 'loc-sports-centre'],
    destinationNames: ['Campus Canteen', 'Sports Centre'],
    robotName: null,
    status: 'Cancelled',
    durationMinutes: 35,
    sessionId: null,
  },
]

/* ── Completed tours ──────────────────────────────────────────────────────── */

const tours: VisitorTour[] = [
  {
    id: 'mock-session-390',
    bookingReference: 'CT-2390',
    routeName: 'Campus highlights',
    startedAt: daysAgo(4),
    endedAt: new Date(Date.parse(daysAgo(4)) + 44 * 60_000).toISOString(),
    status: 'Completed',
    robotName: 'Lotus-02',
    stops: [
      { locationId: 'loc-main-gate', name: 'Main Gate Plaza', arrivedAt: daysAgo(4) },
      { locationId: 'loc-lecture-hall', name: 'Lecture Hall A1', arrivedAt: daysAgo(4) },
      { locationId: 'loc-library', name: 'Central Library', arrivedAt: daysAgo(4) },
      { locationId: 'loc-canteen', name: 'Campus Canteen', arrivedAt: daysAgo(4) },
    ],
    distanceMeters: 1240,
    rating: 5,
  },
  {
    id: 'mock-session-318',
    bookingReference: 'CT-2318',
    routeName: 'Research spaces',
    startedAt: daysAgo(18),
    endedAt: new Date(Date.parse(daysAgo(18)) + 31 * 60_000).toISOString(),
    status: 'Completed',
    robotName: 'Lotus-01',
    stops: [
      { locationId: 'loc-main-gate', name: 'Main Gate Plaza', arrivedAt: daysAgo(18) },
      { locationId: 'loc-robotics-lab', name: 'Robotics Laboratory', arrivedAt: daysAgo(18) },
      { locationId: 'loc-innovation-hub', name: 'Innovation Hub', arrivedAt: null },
    ],
    distanceMeters: 860,
    rating: null,
  },
]

/* ── The tour happening right now ─────────────────────────────────────────── */

let activeTour: ActiveTour | null = {
  sessionId: 'mock-session-live',
  bookingReference: 'CT-2481',
  robotName: 'Lotus-01',
  robotState: 'Navigating',
  batteryPercent: 78,
  currentLocationName: 'Central Library',
  nextDestinationName: 'Campus Canteen',
  etaMinutes: 4,
  progressPercent: robotPose().progress,
  robotMapX: robotPose().x,
  robotMapY: robotPose().y,
  stops: [
    { locationId: 'loc-main-gate', name: 'Main Gate Plaza', arrivedAt: minutesAgo(26), mapX: 19, mapY: 72, isCurrent: false },
    { locationId: 'loc-lecture-hall', name: 'Lecture Hall A1', arrivedAt: minutesAgo(18), mapX: 70, mapY: 10, isCurrent: false },
    { locationId: 'loc-library', name: 'Central Library', arrivedAt: minutesAgo(6), mapX: 41.5, mapY: 11, isCurrent: true },
    { locationId: 'loc-canteen', name: 'Campus Canteen', arrivedAt: null, mapX: 47, mapY: 88, isCurrent: false },
    { locationId: 'loc-sports-centre', name: 'Sports Centre', arrivedAt: null, mapX: 73, mapY: 88, isCurrent: false },
  ],
}

/* ── Notifications ────────────────────────────────────────────────────────── */

let notifications: VisitorNotification[] = [
  {
    id: 'mock-notif-01',
    kind: 'Tour',
    title: 'Your robot is on the way',
    body: 'Lotus-01 is heading to Campus Canteen, about 4 minutes away.',
    createdAt: minutesAgo(3),
    readAt: null,
    href: '/visit/tour',
  },
  {
    id: 'mock-notif-02',
    kind: 'Booking',
    title: 'Tour confirmed for today at 14:30',
    body: 'Meet Lotus-01 at Main Gate Plaza, beside the security desk.',
    createdAt: minutesAgo(95),
    readAt: null,
    href: '/visit/bookings',
  },
  {
    id: 'mock-notif-03',
    kind: 'Campus',
    title: 'Innovation Hub showcase this week',
    body: 'Floor 4 of Delta Building is open to visitors until Friday, 09:00 to 18:00.',
    createdAt: daysAgo(1),
    readAt: daysAgo(1),
    href: '/visit/explore/loc-innovation-hub',
  },
  {
    id: 'mock-notif-04',
    kind: 'Robot',
    title: 'Robot changed for your Thursday tour',
    body: 'Lotus-03 went in for maintenance, so another robot will meet you instead.',
    createdAt: daysAgo(2),
    readAt: daysAgo(2),
    href: '/visit/bookings',
  },
]

/* ── Profile ──────────────────────────────────────────────────────────────── */

let profile: VisitorProfile = {
  fullName: 'Tran Gia Han',
  email: 'giahan.tran@example.edu.vn',
  phone: '+84 90 123 4567',
  preferredLanguage: 'en',
  avatarUrl: null,
  notifyTourUpdates: true,
  notifyBookingReminders: true,
  notifyCampusNews: false,
}

/* ── Assistant ────────────────────────────────────────────────────────────── */

/**
 * Keyword matching, and openly so. A mocked assistant that pretended to
 * understand would hide how little is wired up; this one answers the four
 * suggested questions well and says plainly when it has nothing.
 */
const ANSWERS: Array<{ match: RegExp; text: string; locationIds: string[] }> = [
  {
    match: /librar|book|study|read/i,
    text: 'The Central Library is in Delta Building, about a 3 minute walk from here. Reading rooms are on floor 2 and the group study rooms are on floor 3.',
    locationIds: ['loc-library'],
  },
  {
    match: /class|lecture|hall|room|orientation/i,
    text: 'Orientation sessions and guest lectures run in Lecture Hall A1, on the ground floor of Alpha Building. It is the closest building to the main gate.',
    locationIds: ['loc-lecture-hall'],
  },
  {
    match: /food|eat|lunch|canteen|coffee|drink|hungry/i,
    text: 'The Campus Canteen in Gamma Building serves hot meals from 11:00, with a noodle counter and a coffee bar that opens at 06:30.',
    locationIds: ['loc-canteen'],
  },
  {
    match: /visit|see|recommend|worth|highlight|interesting|tour/i,
    text: 'Most visitors start at Lecture Hall A1, then the Central Library and the Robotics Laboratory, where the tour robots are built. If a showcase is on, the Innovation Hub is worth the extra 4 minutes.',
    locationIds: ['loc-lecture-hall', 'loc-library', 'loc-robotics-lab', 'loc-innovation-hub'],
  },
  {
    match: /robot|lab|amr|build/i,
    text: 'The Robotics Laboratory is on floor 2 of Beta Building. You can watch calibration runs from the observation window; going onto the test floor needs a staff escort.',
    locationIds: ['loc-robotics-lab'],
  },
  {
    match: /enrol|enroll|admis|card|international|servic|paper/i,
    text: 'The Student Services Centre on floor 1 of Alpha Building handles admissions, enrolment, student cards and the international desk. It is quietest before 10:00.',
    locationIds: ['loc-student-services'],
  },
  {
    match: /sport|gym|run|court|track/i,
    text: 'The Sports Centre has two indoor courts, a gym and the 400m outdoor track. The track is open to walk; courts and gym need a day pass from reception.',
    locationIds: ['loc-sports-centre'],
  },
]

let answerCounter = 0

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function byId(id: string): CampusLocation {
  const found = locations.find((item) => item.id === id)
  if (!found) throw new Error(`Unknown mock location: ${id}`)
  return found
}

/** A plausible but obviously synthetic slot grid: half-hourly, 08:00 to 17:00. */
function slotGrid(date: string): TimeSlot[] {
  const slots: TimeSlot[] = []
  // A stable per-date seed, so re-opening the same day shows the same grid.
  const seed = [...date].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  for (let minutes = 8 * 60; minutes <= 17 * 60; minutes += 30) {
    const index = slots.length
    const free = (seed + index * 7) % 4
    slots.push({
      time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      available: free > 0,
      robotsFree: free,
    })
  }
  return slots
}

export const mockVisitorApi: VisitorApi = {
  locations: (filters: LocationFilters = {}) => {
    const search = filters.search?.trim().toLowerCase()
    const result = locations.filter((item) => {
      if (filters.category && item.category !== filters.category) return false
      if (!search) return true
      return `${item.name} ${item.building} ${item.summary}`.toLowerCase().includes(search)
    })
    return mockDelay(result)
  },

  location: (id) => mockDelay(byId(id)),

  meetingPoints: () => mockDelay(MEETING_POINT_IDS.map(byId)),

  slots: (date) => mockDelay(slotGrid(date)),

  bookings: () => mockDelay([...bookings]),

  createBooking: (input: NewBooking) => {
    const meetingPoint = byId(input.meetingPointId)
    const destinationIds = input.destinationIds ?? []
    const created: VisitorBooking = {
      id: `mock-booking-${Date.now()}`,
      reference: `CT-${2500 + bookings.length}`,
      date: input.date,
      time: input.time,
      meetingPointId: meetingPoint.id,
      meetingPointName: meetingPoint.name,
      tourType: input.tourType,
      destinationIds,
      destinationNames: destinationIds.map((id) => byId(id).name),
      robotName: null,
      status: 'Confirmed',
      durationMinutes: input.tourType === 'CampusTour' ? 45 : 20 + destinationIds.length * 10,
      sessionId: null,
    }
    bookings = [created, ...bookings]
    notifications = [
      {
        id: `mock-notif-${Date.now()}`,
        kind: 'Booking',
        title: `Tour confirmed for ${input.date} at ${input.time}`,
        body: `Meet your robot at ${meetingPoint.name}. Reference ${created.reference}.`,
        createdAt: new Date().toISOString(),
        readAt: null,
        href: '/visit/bookings',
      },
      ...notifications,
    ]
    return mockDelay(created, 420)
  },

  cancelBooking: (id) => {
    let cancelled: VisitorBooking | undefined
    bookings = bookings.map((booking) => {
      if (booking.id !== id) return booking
      cancelled = { ...booking, status: 'Cancelled', robotName: null }
      return cancelled
    })
    if (!cancelled) throw new Error(`Unknown mock booking: ${id}`)
    return mockDelay(cancelled)
  },

  tours: () => mockDelay([...tours]),

  activeTour: () => {
    if (!activeTour) return mockDelay(null)
    // Re-derived per read: the position a poll returns is the position now.
    const pose = robotPose()
    activeTour = { ...activeTour, robotMapX: pose.x, robotMapY: pose.y, progressPercent: pose.progress }
    return mockDelay(activeTour)
  },

  commandTour: (sessionId, command: TourCommand) => {
    if (!activeTour || activeTour.sessionId !== sessionId) return mockDelay(activeTour)
    if (command === 'end') activeTour = null
    else activeTour = { ...activeTour, robotState: command === 'pause' ? 'Paused' : 'Navigating' }
    return mockDelay(activeTour, 320)
  },

  ask: (question) => {
    answerCounter += 1
    const hit = ANSWERS.find((entry) => entry.match.test(question))
    const answer: AssistantAnswer = hit
      ? { id: `mock-answer-${answerCounter}`, text: hit.text, locationIds: hit.locationIds }
      : {
          id: `mock-answer-${answerCounter}`,
          text: 'I do not have an answer for that yet. Try asking about the library, a lecture hall, food on campus, the robotics lab or student services.',
          locationIds: [],
        }
    return mockDelay(answer, 620)
  },

  notifications: () => mockDelay([...notifications]),

  markNotificationsRead: () => {
    const now = new Date().toISOString()
    notifications = notifications.map((item) => (item.readAt ? item : { ...item, readAt: now }))
    return mockDelay([...notifications])
  },

  profile: () => mockDelay(profile),

  updateProfile: (update: ProfileUpdate) => {
    profile = { ...profile, ...update }
    return mockDelay(profile, 380)
  },
}
