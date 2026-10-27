/**
 * Technical Staff view models (SRS v1.9 §3.2.b "Area Setup & Technical
 * Validation"). Proposed wire shape: docs/contracts/web-backend-api-proposal.md B7.
 * No backend exists yet; `mocks/technical-mock.ts` is the labelled source.
 */
export type LocalizationCheck = { passed: boolean; note: string; at: string; by: string }

export type MapVersionStatus = {
  mapKey: string
  deployedAt: string | null
  deployedBy: string | null
  localization: LocalizationCheck | null
}

export type ConfirmationState = 'CONFIRMED' | 'UNCONFIRMED' | 'NEEDS_RECONFIRM'

export type RouteVersionConfirmation = {
  id: string
  routeName: string
  routeVersion: number
  mapKey: string
  poiCount: number
  state: ConfirmationState
  /** Why a version needs (re)confirmation, in words. */
  stateNote: string | null
  confirmedAt: string | null
  confirmedBy: string | null
  note: string | null
}
