/**
 * Labelled fixtures for the operations console: the app's only data source
 * while the ops backend is missing (see `mock-mode.ts`). They implement the
 * `StaffApi` contract, the same type `staffApi` implements over HTTP, so
 * swapping the two is one binding in `staff-hooks.ts`.
 *
 * The world behind these calls lives in `staff-sim.ts`, which also moves on its
 * own while the console is open (`staff-realtime-mock.ts`). A refused command
 * comes back as an `ApiError` 409 with a readable body, the shape the HTTP
 * client produces, so the screens handle both the same way.
 *
 * Every value here is openly fake and each shell says so. Nothing in this file
 * is used to paper over a failed request.
 */
import { ApiError } from '../api/client'
import type { FeedbackFilters, FeedbackReport, StaffActions, StaffApi, TourOperation } from '../api/contracts/staff'
import { canOperateTours } from '../auth/roles'
import { useAuthStore } from '../stores/auth-store'
import { mockDelay } from './mock-mode'
import * as world from './staff-sim'
import { ensureRepresentativeSeed } from './representative-sim'

/**
 * The server's role check for operating a run (scope §2.1): Admin reads the
 * console but may not Start/Hold/Next/End Early without the Staff role. The
 * gates say so, and a direct call is refused with 403.
 */
const OPERATOR_ONLY = 'Cần vai trò Nhân viên vận hành (Staff) để vận hành robot; tài khoản Quản trị viên chỉ xem.'
const operator = () => canOperateTours(useAuthStore.getState().user?.role)

function forCaller<T extends TourOperation>(tour: T): T {
  if (operator()) return tour
  const locked = Object.fromEntries(Object.keys(tour.allowedActions).map((key) => [key, { allowed: false, reason: OPERATOR_ONLY }])) as StaffActions
  return { ...tour, allowedActions: locked }
}

function requireOperator() {
  if (!operator()) throw new ApiError(403, OPERATOR_ONLY)
}

/** Run a "server" command and translate its refusal into an HTTP-shaped error. */
async function call<T>(run: () => T): Promise<T> {
  try {
    ensureRepresentativeSeed()
    const value = run()
    return await mockDelay(structuredClone(value))
  } catch (error) {
    await mockDelay(null)
    if (error instanceof world.SimRejection) throw new ApiError(409, error.message)
    throw error
  }
}

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const sameDay = (iso: string, day: string) => dayKey(new Date(iso)) === day

const routeNames = ['Tuyến khám phá trọng điểm', 'Tuyến lịch sử & học thuật']

/**
 * Post-tour reports across the last two weeks, read by administration.
 * Generated from a fixed table so a chart does not reshuffle on refetch.
 */
const feedbackShape: Array<{ completed: number; cancelled: number; ratings: number[] }> = [
  { completed: 4, cancelled: 1, ratings: [5, 4, 4, 5] },
  { completed: 6, cancelled: 0, ratings: [5, 5, 4, 3, 5, 4] },
  { completed: 3, cancelled: 2, ratings: [4, 3, 5] },
  { completed: 7, cancelled: 1, ratings: [5, 4, 5, 5, 4, 4, 3] },
  { completed: 5, cancelled: 0, ratings: [4, 5, 5, 4] },
  { completed: 2, cancelled: 1, ratings: [3, 4] },
  { completed: 6, cancelled: 1, ratings: [5, 5, 4, 4, 5] },
  { completed: 4, cancelled: 0, ratings: [4, 4, 5, 5] },
  { completed: 5, cancelled: 2, ratings: [3, 4, 4, 5, 5] },
  { completed: 3, cancelled: 0, ratings: [5, 4, 4] },
  { completed: 6, cancelled: 1, ratings: [4, 5, 5, 4, 4, 5] },
  { completed: 4, cancelled: 1, ratings: [5, 3, 4, 5] },
  { completed: 5, cancelled: 0, ratings: [4, 4, 5, 5, 5] },
  { completed: 3, cancelled: 1, ratings: [4, 5] },
]

const feedback: FeedbackReport[] = feedbackShape.flatMap((day, index) => {
  const daysAgo = feedbackShape.length - 1 - index
  const at = (slot: number) => {
    const when = new Date()
    when.setDate(when.getDate() - daysAgo)
    when.setHours(9 + slot, 15, 0, 0)
    return when.toISOString()
  }
  const rows: FeedbackReport[] = []
  for (let i = 0; i < day.completed; i += 1) rows.push({ bookingId: `mock-booking-d${daysAgo}-c${i}`, routeName: routeNames[(index + i) % routeNames.length], tourDate: at(i), bookingStatus: 'Completed', rating: day.ratings[i] ?? null, comment: day.ratings[i] ? 'Phản hồi mẫu từ khách tham quan.' : null })
  for (let i = 0; i < day.cancelled; i += 1) rows.push({ bookingId: `mock-booking-d${daysAgo}-x${i}`, routeName: routeNames[(index + i + 1) % routeNames.length], tourDate: at(day.completed + i), bookingStatus: 'Cancelled', rating: null, comment: null })
  return rows
})

const bySchedule = (a: TourOperation, b: TourOperation) => a.scheduledAt.localeCompare(b.scheduledAt)

export const mockStaffApi: StaffApi = {
  tours: (filters = {}) =>
    call(() => {
      if (filters.history) return world.sim.history.map(world.tourView).map(forCaller)
      const today = dayKey(new Date())
      const day = filters.date ?? today
      const source = day === today ? world.sim.tours : world.sim.history
      return source.filter((t) => sameDay(t.scheduledAt, day)).map(world.tourView).map(forCaller).sort(bySchedule)
    }),

  tour: (id) =>
    call(() => {
      const t = world.tourById(id)
      if (!t) throw new world.SimRejection('Không tìm thấy buổi tham quan.')
      return forCaller(world.tourDetailView(t))
    }),

  startTour: (id, confirmation) => call(() => (requireOperator(), world.tourView(world.startTour(id, confirmation)))),
  commandTour: (id, command, reason) => call(() => (requireOperator(), world.tourView(world.command(id, command, reason)))),
  amrs: () => call(() => world.sim.robots.map(world.robotView)),
  confirmRobotReady: (robotId, note) => call(() => (requireOperator(), world.robotView(world.confirmRobotReady(robotId, note)))),
  alerts: () => call(() => world.sim.alerts),

  feedbackReports: (filters: FeedbackFilters = {}) => {
    const after = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null
    const before = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null
    return mockDelay(
      feedback.filter((report) => {
        const at = new Date(report.tourDate).getTime()
        if (after != null && at < after) return false
        if (before != null && at > before) return false
        if (filters.status && report.bookingStatus !== filters.status) return false
        if (filters.rating && String(report.rating) !== filters.rating) return false
        return true
      }),
    )
  },
}
