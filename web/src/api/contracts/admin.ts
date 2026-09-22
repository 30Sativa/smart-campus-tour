/**
 * Transport contract for administration (Admin): Tours, group registrations,
 * participation e-mails and the prepared routes.
 *
 * Same arrangement as `staff.ts`: the TYPES are live - every admin screen is
 * written against them - while the HTTP implementations at the bottom are NOT
 * wired. `/api/admin/*` does not exist yet, so `features/administration/
 * admin-hooks.ts` binds the labelled mock (`src/mocks/admin-mock.ts`) instead.
 * They stay here as the written record of the endpoints this frontend expects.
 *
 * Model: "CampusTour DT-AMR — Đặc tả phạm vi" (19/09/2026) §2, §3, §5.2, §5.5.
 *
 *   TourState          Scheduled → Ready (Admin "Chốt buổi") → Running (Staff Start)
 *                      Ready → Scheduled (Admin "Mở lại", before Start)
 *                      Scheduled | Ready → Cancelled (Admin, with a reason)
 *   RegistrationState  Submitted → Approved | Rejected; Approved + roster edit → Submitted
 *
 * Admin never starts, holds, advances or ends a running Tour, and never
 * touches a robot. Every "may I" is the server's answer (`allowedActions`,
 * `readyChecklist`); the screens render it with its reason.
 *
 * Errors. A refused action is an `ApiError` whose body is JSON `AdminErrorBody`:
 *   409 `StaleData`   the object changed since it was read (version mismatch)
 *   409 `NotAllowed`  the state does not allow it; `message` says why
 *   400 `Validation`  per-field messages in `fieldErrors`
 *   502 `EmailFailed` the mail service refused; the registration stays Approved
 */
import { apiClient } from '../client'
import type { ActionGate, HeadPreset, MapPose, RegistrationState, RosterRow, TourEvent, TourState } from './staff'

export type { ActionGate, RegistrationState, RosterRow, TourEvent, TourState }

/* ── Routes (prepared by the technical team; read-only here) ─────────────── */

export type AdminRouteStop = {
  id: string
  order: number
  name: string
  position: MapPose
  dwellSeconds: number
  headSteps: HeadPreset[]
  /** Name of the prepared narration asset, or null when it is missing. */
  narration: string | null
}

export type AdminRoute = {
  id: string
  name: string
  description: string
  stops: AdminRouteStop[]
  startPoint: { name: string; position: MapPose }
  endPoint: { name: string; position: MapPose } | null
  /** Server verdict: usable for a new Tour and for READY. */
  valid: boolean
  /** Why not, in words. Empty when valid. */
  issues: string[]
  /** Codes of non-terminal Tours using it (config is locked while Ready/Running). */
  usedBy: string[]
}

/* ── Tours ────────────────────────────────────────────────────────────────── */

export type RegistrationCounts = {
  total: number
  submitted: number
  approved: number
  rejected: number
  cancelled: number
}

export type AdminTourActions = {
  edit: ActionGate
  finalize: ActionGate
  reopen: ActionGate
  cancel: ActionGate
}

export type AdminTour = {
  id: string
  code: string
  name: string
  description: string
  scheduledAt: string
  routeId: string
  routeName: string
  state: TourState
  counts: RegistrationCounts
  /** Approved registrations whose participation e-mail has not been sent. */
  invitationsPending: number
  /** Failing READY checks, in words (server-evaluated). Empty unless Scheduled. */
  readyBlockers: string[]
  allowedActions: AdminTourActions
  createdAt: string
  startedAt?: string | null
  endedAt?: string | null
  endReason?: string | null
  /** Concurrency token: send it back with every change. */
  version: number
}

export type ReadyCheckId =
  | 'stateScheduled'
  | 'hasName'
  | 'hasSchedule'
  | 'routeValid'
  | 'hasPoi'
  | 'hasEndPoint'
  | 'poiConfigValid'
  | 'hasApproved'
  | 'rosterNotEmpty'
  | 'noSubmitted'

/** One READY condition (scope §5.2) and what the server saw. */
export type ReadyCheck = { id: ReadyCheckId; label: string; passed: boolean; detail?: string | null }

export type AdminTourDetail = AdminTour & {
  route: AdminRoute | null
  readyChecklist: ReadyCheck[]
  registrations: AdminRegistration[]
  /** Only what the backend logs; nothing is reconstructed on the client. */
  events: TourEvent[]
}

export type AdminTourFilters = {
  q?: string
  state?: TourState
  /** `yyyy-mm-dd`, inclusive, campus date of `scheduledAt`. */
  from?: string
  to?: string
}

export type TourInput = {
  name: string
  /** ISO instant. */
  scheduledAt: string
  description: string
  routeId: string
}

/* ── Registrations ────────────────────────────────────────────────────────── */

export type AdminRegistrationActions = {
  approve: ActionGate
  reject: ActionGate
  sendInvitation: ActionGate
}

