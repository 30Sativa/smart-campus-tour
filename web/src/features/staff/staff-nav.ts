import { Bot, CalendarDays, ClipboardCheck, ClipboardList, History, LayoutDashboard, MapPinned, MonitorPlay, Route, ShieldCheck } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { sectionNav, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/**
 * Staff navigation in the order of a working day: the day's sessions, running
 * the live session with the robot, preparing Tours (Tours, registrations,
 * Routes, POIs), and the log of what happened (SRS v1.9 §3.2.c). Every section
 * stays open so each page is one click away.
 *
 * Administration (users, roles, permissions, configuration) is not hidden from
 * this list, it does not belong to it. Those live at `/admin/*` behind their own
 * guard. Kept in its own module so the access matrix can list the area's pages
 * without pulling in the whole shell.
 */
export const STAFF_NAV_SECTIONS: NavSection[] = [
  {
    label: 'Vận hành',
    items: [
      { label: 'Tổng quan vận hành', path: '/staff', icon: LayoutDashboard },
      { label: 'Lịch Tour', path: '/staff/schedule', icon: CalendarDays },
      { label: 'Điều hành trực tiếp', path: '/staff/live', icon: MonitorPlay },
      { label: 'Robot & thiết bị', path: '/staff/robot', icon: Bot },
    ],
  },
  {
    // Tour preparation is Staff work (SRS v1.9 §3.2.c), moved here from `/admin/*`.
    label: 'Chuẩn bị Tour',
    items: [
      // Keep creation and registration subviews inside their owning pages.
      { label: 'Tổng quan chuẩn bị', path: '/staff/manage', icon: ClipboardList },
      { label: 'Quản lý POI', path: '/staff/manage/pois', icon: MapPinned },
      { label: 'Danh mục tuyến', path: '/staff/manage/routes', icon: Route },
      { label: 'Đăng ký đoàn', path: '/staff/manage/registrations', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Lịch sử',
    items: [{ label: 'Lịch sử phiên', path: '/staff/history', icon: History }],
  },
]

/** The sidebar's entries: a heading per section, then its pages; nothing folds. */
export const STAFF_NAV_ENTRIES: GroupedNavEntry[] = sectionNav(STAFF_NAV_SECTIONS)

/** Every page, flat: the shell's page search and the access matrix read this. */
export const STAFF_NAV: NavItem[] = STAFF_NAV_SECTIONS.flatMap((section) => section.items)

/**
 * Which nav item a path belongs to: the longest matching prefix, so
 * a nested path never lights its parent twice. A Tour page lights the list it was
 * opened from instead (see operations/tour-origin.ts).
 */
export function activeNavPath(pathname: string): string | null {
  // Creating a Tour starts from the calendar, and the old list address now redirects there.
  if (pathname === '/staff/manage/tours' || pathname.startsWith('/staff/manage/tours/')) return '/staff/schedule'
  let best: string | null = null
  for (const { path } of STAFF_NAV) {
    const match = path === '/staff' ? pathname === '/staff' || pathname === '/staff/' : pathname === path || pathname.startsWith(`${path}/`)
    if (match && (!best || path.length > best.length)) best = path
  }
  return best
}

/** Icon reused by the shell for the admin cross-link. */
export const ADMIN_LINK_ICON = ShieldCheck
