import { Bot, CalendarDays, ClipboardCheck, History, LayoutDashboard, MapPinned, MonitorPlay, Route, ShieldCheck } from 'lucide-react'
import { Bot, CalendarDays, ClipboardCheck, ClipboardList, History, LayoutDashboard, MapPinned, MonitorPlay, Route } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { sectionNav, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/**
 * Staff navigation by what a person works on (SRS v1.9 §3.2.c): one home that
 * orders the whole day by urgency, running the Tour with the robot, Tours and
 * the registrations for them, the content Tours are built from (POIs, Routes),
 * and the log of what happened. There is one overview: the former preparation
 * overview (`/staff/manage`) is part of the home. Every section stays open so
 * each page is one click away.
 *
 * Administration (users, roles, permissions, configuration) is not hidden from
 * this list, it does not belong to it. Those live at `/admin/*` behind their own
 * guard. Kept in its own module so the access matrix can list the area's pages
 * without pulling in the whole shell.
 */
/** The registrations entry: the pending queue, which is what its badge counts. */
export const REGISTRATIONS_NAV_PATH = '/staff/manage/registrations/pending'
const REGISTRATIONS_AREA = '/staff/manage/registrations'

export const STAFF_NAV_SECTIONS: NavSection[] = [
  {
    label: 'Vận hành',
    items: [
      { label: 'Tổng quan', path: '/staff', icon: LayoutDashboard },
      { label: 'Điều hành trực tiếp', path: '/staff/live', icon: MonitorPlay },
      { label: 'Robot & thiết bị', path: '/staff/robot', icon: Bot },
    ],
  },
  {
    // Tour preparation is Staff work (SRS v1.9 §3.2.c), moved here from `/admin/*`.
    // Creating a Tour is a page action (home, calendar), not an entry.
    label: 'Tour & đăng ký',
    items: [
      { label: 'Lịch Tour', path: '/staff/schedule', icon: CalendarDays },
      // Opens the queue its badge counts; "Tất cả đăng ký" is a tab of that page.
      { label: 'Đăng ký đoàn', path: REGISTRATIONS_NAV_PATH, icon: ClipboardCheck },
    ],
  },
  {
    // In the order they are made: POIs first, then Routes through them.
    label: 'Nội dung tham quan',
    items: [
      { label: 'Quản lý POI', path: '/staff/manage/pois', icon: MapPinned },
      { label: 'Danh mục tuyến', path: '/staff/manage/routes', icon: Route },
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
  // Both registration views (pending and all) belong to the one entry.
  if (pathname === REGISTRATIONS_AREA || pathname.startsWith(`${REGISTRATIONS_AREA}/`)) return REGISTRATIONS_NAV_PATH
  let best: string | null = null
  for (const { path } of STAFF_NAV) {
    const match = path === '/staff' ? pathname === '/staff' || pathname === '/staff/' : pathname === path || pathname.startsWith(`${path}/`)
    if (match && (!best || path.length > best.length)) best = path
  }
  return best
}

