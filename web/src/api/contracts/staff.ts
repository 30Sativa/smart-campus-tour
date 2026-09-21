/**
 * Transport contract for the operations console (Staff).
 *
 * Types and endpoint calls only: no React, no query hooks, no fixtures. The
 * feature that consumes this lives in `src/features/staff/`.
 *
 * The TYPES here are live - the fixtures and every screen are written against
 * them. `staffApi`, the HTTP implementation at the bottom, is NOT wired to
 * anything: `/api/staff/*` does not exist, so `staff-hooks.ts` binds the
 * mock implementation of this same type instead. It is kept as the written
 * record of the endpoints this frontend expects. Do not delete it to satisfy a
 * dead-code sweep.
 *
 * Model: "CampusTour DT-AMR — Đặc tả phạm vi" (19/09/2026), remote tours.
 *
 *   TourState          Scheduled → Ready → Running → Completed | Cancelled
 *                      (Ready is Admin "Chốt buổi"; Start is Staff; one run per Tour)
 *   OperationalStatus  Normal | NeedsAssistance (+ Reason), only while Running
 *   Hold               a flag at a POI that stops the automatic Next; not a state
 *
 * One physical robot runs at most one Tour at a time; many school groups watch
 * the same run remotely. The robot is taken at Start, never reserved earlier,
 * and never swapped mid-Tour. Every decision - may this Tour start, is Next
 * allowed, which recovery applies - is the server's (`allowedActions`); the
 * console renders the answer and its reason (web/AGENTS.md §3, scope §4.7/§11.5).
 *
 * The browser never sends an Emergency Stop (web/AGENTS.md §7). End Early is an
 * operational request; the physical stop stays robot-side.
 */
import { apiClient } from '../client'

/* ── Vocabulary ───────────────────────────────────────────────────────────── */

export type TourState = 'Scheduled' | 'Ready' | 'Running' | 'Completed' | 'Cancelled'
export type OperationalStatus = 'Normal' | 'NeedsAssistance'

/** Why a running Tour needs a person. One main reason; the log holds the rest. */
export type AssistanceReason =
  | 'NavigationFailed'
  | 'RobotDisconnected'
  | 'HeadFailure'
  | 'StreamUnavailable'
  | 'CommandUnknown'
  | 'BackendRestarted'

/**
 * Where a running Tour is inside its flow (scope §4, §5.3). A runtime field,
 * not a table.
 */
export type TourStep =
  | 'PreparingStart' // head to FRONT before the first leg
  | 'Navigating' // a leg to a POI is executing
  | 'PreparingView' // stopped at the POI: first head angle + settling
  | 'Observing' // narration + dwell + remaining head angles
  | 'HeldAtPoi' // arrived, observation not started (e.g. stream lost on the way)
  | 'ReturningFront' // visit closed, head back to FRONT before the next leg
  | 'ReturningToEnd' // leg to the end point
  | 'Finished'

export type RegistrationState = 'Submitted' | 'Approved' | 'Rejected' | 'Cancelled'
export type HeadPreset = 'FRONT' | 'LEFT' | 'RIGHT'
export type StopStatus = 'Completed' | 'Current' | 'Upcoming' | 'Skipped'
export type LivestreamState = 'Live' | 'Connecting' | 'Offline'

/** Where robot data comes from. Anything not Physical is labelled on screen. */
export type RobotSource = 'Physical' | 'Gazebo' | 'Emulator'

/** A point in the ROS map frame: metres, yaw in radians. */
export type MapPose = { x: number; y: number; yaw?: number }

/* ── Tours ────────────────────────────────────────────────────────────────── */

export type RosterRow = { name: string; className?: string | null }

/** A school group registered for the Tour. Staff reads it; Admin decides it. */
export type GroupRegistration = {
  id: string
  schoolName: string
  representativeName: string
  state: RegistrationState
  studentCount: number
  invitationSentAt?: string | null
  roster: RosterRow[]
}

