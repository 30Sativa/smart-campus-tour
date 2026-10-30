import { Bot, CalendarDays, ClipboardCheck, ClipboardList, History, LayoutDashboard, ListChecks, MapPinned, MonitorPlay, Route, ShieldCheck, Headset } from 'lucide-react'
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
      { label: 'Buổi hôm nay', path: '/staff/tours', icon: ListChecks },
      { label: 'Lịch buổi', path: '/staff/schedule', icon: CalendarDays },
      { label: 'Điều hành trực tiếp', path: '/staff/live', icon: MonitorPlay },
      { label: 'Robot & thiết bị', path: '/staff/robot', icon: Bot },
      { label: 'Đàm thoại Quest', path: '/staff/intercom', icon: Headset },
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
      { label: 'Danh sách Tour', path: '/staff/manage/tours', icon: ListChecks },
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
