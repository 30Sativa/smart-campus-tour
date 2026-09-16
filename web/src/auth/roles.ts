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
  const s = raw.trim()
  const lower = s.toLowerCase()
  if (LEGACY_MAP[lower]) return LEGACY_MAP[lower]
  const found = [...STAFF_ROLES, 'Visitor'].find((r) => r.toLowerCase() === lower)
  return found ?? 'Visitor'
}

export function isStaffRole(role?: string | null): boolean {
  return STAFF_ROLES.includes(normalizeRole(role) as StaffRole)
}

export function isAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === 'Admin'
}

export function staffHomePath(role?: string | null): string {
  return isAdminRole(role) ? '/admin' : '/staff'
}