export type RouteStop = {
  id: string
  name: string
  position: MapPose
  dwellSeconds: number
  headSteps: HeadPreset[]
  status: StopStatus
  /** Visits so far; a re-run POI after a fault opens a new visit. */
  visits: number
  arrivedAt?: string | null
  closedAt?: string | null
}

/** A command sent to the robot whose outcome the backend is still waiting for. */
export type PendingCommand = {
  kind: 'GoTo' | 'Head' | 'Cancel'
  id: string
  /** What it is for, in the operator's words: "Quay FRONT", "Tới Thư viện". */
  label: string
  sentAt: string
}

export type TourProgress = {
  step: TourStep
  /** Index into `stops` of the POI being approached or visited; null on the return leg. */
  stopIndex: number | null
  legId?: string | null
  visitId?: string | null
  hold: boolean
  dwellEndsAt?: string | null
  headPreset?: HeadPreset | null
  narration: 'Idle' | 'Playing' | 'Stopped'
  pendingCommand?: PendingCommand | null
}

/** One operator action and the server's verdict on it right now. */
export type ActionGate = { allowed: boolean; reason?: string | null }

export type StaffActions = {
  start: ActionGate
  hold: ActionGate
  next: ActionGate
  endEarly: ActionGate
  retryLeg: ActionGate
  rerunPoi: ActionGate
  retryFront: ActionGate
  confirmComplete: ActionGate
}

/** Server-evaluated device checks shown before Start (scope §5.3). */
export type StartCheck = {
  id: 'groupsApproved' | 'robotConnected' | 'robotLocalized' | 'robotFree' | 'headAtFront' | 'batteryMeasured' | 'streamLive'
  passed: boolean
  detail?: string | null
}

export type Livestream = { state: LivestreamState; url?: string | null }

export type TourOperation = {
  id: string
  code: string
  name: string
  routeName: string
  scheduledAt: string
  /** Estimated end, for the schedule only; nothing ends on a clock. */
  estimatedEndAt: string
  state: TourState
  operationalStatus?: OperationalStatus | null
  reason?: AssistanceReason | null
  reasonDetail?: string | null
  /** Why a Scheduled Tour is not Ready yet (Admin's checklist), in words. */
  readyBlockers: string[]
  /** One narration language for the whole system (scope §1). */
  language: string
  registrations: GroupRegistration[]
  robotId?: string | null
  robotName?: string | null
  startedAt?: string | null
  endedAt?: string | null
  endReason?: string | null
  stops: RouteStop[]
  endPoint: { name: string; position: MapPose }
  progress?: TourProgress | null
  livestream: Livestream
  startChecks: StartCheck[]
  allowedActions: StaffActions
  /** Monotonic within one backend epoch; an older snapshot never overwrites a newer one. */
  revision: number
}

export type TourEvent = {
  id: string
  type: string
  detail?: string | null
  occurredAt: string
  actor?: string | null
}

export type TourOperationDetail = TourOperation & { events: TourEvent[] }

export type TourFilters = {
  /** `yyyy-mm-dd`, campus date. Omitted means today. */
  date?: string
  /** Past days only, newest first. */
  history?: boolean
}

/** What Staff may ask of a running Tour. Start is separate: it carries confirmations. */
export type TourCommand = 'hold' | 'next' | 'endEarly' | 'retryLeg' | 'rerunPoi' | 'retryFront' | 'confirmComplete'

/** Physical checks the operator confirms at Start; the server records them. */
export type StartConfirmation = { robotPlaced: boolean; areaClear: boolean; previewChecked: boolean }

/* ── Robot ────────────────────────────────────────────────────────────────── */

/**
 * One robot. The older fields (`operationalState`, `connectionState`,
 * `sensorHealth`) are still read by administration. Optional fields are
 * absent when the robot does not measure them - never filled with a guess.
 */
