/**
 * Roles that may enter `/admin/*`. The role comes from the access token's
 * `role` claim; the server is what actually enforces it.
 */
export const STAFF_ROLES = ['TourOperator', 'CampusStaff', 'Admin'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

const LEGACY_MAP: Record<string, StaffRole> = {
  tour_operator: 'TourOperator',
  'tour operator': 'TourOperator',
  campus_staff: 'CampusStaff',
  'campus staff': 'CampusStaff',
  staff: 'CampusStaff',
  ops: 'CampusStaff',
  operator: 'TourOperator',
}

export function normalizeRole(raw?: string | null): string {
  if (!raw) return 'Visitor'
  const lower = raw.trim().toLowerCase()
  if (LEGACY_MAP[lower]) return LEGACY_MAP[lower]
  return [...STAFF_ROLES, 'Visitor'].find((role) => role.toLowerCase() === lower) ?? 'Visitor'
}

export function isStaffRole(role?: string | null): boolean {
  return STAFF_ROLES.includes(normalizeRole(role) as StaffRole)
}
