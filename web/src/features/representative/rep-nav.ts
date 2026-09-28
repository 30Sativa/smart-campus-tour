import { CalendarDays, ClipboardList, LayoutDashboard } from 'lucide-react'
import type { NavItem, NavSection } from '../staff/staff-nav'

/**
 * Representative navigation (flow review §4.1): the overview, the Tours a
 * school can join and its own registrations. No account pages: accounts are
 * issued by Admin with the existing mechanism (flow review §10.1).
 */
export const REP_NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { label: 'Tổng quan', path: '/dai-dien', icon: LayoutDashboard },
      { label: 'Buổi tham quan', path: '/dai-dien/buoi', icon: CalendarDays },
      { label: 'Đăng ký của tôi', path: '/dai-dien/dang-ky', icon: ClipboardList },
    ],
  },
]

export const REP_NAV: NavItem[] = REP_NAV_SECTIONS.flatMap((section) => section.items)

/** The nav item a path belongs to: a Tour page lights "Buổi tham quan", a registration "Đăng ký của tôi". */
export function repActivePath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (path === '/dai-dien') return path
  if (path.startsWith('/dai-dien/buoi')) return '/dai-dien/buoi'
  if (path.startsWith('/dai-dien/dang-ky')) return '/dai-dien/dang-ky'
  return null
}
