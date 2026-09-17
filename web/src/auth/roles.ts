/**
 * Who may enter which area.
 *
 * The role comes from the access token's `role` claim; the server is what
 * actually enforces it. Everything here is the frontend's second line: it keeps
 * a signed-in account out of an area it has no business in, including by direct
 * URL, and it decides where a fresh sign-in lands.
 *
 * Three areas, three audiences:
 * - public      visitors, no account needed
 * - `/staff/*`  tour operations, for CampusStaff and TourOperator
 * - `/admin/*`  administration, for Admin only
 *
 * Admin is deliberately in STAFF_ROLES as well. That is the policy this app has
 * always had (an Admin could always open the operations dashboard), so it is
 * kept rather than reinvented; the reverse is not true, and an operator cannot
 * reach `/admin/*`.
 */
export const OPERATIONS_ROLES = ['TourOperator', 'CampusStaff'] as const
export const ADMIN_ROLE = 'Admin' as const
export const STAFF_ROLES = [...OPERATIONS_ROLES, ADMIN_ROLE] as const

export type OperationsRole = (typeof OPERATIONS_ROLES)[number]
export type StaffRole = (typeof STAFF_ROLES)[number]

const LEGACY_MAP: Record<string, StaffRole> = {
  tour_operator: 'TourOperator',
  'tour operator': 'TourOperator',
  campus_staff: 'CampusStaff',
  'campus staff': 'CampusStaff',
  staff: 'CampusStaff',
  ops: 'CampusStaff',
  operator: 'TourOperator',
  admin: 'Admin',
}

export function normalizeRole(raw?: string | null): string {
  if (!raw) return 'Visitor'
  const lower = raw.trim().toLowerCase()
  if (LEGACY_MAP[lower]) return LEGACY_MAP[lower]
  return [...STAFF_ROLES, 'Visitor'].find((role) => role.toLowerCase() === lower) ?? 'Visitor'
}

/** May open `/staff/*`. */
export function isStaffRole(role?: string | null): boolean {
  return STAFF_ROLES.includes(normalizeRole(role) as StaffRole)
}

/** May open `/admin/*`. Administration is not part of the operations role. */
export function isAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === ADMIN_ROLE
}

/** Vietnamese name for a role, for anything a person reads. */
export function roleLabel(role?: string | null): string {
  switch (normalizeRole(role)) {
    case 'Admin':
      return 'Quản trị viên'
    case 'CampusStaff':
      return 'Nhân viên khuôn viên'
    case 'TourOperator':
      return 'Điều phối viên tour'
    default:
      return 'Khách tham quan'
  }
}

/**
 * Where a signed-in account belongs. Used right after sign-in and by anything
 * that has to send someone "home", so the rule lives in one place instead of
 * being re-derived at each call site.
 */
export function homePathForRole(role?: string | null): string {
  if (isAdminRole(role)) return '/admin'
  if (isStaffRole(role)) return '/staff'
  return '/'
}