export type AmrStatus = {
  id: string
  name: string
  operationalState: string
  connectionState: 'Live' | 'Stale' | 'Disconnected' | string
  batteryPercent?: number | null
  latitude?: number | null
  longitude?: number | null
  lastSeenAt?: string | null
  telemetryAgeSeconds?: number | null
  sensorHealth: string
  currentSessionId?: string | null
  currentSessionStatus?: string | null
  currentMissionState?: string | null
  currentPoi?: string | null
  source?: RobotSource
  /** Idle / Navigating / Stopped / Unknown - execution, not the Tour's state. */
  executionState?: 'Idle' | 'Navigating' | 'Stopped' | 'Unknown'
  pose?: MapPose | null
  /** Age of the pose sample itself; a fresh heartbeat does not make a pose fresh. */
  poseAgeSeconds?: number | null
  speedMps?: number | null
  localized?: boolean | null
  headPreset?: HeadPreset | null
  headFault?: boolean | null
  /** Held after End Early / a fault until someone confirms it on site. */
  needsCheck?: boolean
  /** Only real hardware serves Tours; Gazebo/Emulator are for rehearsal and research. */
  assignable?: boolean
  currentTourCode?: string | null
}

/* ── Alerts (administration) ──────────────────────────────────────────────── */

/**
 * Each time a Tour needed assistance, as administration's analytics read it.
 * The operations console does not run an incident workflow (scope §5.6); it
 * shows `reason` on the Tour and keeps the history in the Tour's event log.
 */
export type StaffAlert = {
  id: string
  type: string
  severity: 'Information' | 'Warning' | 'Critical' | string
  message: string
  amrUnitId?: string | null
  amrName?: string | null
  tourSessionId?: string | null
  createdAt: string
  acknowledgedAt?: string | null
  acknowledgedBy?: string | null
  resolutionNote?: string | null
  resolvedAt?: string | null
}

/* ── Reports (administration) ─────────────────────────────────────────────── */

export type FeedbackFilters = {
  from?: string
  to?: string
  routeId?: string
  rating?: string
  status?: string
}

export type FeedbackReport = {
  bookingId: string
  routeName: string
  tourDate: string
  bookingStatus: string
  rating?: number | null
  comment?: string | null
}

/* ── The contract ─────────────────────────────────────────────────────────── */

export type StaffApi = {
  tours(filters?: TourFilters): Promise<TourOperation[]>
  tour(id: string): Promise<TourOperationDetail>
  startTour(id: string, confirmation: StartConfirmation): Promise<TourOperation>
  commandTour(id: string, command: TourCommand, reason?: string): Promise<TourOperation>
  amrs(): Promise<AmrStatus[]>
  confirmRobotReady(robotId: string, note?: string): Promise<AmrStatus>
  alerts(): Promise<StaffAlert[]>
  feedbackReports(filters?: FeedbackFilters): Promise<FeedbackReport[]>
}

function queryString(values: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

const tourPath = (id: string) => `/api/staff/tours/${id}`

export const staffApi: StaffApi = {
  tours: (filters = {}) => apiClient(`/api/staff/tours${queryString({ date: filters.date, history: filters.history ? 'true' : undefined })}`),
  tour: (id) => apiClient(tourPath(id)),
  startTour: (id, confirmation) => apiClient(`${tourPath(id)}/start`, { method: 'POST', json: confirmation }),
  commandTour: (id, command, reason) => apiClient(`${tourPath(id)}/commands/${command}`, { method: 'POST', json: { reason } }),
  amrs: () => apiClient('/api/staff/robots'),
  confirmRobotReady: (robotId, note) => apiClient(`/api/staff/robots/${robotId}/confirm-ready`, { method: 'POST', json: { note } }),
  alerts: () => apiClient('/api/staff/alerts'),
  feedbackReports: (filters = {}) => apiClient(`/api/staff/reports/feedback${queryString(filters)}`),
}
