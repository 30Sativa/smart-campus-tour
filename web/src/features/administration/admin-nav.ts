import { CalendarOff, KeyRound, Radio, ScrollText, Server, ShieldAlert, UsersRound } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { sectionNav, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/**
 * Administration is accounts, roles, configuration and audit only (SRS v1.9 §3.2.c).
 * Tour preparation (Tours, registrations, Routes, POIs) belongs to Staff and
 * lives under `/staff/manage/*`.
 *
 * Laid out like the Staff and Technical sidebars: always-open sections under
 * small headings. "Khu vực vận hành" is the way across to `/staff`, which an
 * Admin account also holds.
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  { label: 'Tài khoản', items: [{ label: 'Tài khoản', path: '/admin/accounts', icon: UsersRound }] },
  { label: 'Phân quyền', items: [{ label: 'Vai trò & quyền', path: '/admin/roles', icon: KeyRound }] },
  { label: 'Cấu hình', items: [{ label: 'Lịch vận hành', path: '/admin/schedule-blocks', icon: CalendarOff }] },
  { label: 'Bảo mật robot', items: [{ label: 'Lịch sử khóa robot', path: '/admin/robot-credentials', icon: ShieldAlert }] },
  {
    label: 'Giám sát',
    items: [
      { label: 'Hạ tầng máy chủ', path: '/admin/infrastructure', icon: Server },
      { label: 'Nhật ký hệ thống', path: '/admin/audit-logs', icon: ScrollText },
    ],
  },
  { label: 'Khu vực khác', items: [{ label: 'Khu vực vận hành', path: '/staff', icon: Radio }] },
]

export const ADMIN_NAV: NavItem[] = ADMIN_NAV_SECTIONS.flatMap((section) => section.items)

export const ADMIN_NAV_ENTRIES: GroupedNavEntry[] = sectionNav(ADMIN_NAV_SECTIONS)

export function adminActivePath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  let best: string | null = null
  for (const item of ADMIN_NAV) {
    if ((path === item.path || path.startsWith(`${item.path}/`)) && (!best || item.path.length > best.length)) best = item.path
  }
  return best
}
