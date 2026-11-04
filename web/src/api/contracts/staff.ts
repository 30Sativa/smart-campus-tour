/**
 * Vocabulary types of the earlier operations-console design (scope 19/09/2026).
 *
 * Types only. They still describe the local Digital Twin workbench and robot
 * fixtures (`features/digital-twin`). The operations console itself now reads
 * the real Tour API (`features/administration/tours/api/tours.ts`, ADR-0042/0043)
 * and `/hubs/operations` telemetry (`features/staff/operations/`). The former
 * unwired `staffApi` proposal (`/api/staff/tours/*`) was removed with the mock
 * console: it never matched the backend (ADR-0042 open decision 10).
 *
 * The browser never sends an Emergency Stop (web/AGENTS.md §7).
 */

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
