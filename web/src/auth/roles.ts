/**
 * Who may enter which area.
 *
 * The role comes from the access token's `role` claim; the server is what
 * actually enforces it. Everything here is the frontend's second line: it keeps
 * a signed-in account out of an area it has no business in, including by direct
 * URL, and it decides where a fresh sign-in lands.
 *
 * Three roles, three signed-in areas, and they line up one to one:
 *
 *   Staff    `/staff/*`, tour operations
 *   Admin    `/admin/*`, administration, and `/staff/*` as well
 *
 * The public pages at `/` need no account at all and are open to every role.
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

/** May open `/staff/*`. */
export const STAFF_ROLES = [STAFF_ROLE, ADMIN_ROLE] as const

/**
 * Every role the app knows. The `Visitor` role and its `/visit/*` area were
 * removed on 2026-09-24: students join without an account (`/tour`) and the
 * other accounts are issued by Admin, so nothing signs up as a visitor.
 */
export const ALL_ROLES = [STAFF_ROLE, ADMIN_ROLE, REPRESENTATIVE_ROLE] as const

/** Home of the school representative's area. */
export const REPRESENTATIVE_HOME = '/dai-dien'

export type StaffRole = (typeof STAFF_ROLES)[number]
export type AppRole = (typeof ALL_ROLES)[number]

/**
 * Anything a server, an old token or a URL might spell, mapped onto the current roles.
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
  // Spellings of the current roles.
  staff: STAFF_ROLE,
  admin: ADMIN_ROLE,
  administrator: ADMIN_ROLE,
  representative: REPRESENTATIVE_ROLE,
  'school representative': REPRESENTATIVE_ROLE,
  schoolrepresentative: REPRESENTATIVE_ROLE,
  school_representative: REPRESENTATIVE_ROLE,
  daidien: REPRESENTATIVE_ROLE,
}

/** The role, or null for a missing or unknown one (an old `Visitor` token included): no area opens for it. */
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
 * May Start, Hold, Next, End Early, recover a run or confirm a robot ready.
 *
 * Narrower than `isStaffRole`: Admin may LOOK at `/staff/*` but does not run
 * robots unless the account also holds Staff (scope §2, §2.1 "Cần thêm role
 * Staff"). Tokens here carry one role, so an Admin-only account is read-only
 * in the operations console; the server applies the same rule.
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
    default:
      return 'Tài khoản không có vai trò'
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
  // No area of its own: back to the public page.
  return '/'
}

