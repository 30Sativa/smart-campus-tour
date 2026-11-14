import type { RouteDetails } from '../routes/types'
import type { VersionedRoute } from '../routes/versioned-api'

export type TourState = 'SCHEDULED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED'
export type TourInput = {
  name: string; description: string | null; routeId: string
  scheduledStartAt: string; fallbackVideoUrl: string | null
}
export type CreateTourInput = {
  name: string; description: string | null; routeRevisionId: string; robotCode: string
  /** The chosen shift's start; null for a quick Tour, whose latest Start the server sets (ADR-0053). */
  operatorUserId: string; scheduledStartAt: string | null; fallbackVideoUrl: string | null; capacity: number
  /** Set only for a quick Tour, and then required. */
  shortNoticeReason?: string | null
}
export type TourOperator = { userId: string; fullName: string; username: string }
export type TourRobotOption = { robotCode: string; displayName: string | null; usable: boolean; blockReason: string | null }
export type TourReservation = { robotCode: string; startsAt: string; endsAt: string; measuredDurationSeconds: number; expectedDurationSeconds: number; releasedAt: string | null }
export type TourSummary = {
  id: string; name: string; description: string | null; routeId: string; routeName: string; activeRouteId: string
  scheduledStartAt: string; state: TourState; createdByUserId: string; createdAt: string; updatedAt: string | null
  /** When registration closes, from a server that sends it. Absent otherwise: see `registrationClosesAtOf`. */
  registrationClosesAt?: string | null
  /**
   * A quick Tour (ADR-0053): no shift, Start opens at creation, `scheduledStartAt` is its latest Start. Staff closes its
   * list with READY; there is no 72/48/24-hour schedule (ADR-0050).
   */
  isShortNotice?: boolean
  rowVersion: string; registrationCount: number; invitationCount: number; routeRevisionId: string | null
  /** Seats of the Tour and the rows holding one (BR-26). An older server omits them. */
  capacity?: number; heldSeats?: number
  /** The active robot hold. Null for a legacy Tour and once a Tour is cancelled. */
  reservation?: TourReservation | null
  /** Read-only run situation from the list query. An older server omits it; then read the detail. */
  execution?: TourExecutionSummary | null
  /** The assigned Operator; null for a legacy Tour. An older server omits it. */
  operator?: TourOperator | null
  /** READY blockers of a SCHEDULED row, only when the list was asked with `readyBlockers`; null otherwise. */
  readyBlockers?: TourBlocker[] | null
}
/**
 * `commandState` is the current leg's GoTo, the command the detail shows.
 * `needsReconcile` is true while any GoTo of the Tour is UNKNOWN, also after the Tour ended.
 */
