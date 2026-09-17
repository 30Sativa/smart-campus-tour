import { isAdminRole, isStaffRole, normalizeRole, roleLabel, STAFF_ROLES } from './roles'

/**
 * The three areas of the product, and who may enter each one.
 *
 * This is deliberately the ONLY place the answer is written down. The router's
 * guard asks `allows()` before rendering an area, and the "Vai trò & quyền"
 * screen renders its matrix by asking the same function. So the screen cannot
 * drift from the guard: if someone changes a rule, the documentation of that
 * rule changes with it, because it is the same call.
 *
 * The server is still the real enforcement. This layer stops a signed-in
 * account from opening the wrong area by typing the URL, and it is what decides
 * what an account is shown.
 */
export type AreaId = 'public' | 'staff' | 'admin'

export type Area = {
  id: AreaId
  label: string
  path: string
  /** What someone does in this area, in one line. */
  purpose: string
  allows: (role?: string | null) => boolean
}

export const AREAS: Area[] = [
  {
    id: 'public',
    label: 'Khu vực công khai',
    path: '/',
    purpose: 'Giới thiệu và trải nghiệm tour. Không cần đăng nhập.',
    allows: () => true,
  },
  {
    id: 'staff',
    label: 'Vận hành tour',
    path: '/staff',
    purpose: 'Theo dõi tour trong ngày, đội AMR và cảnh báo vận hành.',
    allows: isStaffRole,
  },
  {
    id: 'admin',
    label: 'Quản trị hệ thống',
    path: '/admin',
    purpose: 'Tổng quan hệ thống và phạm vi truy cập theo vai trò.',
    allows: isAdminRole,
  },
]

export function areaById(id: AreaId): Area {
  const area = AREAS.find((item) => item.id === id)
  if (!area) throw new Error(`Unknown area: ${id}`)
  return area
}

/** Every role the app can see, visitor included, for the access matrix. */
export const ALL_ROLES = ['Visitor', ...STAFF_ROLES] as const

export function roleRow(role: string) {
  return {
    role: normalizeRole(role),
    label: roleLabel(role),
    areas: AREAS.map((area) => ({ id: area.id, allowed: area.allows(role) })),
  }
}
