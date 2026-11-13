import { Bot, CheckCheck, ClipboardCheck, FileUp, LayoutDashboard, Map } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { sectionNav, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/**
 * Technical Staff work only (SRS v1.9 §3.2.c): no Tour preparation, no robot driving.
 *
 * One "Robot" entry: the robot list, whose "Chi tiết" opens the Robot and Mini PC
 * monitoring of that robot (`/technical/monitoring?robot=<code>`), which lights it too.
 */
export const TECHNICAL_NAV_SECTIONS: NavSection[] = [
  { label: 'Giám sát', items: [
    { label: 'Tổng quan', path: '/technical/dashboard', icon: LayoutDashboard },
    { label: 'Robot', path: '/technical/robots', icon: Bot },
  ] },
  { label: 'Bản đồ & POI', items: [
    { label: 'Bản đồ', path: '/technical/maps', icon: Map },
    { label: 'Nhập POI từ file', path: '/technical/poi-file-import', icon: FileUp },
    { label: 'Kiểm chứng POI', path: '/technical/poi-import', icon: ClipboardCheck },
  ] },
  { label: 'Tuyến', items: [{ label: 'Xác nhận chạy thử', path: '/technical/confirmations', icon: CheckCheck }] },
]

export const TECHNICAL_NAV: NavItem[] = TECHNICAL_NAV_SECTIONS.flatMap((section) => section.items)
export const TECHNICAL_NAV_ENTRIES: GroupedNavEntry[] = sectionNav(TECHNICAL_NAV_SECTIONS)

/** Pages that are not entries of their own, and the entry they sit under. */
const TECHNICAL_SUBPAGES: Record<string, string> = { '/technical/monitoring': '/technical/robots' }

export function technicalActivePath(pathname: string): string | null {
  const within = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  const sub = Object.keys(TECHNICAL_SUBPAGES).find(within)
  if (sub) return TECHNICAL_SUBPAGES[sub]
  return TECHNICAL_NAV.find((item) => within(item.path))?.path ?? null
}