export type TourExecutionSummary = {
  operationalStatus: TourOperationalStatus | null; assistanceReason: string | null; currentStep: TourStep | null
  commandState: RobotCommandState | null; needsReconcile: boolean
}
export type TourDetails = {
  tour: TourSummary
  /** Null when the Tour was scheduled from `routeRevision`. */
  route: RouteDetails | null; activeRoute: RouteDetails | null
  routeRevision: VersionedRoute | null; operator: TourOperator | null; reservation: TourReservation | null
  fallbackVideoUrl: string | null; startedAt: string | null; endedAt: string | null; endReason: string | null
  usage: { hasRegistrations: boolean; hasAllowedBranches: boolean; hasOperationalHistory: boolean; hasRobotOwnership: boolean }
  /** `canMarkReady`/`canReopen`/`readyBlockers` come from servers with READY (ADR-0042); an older response omits them. */
  permissions: {
    canEditMetadata: boolean; canChangeScheduleAndRoute: boolean; canCancel: boolean
    canMarkReady?: boolean; canReopen?: boolean; readyBlockers?: TourBlocker[] | null
    canChangeCapacity?: boolean; canChangeOperator?: boolean; maxCapacity?: number
  }
  /** The run state; every field but `state` stays null until Start (ADR-0043). */
  execution?: TourExecution | null
  /** Advisory for the caller; every write rechecks under the server's locks. */
  allowedActions?: TourAllowedActions | null
}
/** One failing READY condition, in the backend's words. */
export type TourBlocker = { code: string; message: string }
/** `PAUSED`: the Operator paused a leg and the robot reported it ended; the robot stands still on purpose. */
export type TourOperationalStatus = 'NORMAL' | 'NEEDS_ASSISTANCE' | 'PAUSED'
/** `INITIALIZING`: opened and waiting at the start for the Operator to depart. */
export type TourStep = 'INITIALIZING' | 'NAVIGATING' | 'OBSERVING' | 'RETURNING_TO_END'
export type TourLegKind = 'TO_POI' | 'TO_END'
/** ADR-0042 §3 command lifecycle, persisted on `RobotCommands.State`. */
export type RobotCommandState = 'PENDING' | 'DELIVERED' | 'ACCEPTED' | 'ARRIVED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED' | 'UNKNOWN' | 'RECONCILED'
/** `cancelRequested`: the Operator paused this leg and the robot has not reported its end yet. */
export type TourCommand = { id: string; kind: 'GoTo' | 'Cancel'; state: RobotCommandState; outcome: string | null; reasonCode: string | null; cancelRequested?: boolean }
export type TourExecution = {
  state: TourState; operationalStatus: TourOperationalStatus | null; assistanceReason: string | null; currentStep: TourStep | null
  currentLegId: string | null; currentLegKind: TourLegKind | null
  /** `RouteRevisionStops.Id`, matching `routeRevision.stops[].id` (absent from older servers, which leaves the stops unmarked). */
  currentRevisionStopId: string | null; lastArrivedRevisionStopId: string | null
  /** When the planned stop at the POI ends; the Tour leaves by itself only with `autoAdvance.enabled`. */
  dwellDeadlineAt: string | null
  /** The command of the current leg, if any. */
  command: TourCommand | null
  /** The Operator's automatic departure switch; `blockedReason` says why this stop's attempt did not leave. */
  autoAdvance?: { enabled: boolean; blockedReason: string | null } | null
}
/** `blockedBy` holds Start check ids, or a state reason code. */
export type TourActionAvailability = { allowed: boolean; reason: string | null; blockedBy: string[] }
/** The recovery actions (ADR-0043) come from servers with M2.2 failure paths; an older response omits them, read as not allowed. */
export type TourAllowedActions = {
  start: TourActionAvailability; next: TourActionAvailability
  endEarly?: TourActionAvailability; retryLeg?: TourActionAvailability; reconcile?: TourActionAvailability
  /** Start without the first leg; `pause` stops the current leg; `skip` skips the POI the robot would go to next. */
  open?: TourActionAvailability; pause?: TourActionAvailability; skip?: TourActionAvailability
}
export type TourStartCheck = { id: string; passed: boolean; source: string; detail: string }
/** `canStart` belongs to the caller: false for any Staff who is not the Tour's Operator. */
/** `opensAt` is the first instant the server accepts Start, which may be before the published time (ADR-0050). */
export type TourStartChecks = { checks: TourStartCheck[]; canStart: boolean; blockedBy: string[]; opensAt?: string | null }
/** The four on-site confirmations of a Start request (SRS §7). */
export type StartConfirmation = { robotPlaced: boolean; areaClear: boolean; attendantPresent: boolean; previewChecked: boolean }
export type TourPhase = 'UPCOMING' | 'RUNNING' | 'FINISHED'
/**
 * `operator: 'me'` keeps the caller's own Tours; `needsReconcile` keeps Tours with an UNKNOWN GoTo; `readyBlockers`
 * adds each SCHEDULED row's READY blockers and is refused by the server above 10 rows a page.
 */
export type TourListQuery = {
  search?: string; state?: TourState; phase?: TourPhase; from?: string; to?: string; sort?: string; page: number; size: number
  operator?: 'me'; needsReconcile?: boolean; readyBlockers?: boolean
}
export type TourSlotReason = 'LEAD_TIME_TOO_SHORT' | 'RESERVATION_OVERLAP' | 'ROUTE_TOO_LONG_FOR_SHIFT' | 'SHIFT_BLOCKED' | 'ROUTE_TEST_REMEASURE_REQUIRED'
/** One shift of one day (docs/lich-tour-theo-ca.md §3): `time` is the Tour start, the reservation is the whole shift. */
export type TourSlot = {
  time: string; startsAt: string; available: boolean; reasonCode: TourSlotReason | null; reason: string | null
  reservationStartsAt: string | null; reservationEndsAt: string | null; registrationClosesAt: string
  shiftCode: string; shiftName: string; maxDurationSeconds: number
}
export type TourSlots = {
  routeRevisionId: string; robotCode: string; measuredDurationSeconds: number | null; expectedDurationSeconds: number | null
  days: { date: string; slots: TourSlot[] }[]
  recommendedMaxSeconds: number
  maxCapacity?: number
}
/** A configured shift on one day, for the calendar before a route or robot is chosen. */
export type TourShift = { code: string; name: string; startsAt: string; endsAt: string; tourStartsAt: string; time: string; maxDurationSeconds: number; block: TourShiftBlock | null }
/** An Admin closure of this shift; `scope` says whether it covers the whole day (docs/lich-tour-theo-ca.md §5). */
export type TourShiftBlock = { id: string; scope: 'DAY' | 'SHIFT'; reason: string }
/** `quickTourWaitMinutes`: how long a quick Tour waits to be started (ADR-0053). */
export type TourShifts = { days: { date: string; shifts: TourShift[] }[]; recommendedMaxSeconds: number; quickTourWaitMinutes: number }
