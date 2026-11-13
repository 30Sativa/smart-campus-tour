import { ALL_ROLES, REPRESENTATIVE_HOME, TECHNICAL_HOME, homePathForRole, isAdminRole, isRepresentativeRole, isStaffRole, isTechnicalRole, normalizeRole, roleLabel } from './roles'

/**
 * The signed-in areas of the product, and who may enter each one.
 *
 * This is deliberately the ONLY place the answer is written down. The router's
 * guard asks `allows()` before rendering an area, and the "Vai trò & quyền"
 * screen renders its matrix by asking the same function. So the screen cannot
 * drift from the guard: if someone changes a rule, the documentation of that
 * rule changes with it, because it is the same call.
 *
 * The server is still the real enforcement, and it is finer-grained: each API
 * action carries its own role check, and a few of them reach outside the
 * caller's area (an Admin can list robots, for instance). This layer only
 * stops a signed-in account from opening the wrong area by typing the URL, and
 * decides what an account is shown.
 */
export type AreaId = 'public' | 'staff' | 'admin' | 'representative' | 'technical'

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
    purpose: 'Giới thiệu và trang xem tour cho người được mời. Không cần đăng nhập.',
    allows: () => true,
  },
  {
    id: 'staff',
    label: 'Vận hành tour',
    path: '/staff',
    purpose: 'Chuẩn bị Tour (tạo Tour, duyệt đăng ký, tuyến, POI) và vận hành: bắt đầu, giữ / đi tiếp tại POI, xử lý sự cố, kết thúc sớm.',
    allows: isStaffRole,
  },
  {
    id: 'admin',
    label: 'Quản trị hệ thống',
    path: '/admin',
    purpose: 'Quản lý tài khoản và vai trò. Không chuẩn bị Tour và không điều khiển robot.',
    allows: isAdminRole,
  },
  {
    id: 'representative',
    label: 'Đăng ký đoàn',
    path: REPRESENTATIVE_HOME,
    purpose: 'Đại diện trường chọn buổi, gửi danh sách Excel, theo dõi duyệt và chia sẻ lời mời cho học sinh.',
    allows: isRepresentativeRole,
  },
  {
    id: 'technical',
    label: 'Kỹ thuật',
    path: TECHNICAL_HOME,
    purpose: 'Quản lý phiên bản bản đồ, nhập POI từ file, kiểm tra tại chỗ và xác nhận chạy thử cho đúng phiên bản bản đồ, POI và tuyến.',
    allows: isTechnicalRole,
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
  if (path.startsWith(REPRESENTATIVE_HOME)) return 'representative'
  if (path.startsWith(TECHNICAL_HOME)) return 'technical'
  return 'public'
}

/**
 * Where a completed sign-in lands.
 *
 * A blocked navigation remembers where it was going, and that memory is honored
 * only when it points into the area this role calls home. Without that test an
 * account that had been bounced off another area (an Admin off `/staff`, say)
 * would sign in and be sent back to a page it cannot open, only for the guard
 * to bounce it again instead of landing it on its own home.
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
