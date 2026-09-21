import { Bot, CalendarDays, History, LayoutDashboard, ListChecks, MonitorPlay, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = { label: string; path: string; icon: LucideIcon }
export type NavSection = { label: string | null; items: NavItem[] }

/**
 * Staff navigation: only what an operator does around a remote tour - the
 * day's sessions and their groups, running the live session with the robot,
 * and the log of what happened (scope §2, §11.1).
 *
 * Administration (users, roles, permissions, configuration) is not hidden from
 * this list, it does not belong to it. Those live at `/admin/*` behind their own
 * guard. Kept in its own module so the access matrix can list the area's pages
 * without pulling in the whole shell.
 */
export const STAFF_NAV_SECTIONS: NavSection[] = [
  { label: null, items: [{ label: 'Tổng quan vận hành', path: '/staff', icon: LayoutDashboard }] },
  {
    label: 'Buổi tham quan',
    items: [
      { label: 'Buổi hôm nay', path: '/staff/tours', icon: ListChecks },
      { label: 'Lịch buổi', path: '/staff/schedule', icon: CalendarDays },
    ],
  },
  {
    label: 'Điều hành',
    items: [
      { label: 'Điều hành trực tiếp', path: '/staff/live', icon: MonitorPlay },
      { label: 'Robot & thiết bị', path: '/staff/robot', icon: Bot },
    ],
  },
  {
    label: 'Lịch sử',
    items: [{ label: 'Lịch sử phiên', path: '/staff/history', icon: History }],
  },
]

/** Every page, flat: the shell's page search and the access matrix read this. */
export const STAFF_NAV: NavItem[] = STAFF_NAV_SECTIONS.flatMap((section) => section.items)

/**
 * Which nav item a path belongs to: the longest matching prefix, so
 * a nested path never lights its parent twice, and a Tour opened from anywhere
 * lights "Buổi hôm nay".
 */
export function activeNavPath(pathname: string): string | null {
  if (pathname.startsWith('/staff/tours/')) return '/staff/tours'
  let best: string | null = null
  for (const { path } of STAFF_NAV) {
    const match = path === '/staff' ? pathname === '/staff' || pathname === '/staff/' : pathname === path || pathname.startsWith(`${path}/`)
    if (match && (!best || path.length > best.length)) best = path
  }
  return best
}

/** Icon reused by the shell for the admin cross-link. */
export const ADMIN_LINK_ICON = ShieldCheck