export type AdminRegistration = {
  id: string
  tourId: string
  tourCode: string
  tourName: string
  tourState: TourState
  tourScheduledAt: string
  schoolName: string
  representativeName: string
  contactEmail: string
  state: RegistrationState
  studentCount: number
  submittedAt: string
  reviewedAt?: string | null
  reviewedBy?: string | null
  rejectionReason?: string | null
  /** The roster was replaced after an approval, so it came back for review. */
  resubmittedAfterApproval: boolean
  /** Last time the mail service accepted a send. Not a read receipt (scope §3.4). */
  invitationSentAt?: string | null
  /** The last send attempt failed; cleared by a successful send. */
  invitationFailed: boolean
  allowedActions: AdminRegistrationActions
  version: number
}

export type AdminRegistrationDetail = AdminRegistration & {
  /** HoTen + Lop only (scope §3.3). No phone, ID number or student code. */
  roster: RosterRow[]
  groupCode: string
  joinLink: string
}

export type RegistrationFilters = {
  q?: string
  state?: RegistrationState
  tourId?: string
  /** Tour date range, `yyyy-mm-dd`, inclusive. */
  from?: string
  to?: string
}

/* ── Invitations ──────────────────────────────────────────────────────────── */

export type InvitationPreview = {
  registrationId: string
  /** Always the representative's stored address; never chosen in the browser. */
  recipient: string
  subject: string
  tourName: string
  scheduledAt: string
  joinLink: string
  groupCode: string
  instructions: string[]
}

/* ── Errors ───────────────────────────────────────────────────────────────── */

export type AdminErrorCode = 'StaleData' | 'NotAllowed' | 'Validation' | 'EmailFailed' | 'NotFound'
export type AdminErrorBody = { code: AdminErrorCode; message: string; fieldErrors?: Partial<Record<keyof TourInput, string>> }

/* ── The contracts, one service per concern ───────────────────────────────── */

export type AdminTourService = {
  list(filters?: AdminTourFilters): Promise<AdminTour[]>
  get(id: string): Promise<AdminTourDetail>
  /** `requestId` makes a double submit create one Tour, not two (UC-01). */
  create(input: TourInput, requestId: string): Promise<AdminTour>
  update(id: string, input: TourInput, version: number): Promise<AdminTour>
  finalize(id: string, version: number): Promise<AdminTour>
  reopen(id: string, version: number): Promise<AdminTour>
  cancel(id: string, reason: string, version: number): Promise<AdminTour>
}

export type AdminRegistrationService = {
  list(filters?: RegistrationFilters): Promise<AdminRegistration[]>
  get(id: string): Promise<AdminRegistrationDetail>
  approve(id: string, version: number): Promise<AdminRegistration>
  reject(id: string, reason: string, version: number): Promise<AdminRegistration>
}

export type AdminInvitationService = {
  preview(registrationId: string): Promise<InvitationPreview>
  send(registrationId: string): Promise<AdminRegistration>
}

export type AdminRouteService = {
  list(): Promise<AdminRoute[]>
}

/* ── HTTP implementations (not wired; see header) ─────────────────────────── */

function queryString(values: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value)
  const text = query.toString()
  return text ? `?${text}` : ''
}

const tourPath = (id: string) => `/api/admin/tours/${id}`
const registrationPath = (id: string) => `/api/admin/registrations/${id}`

export const adminTourService: AdminTourService = {
  list: (filters = {}) => apiClient(`/api/admin/tours${queryString(filters)}`),
  get: (id) => apiClient(tourPath(id)),
  create: (input, requestId) => apiClient('/api/admin/tours', { method: 'POST', json: input, headers: { 'Idempotency-Key': requestId } }),
  update: (id, input, version) => apiClient(tourPath(id), { method: 'PUT', json: { ...input, version } }),
  finalize: (id, version) => apiClient(`${tourPath(id)}/finalize`, { method: 'POST', json: { version } }),
  reopen: (id, version) => apiClient(`${tourPath(id)}/reopen`, { method: 'POST', json: { version } }),
  cancel: (id, reason, version) => apiClient(`${tourPath(id)}/cancel`, { method: 'POST', json: { reason, version } }),
}

export const adminRegistrationService: AdminRegistrationService = {
  list: (filters = {}) => apiClient(`/api/admin/registrations${queryString(filters)}`),
  get: (id) => apiClient(registrationPath(id)),
  approve: (id, version) => apiClient(`${registrationPath(id)}/approve`, { method: 'POST', json: { version } }),
  reject: (id, reason, version) => apiClient(`${registrationPath(id)}/reject`, { method: 'POST', json: { reason, version } }),
}

export const adminInvitationService: AdminInvitationService = {
  preview: (registrationId) => apiClient(`${registrationPath(registrationId)}/invitation`),
  send: (registrationId) => apiClient(`${registrationPath(registrationId)}/invitation/send`, { method: 'POST' }),
}

export const adminRouteService: AdminRouteService = {
  list: () => apiClient('/api/admin/routes'),
}
