/**
 * Technical Staff view models (SRS v1.9 §3.2.b "Area Setup & Technical
 * Validation"). Proposed wire shape: docs/contracts/web-backend-api-proposal.md B7.
 * No backend exists yet; `mocks/technical-mock.ts` is the labelled source.
 */
export type CameraAngle = 'LEFT' | 'FRONT' | 'RIGHT'

export type LocalizationPoint = { label: string; errorCm: number }

export type LocalizationCheck = {
  passed: boolean
  /** Mean error measured on site, in centimetres. */
  errorCm: number | null
  points: LocalizationPoint[]
  note: string
  at: string
  by: string
}

export type MapVersionStatus = {
  mapKey: string
  area: string
  /** SHA-256 of the uploaded package, shortened for display. */
  checksum: string
  packageSize: string
  uploadedAt: string
  uploadedBy: string
  changeNote: string
  deployedAt: string | null
  deployedBy: string | null
  deployedRobot: string | null
  /** The version the robot is running now; exactly one at a time. */
  onRobot: boolean
  localization: LocalizationCheck | null
}

export type PoiCheckState = 'VERIFIED' | 'PENDING' | 'FAILED'
export type PoiSource = 'STAFF_PROPOSAL' | 'YAML_IMPORT'

export type PoiCheck = { passed: boolean; errorCm: number | null; note: string; at: string; by: string }

export type TechnicalPoi = {
  id: string
  name: string
  mapKey: string
  x: number
  y: number
  yaw: number
  source: PoiSource
  state: PoiCheckState
  cameraAngle: CameraAngle | null
  revision: number
  lastCheck: PoiCheck | null
}

export type ConfirmationState = 'CONFIRMED' | 'UNCONFIRMED' | 'NEEDS_RECONFIRM'

export type RouteChange = { text: string; affectsMovement: boolean }

export type RouteVersionConfirmation = {
  id: string
  routeName: string
  routeVersion: string
  mapKey: string
  poiCount: number
  /** Stops in tour order, by POI id. */
  stopIds: string[]
  branches: string[]
  changes: RouteChange[]
  previousVersion: string | null
  /** Set when a narration-only change kept an earlier version's confirmation. */
  inheritedFrom: string | null
  /** A scheduled session this version is holding up, in words. */
  blockingSession: string | null
  state: ConfirmationState
  /** Why a version needs (re)confirmation, in words. */
  stateNote: string | null
  confirmedAt: string | null
  confirmedBy: string | null
  testedWith: string | null
  note: string | null
  history: { at: string; text: string }[]
}

export type ActivityKind = 'MAP' | 'POI' | 'ROUTE'

export type TechnicalActivity = { id: string; at: string; by: string; kind: ActivityKind; action: string; target: string; note: string }

export type MapUploadInput = { mapKey: string; area: string; changeNote: string; fileName: string; packageSize: string; checksum: string }
export type DeploymentInput = { mapKey: string; robot: string; checksumMatched: boolean }
export type LocalizationInput = { mapKey: string; passed: boolean; errorCm: number; points: LocalizationPoint[]; note: string }
export type PoiCheckInput = { id: string; passed: boolean; arrived: boolean; framingOk: boolean; cameraAngle: CameraAngle | null; errorCm: number | null; note: string }
export type RouteTestInput = { id: string; operator: string; note: string }
