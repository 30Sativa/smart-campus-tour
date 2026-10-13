/**
 * Legacy mock-preview contract for the school representative. Live HTTP types
 * are under `features/representative/api/`; this file remains only for the
 * historical Admin/Staff simulation consumers.
 *
 * Do not use this file to infer the current registration API, ownership or
 * state transitions. It predates the Review 1 live registration slice.
 *
 * Model: screen & user flow review (21/09/2026) §4, §7, §10; scope 19/09/2026 §3.
 *
 *   RegistrationState  (none) → Submitted          send
 *                      Submitted → Submitted       edit before review
 *                      Rejected → Submitted        fix and send again
 *                      Approved → Submitted        replace the roster (review again)
 *                      Cancelled → Submitted       register again
 *                      Submitted | Approved | Rejected → Cancelled
 *   This transition table is retained for the legacy simulation only.
 *
 * Errors. A refused action is an `ApiError` whose body is JSON
 * `RepresentativeErrorBody`:
 *   409 `StaleData`   the registration or Tour changed since it was read
 *   409 `NotAllowed`  the state does not allow it; `message` says why
 *   400 `Validation`  per-field messages in `fieldErrors`
 */
import { apiClient } from '../client'
import type { ActionGate, RegistrationState, RosterRow, TourState } from './staff'

export type { ActionGate, RegistrationState, RosterRow, TourState }

/* ── Tours a representative can see ──────────────────────────────────────── */

export type RepresentativeTour = {
  id: string
  code: string
  name: string
  description: string
  scheduledAt: string
  routeName: string
  /** Names of the stops in visiting order; enough to decide, no robot data. */
  stops: string[]
  state: TourState
  /** Whether this account may send a new registration (or register again). */
  register: ActionGate
  /** This account's registration for the Tour, if any. */
  myRegistrationId: string | null
  myRegistrationState: RegistrationState | null
}

/* ── The representative's own registration ────────────────────────────────── */

export type RepresentativeActions = {
  /** Change school / contact / roster while Submitted or Rejected (Rejected = send again). */
  edit: ActionGate
  /** Replace the roster of an Approved registration; it goes back to review. */
  replaceRoster: ActionGate
  cancel: ActionGate
  /** Register again after cancelling. */
  reRegister: ActionGate
}

/** Given once Admin approves; shared by the representative with the students. */
export type ParticipationInfo = {
  joinLink: string
  groupCode: string
  instructions: string[]
  /** Last time the mail service accepted a send to this representative. Not a read receipt. */
  emailSentAt: string | null
}

export type RepresentativeRegistration = {
  id: string
  tourId: string
  tourCode: string
  tourName: string
  tourState: TourState
  tourScheduledAt: string
  schoolName: string
  /** Optional name of the group or class inside the school ("tên trường/đoàn", scope §3.2). */
  groupName: string | null
  representativeName: string
  contactEmail: string
  state: RegistrationState
  studentCount: number
  /** How many rows carry a class; the join form asks for it only when the row has one. */
  withClassCount: number
  submittedAt: string
  reviewedAt: string | null
  /** Last change to this record by anyone (send, edit, review, cancel). */
  updatedAt: string
  /** Admin's reason. Shown to the representative only, never to students (flow §5.2). */
  rejectionReason: string | null
  resubmittedAfterApproval: boolean
  /** Present only while Approved and the Tour has not ended. */
  participation: ParticipationInfo | null
  allowedActions: RepresentativeActions
  version: number
}

export type RepresentativeRegistrationDetail = RepresentativeRegistration & {
  roster: RosterRow[]
  /** This registration's own milestones, oldest first. */
  history: { at: string; text: string }[]
}

export type RegistrationInput = {
  schoolName: string
  /** Optional; empty string means none. */
  groupName?: string
  representativeName: string
  contactEmail: string
  /** The whole list: an import replaces the roster, it never merges (flow §4.2). */
  roster: RosterRow[]
}

/* ── Errors ───────────────────────────────────────────────────────────────── */

export type RepresentativeErrorCode = 'StaleData' | 'NotAllowed' | 'Validation' | 'NotFound'
export type RepresentativeErrorBody = {
  code: RepresentativeErrorCode
  message: string
  fieldErrors?: Partial<Record<keyof RegistrationInput, string>>
}

/* ── Service ──────────────────────────────────────────────────────────────── */

export type RepresentativeService = {
  listTours(): Promise<RepresentativeTour[]>
  getTour(id: string): Promise<RepresentativeTour>
  listRegistrations(): Promise<RepresentativeRegistration[]>
  getRegistration(id: string): Promise<RepresentativeRegistrationDetail>
  /** First send, or register again after cancelling. `requestId` makes a double submit count once. */
  submit(tourId: string, input: RegistrationInput, requestId: string): Promise<RepresentativeRegistration>
  /** Edit / send again / replace roster, depending on the current state. */
  update(id: string, input: RegistrationInput, version: number): Promise<RepresentativeRegistration>
  cancel(id: string, version: number): Promise<RepresentativeRegistration>
}

/* ── HTTP implementation (not wired; see header) ─────────────────────────── */

const base = '/api/representative'

export const representativeService: RepresentativeService = {
  listTours: () => apiClient(`${base}/tours`),
  getTour: (id) => apiClient(`${base}/tours/${id}`),
  listRegistrations: () => apiClient(`${base}/registrations`),
  getRegistration: (id) => apiClient(`${base}/registrations/${id}`),
  submit: (tourId, input, requestId) =>
    apiClient(`${base}/tours/${tourId}/registration`, { method: 'POST', json: input, headers: { 'Idempotency-Key': requestId } }),
  update: (id, input, version) => apiClient(`${base}/registrations/${id}`, { method: 'PUT', json: { ...input, version } }),
  cancel: (id, version) => apiClient(`${base}/registrations/${id}/cancel`, { method: 'POST', json: { version } }),
}
