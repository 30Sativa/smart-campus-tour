import { ALL_ROLES, VISITOR_HOME, homePathForRole, isAdminRole, isStaffRole, isVisitorAreaRole, normalizeRole, roleLabel } from './roles'

/**
 * The four areas of the product, and who may enter each one.
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
export type AreaId = 'public' | 'visitor' | 'staff' | 'admin'

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
    id: 'visitor',
    label: 'Ứng dụng khách tham quan',
    path: VISITOR_HOME,
    purpose: 'Khám phá khuôn viên, đặt robot và theo dõi tour của chính mình. Cần đăng nhập.',
    allows: isVisitorAreaRole,
  },
  {
    id: 'staff',
    label: 'Vận hành tour',
    path: '/staff',
    purpose: 'Kiểm tra và bắt đầu Tour đã chốt, giữ / đi tiếp tại POI, xử lý sự cố, kết thúc sớm. Quản trị viên chỉ xem.',
    allows: isStaffRole,
  },
  {
    id: 'admin',
    label: 'Quản trị Tour',
    path: '/admin',
    purpose: 'Tạo Tour, duyệt đoàn đăng ký, gửi thông tin tham gia, Chốt / Mở lại / Hủy Tour trước khi chạy. Không điều khiển robot.',
    allows: isAdminRole,
  },
]

export function areaById(id: AreaId): Area {
  const area = AREAS.find((item) => item.id === id)
  if (!area) throw new Error(`Unknown area: ${id}`)
  return area
}

/** Re-exported so the access matrix has one import for everything it draws. */
export { ALL_ROLES }

/** Which area a path belongs to, by prefix. */
function areaOfPath(path: string): AreaId {
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/staff')) return 'staff'
  if (path.startsWith(VISITOR_HOME)) return 'visitor'
  return 'public'
}

/**
 * Where a completed sign-in lands.
 *
 * A blocked navigation remembers where it was going, and that memory is honored
 * only when it points into the area this role calls home. Without that test an
 * administrator who had been bounced off `/staff` would sign in and land back on
 * the operations console: Admin is allowed there, so nothing would send them on
 * to `/admin`, and the administration dashboard would look missing.
 */
export function landingPathAfterLogin(role: string | null | undefined, from?: string | null): string {
  const home = homePathForRole(role)
  if (!from || !from.startsWith('/')) return home
  return areaOfPath(from) === areaOfPath(home) ? from : home
}

export function roleRow(role: string) {
  return {
    role: normalizeRole(role),
    label: roleLabel(role),
    areas: AREAS.map((area) => ({ id: area.id, allowed: area.allows(role) })),
  }
}
