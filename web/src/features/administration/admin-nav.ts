import { LayoutDashboard, ShieldCheck, Calendar, Users } from 'lucide-react'
import type { NavItem } from '../staff/staff-nav'

/**
 * Administration navigation.
 *
 * Two entries, because two are what this app can honestly serve today. Users,
 * staff accounts, devices, routes/POIs, configuration and the audit log each
 * need a backend contract that does not exist yet, and a menu item that opens an
 * empty page tells an administrator the system can do something it cannot. They
 * arrive when their endpoints do; `ADMIN_BLOCKED_ON_BACKEND` is the list, shown
 * once on the overview rather than as six dead links.
 */
export const ADMIN_NAV: NavItem[] = [
  { label: 'Tổng quan hệ thống', path: '/admin', icon: LayoutDashboard },
  { label: 'Buổi tham quan', path: '/admin/tours', icon: Calendar },
  { label: 'Tài khoản', path: '/admin/accounts', icon: Users },
  { label: 'Vai trò & quyền', path: '/admin/roles', icon: ShieldCheck },
]

export const ADMIN_BLOCKED_ON_BACKEND = [
  'Thiết bị AMR (cấp phát, cấu hình)',
  'Biên tập tuyến / POI',
  'Cấu hình hệ thống',
  'Nhật ký hoạt động',
] as const
