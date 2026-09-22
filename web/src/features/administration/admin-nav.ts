import { CalendarPlus, ClipboardCheck, History, LayoutDashboard, ListChecks, ListTodo, Route } from 'lucide-react'
import type { NavItem, NavSection } from '../staff/staff-nav'

/**
 * Administration navigation: what Admin does before a Tour starts, and the
 * record afterwards (scope §2, §3, §11.1). Nothing here drives a robot: no
 * live operations, fleet, scenario editor, maintenance or analytics. Those
 * are either Staff's (`/staff/*`) or outside the V1 scope.
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  { label: null, items: [{ label: 'Tổng quan', path: '/admin', icon: LayoutDashboard }] },
  {
    label: 'Quản lý Tour',
    items: [
      { label: 'Danh sách Tour', path: '/admin/tours', icon: ListChecks },
      { label: 'Tạo Tour', path: '/admin/tours/new', icon: CalendarPlus },
    ],
  },
  {
    label: 'Đăng ký đoàn',
    items: [
      { label: 'Chờ duyệt', path: '/admin/registrations/pending', icon: ClipboardCheck },
      { label: 'Tất cả đăng ký', path: '/admin/registrations', icon: ListTodo },
    ],
  },
  { label: 'Tuyến', items: [{ label: 'Danh mục tuyến', path: '/admin/routes', icon: Route }] },
  { label: 'Lịch sử', items: [{ label: 'Lịch sử Tour', path: '/admin/history', icon: History }] },
]

export const ADMIN_NAV: NavItem[] = ADMIN_NAV_SECTIONS.flatMap((section) => section.items)

/**
 * The nav item a path belongs to. Exact match wins; otherwise the longest
 * prefix, except that a Tour page (`/admin/tours/:id…`) lights "Danh sách Tour",
 * not "Tạo Tour".
 */
export function adminActivePath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (ADMIN_NAV.some((item) => item.path === path)) return path
  if (path.startsWith('/admin/tours/')) return '/admin/tours'
  let best: string | null = null
  for (const item of ADMIN_NAV) {
    if (item.path !== '/admin' && path.startsWith(`${item.path}/`) && (!best || item.path.length > best.length)) best = item.path
  }
  return best
}
