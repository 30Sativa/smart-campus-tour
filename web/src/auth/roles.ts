/**
 * Who may enter which area.
 *
 * The role comes from the access token's `role` claim; the server is what
 * actually enforces it. Everything here is the frontend's second line: it keeps
 * a signed-in account out of an area it has no business in, including by direct
 * URL, and it decides where a fresh sign-in lands.
 *
 * Four roles, four signed-in areas, and they line up one to one:
 *
 *   Staff    `/staff/*`, Tour preparation and operations
 *   TechnicalStaff `/technical/*`, map versions and technical confirmation
 *   Admin    `/admin/*`, administration, and `/staff/*` as well
 *   Representative `/dai-dien/*`, a school registers its group (flow review §4)
 *
 * The public pages at `/` and the invited viewer page at `/tour/*` need no
 * account at all. Viewers never sign in (SRS LI-09–14: no viewer accounts or
 * self-registration), so there is no visitor role.
 *
 * Admin is deliberately allowed into `/staff/*`: an administrator can look at
 * the operations console. The reverse is not true, and Admin still *lands* on
 * `/admin` after signing in, because that is the console built for the role.
 *
 * The product once split operations into `CampusStaff` and `TourOperator`. The
 * two never diverged in permissions or in UI, so they are one `Staff` role now.
 * `LEGACY_MAP` keeps reading the old values, so a token minted before the merge
 * still resolves and nobody is locked out by the rename.
 */
export const ADMIN_ROLE = 'Admin' as const
export const STAFF_ROLE = 'Staff' as const
/** School representative: registers a group and manages its roster (flow review §4). */
export const REPRESENTATIVE_ROLE = 'Representative' as const
/** Technical Staff: map versions, POI YAML import, physical checks and version-bound confirmation (SRS v1.9 §3.2.c). */
export const TECHNICAL_ROLE = 'TechnicalStaff' as const

/** May open `/staff/*`. */
export const STAFF_ROLES = [STAFF_ROLE, ADMIN_ROLE] as const

/** Every role an account can sign in with (Auth V1). */
export const ALL_ROLES = [STAFF_ROLE, ADMIN_ROLE, REPRESENTATIVE_ROLE, TECHNICAL_ROLE] as const

/** Home of the Technical Staff area. */
export const TECHNICAL_HOME = '/technical'

/** Home of the school representative's area. */
export const REPRESENTATIVE_HOME = '/dai-dien'

export type StaffRole = (typeof STAFF_ROLES)[number]
export type AppRole = (typeof ALL_ROLES)[number]

/**
 * Anything a server, an old token or a URL might spell, mapped onto the three.
 * Keys are lowercased; `normalizeRole` lowercases before looking up.
 */
const LEGACY_MAP: Record<string, AppRole> = {
  // The two operations roles that were merged into Staff.
  touroperator: STAFF_ROLE,
  tour_operator: STAFF_ROLE,
  'tour operator': STAFF_ROLE,
  campusstaff: STAFF_ROLE,
  campus_staff: STAFF_ROLE,
  'campus staff': STAFF_ROLE,
  operator: STAFF_ROLE,
  ops: STAFF_ROLE,
  // Spellings of the surviving three.
  staff: STAFF_ROLE,
  admin: ADMIN_ROLE,
  administrator: ADMIN_ROLE,
  representative: REPRESENTATIVE_ROLE,
  'school representative': REPRESENTATIVE_ROLE,
  schoolrepresentative: REPRESENTATIVE_ROLE,
  school_representative: REPRESENTATIVE_ROLE,
  daidien: REPRESENTATIVE_ROLE,
  technicalstaff: TECHNICAL_ROLE,
  technical_staff: TECHNICAL_ROLE,
  'technical staff': TECHNICAL_ROLE,
  technician: TECHNICAL_ROLE,
  kythuat: TECHNICAL_ROLE,
}

/** Unknown or missing roles resolve to `null`: no signed-in area, never an accidental grant. */
export function normalizeRole(raw?: string | null): AppRole | null {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()
  return LEGACY_MAP[lower] ?? ALL_ROLES.find((role) => role.toLowerCase() === lower) ?? null
}

/** May open `/staff/*`. */
export function isStaffRole(role?: string | null): boolean {
  return STAFF_ROLES.includes(normalizeRole(role) as StaffRole)
}

/** May open `/admin/*`. Administration is not part of the operations role. */
export function isAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === ADMIN_ROLE
}

/**
 * May open `/dai-dien/*`: register a group, replace its roster, share the
 * invitation. Admin is not let in: Admin does not upload rosters on a school's
 * behalf in V1 (flow review §3.2).
 */
export function isRepresentativeRole(role?: string | null): boolean {
  return normalizeRole(role) === REPRESENTATIVE_ROLE
}

/**
 * May open `/technical/*`. Only Technical Staff: Staff and Admin must not be able
 * to record a technical confirmation (SRS v1.9 demo acceptance 6).
 */
export function isTechnicalRole(role?: string | null): boolean {
  return normalizeRole(role) === TECHNICAL_ROLE
}

/**
 * May Start, Hold, Next, End Early, recover a run or confirm a robot ready.
 *
 * Narrower than `isStaffRole`: Admin may LOOK at `/staff/*` but does not run
 * robots. Auth V1 assigns exactly one application role per account, so an
 * Admin account is read-only in the operations console; the server applies
 * the same rule.
 */
export function canOperateTours(role?: string | null): boolean {
  return normalizeRole(role) === STAFF_ROLE
}

/** Vietnamese name for a role, for anything a person reads. */
export function roleLabel(role?: string | null): string {
  switch (normalizeRole(role)) {
    case ADMIN_ROLE:
      return 'Quản trị viên'
    case STAFF_ROLE:
      return 'Nhân viên vận hành'
    case REPRESENTATIVE_ROLE:
      return 'Đại diện trường'
    case TECHNICAL_ROLE:
      return 'Nhân viên kỹ thuật'
    default:
      return 'Chưa có vai trò'
  }
}

/**
 * The console this role belongs in. Used right after sign-in and by anything
 * that has to send someone "home", so the rule lives in one place instead of
 * being re-derived at each call site.
 */
export function homePathForRole(role?: string | null): string {
  if (isAdminRole(role)) return '/admin'
  if (isStaffRole(role)) return '/staff'
  if (isRepresentativeRole(role)) return REPRESENTATIVE_HOME
  if (isTechnicalRole(role)) return TECHNICAL_HOME
  return '/'
}

