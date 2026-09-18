import { Bell, CalendarDays, ChartNoAxesCombined, Cuboid, LayoutDashboard, Radio } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = { label: string; path: string; icon: LucideIcon }

/**
 * Staff / operator navigation: only what an operator does during a shift.
 *
 * Administration (users, roles, permissions, configuration) is not hidden from
 * this list, it does not belong to it. Those live at `/admin/*` behind their own
 * guard. Kept in its own module so the access matrix can list the area's pages
 * without pulling in the whole shell.
 */
export const STAFF_NAV: NavItem[] = [
  { label: 'Tổng quan vận hành', path: '/staff', icon: LayoutDashboard },
  { label: 'Lịch tour', path: '/staff/schedule', icon: CalendarDays },
  { label: 'AMR trực tiếp', path: '/staff/amr', icon: Radio },
  { label: 'Cảnh báo', path: '/staff/alerts', icon: Bell },
  { label: 'Digital Twin', path: '/staff/digital-twin', icon: Cuboid },
  { label: 'Báo cáo phản hồi', path: '/staff/reports', icon: ChartNoAxesCombined },
]
