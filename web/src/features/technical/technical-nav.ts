import { Bot, LayoutDashboard, Map, MapPin, Route } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { sectionNav, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/**
 * Technical Staff work only (SRS v1.9 §3.2.c): no Tour preparation, no robot driving.
 *
 * One "Robot" entry: the robot list, whose "Chi tiết" opens the Robot and Mini PC
 * monitoring of that robot (`/technical/monitoring?robot=<code>`), which lights it too.
 * One "POI" entry: POI verification, whose "Nhập từ file" (`/technical/pois/import`) lights it too.
 */
export const TECHNICAL_NAV_SECTIONS: NavSection[] = [
  { label: 'Giám sát', items: [
    { label: 'Tổng quan', path: '/technical/dashboard', icon: LayoutDashboard },
    { label: 'Robot', path: '/technical/robots', icon: Bot },
  ] },
  { label: 'Chuẩn bị', items: [
    { label: 'Bản đồ', path: '/technical/maps', icon: Map },
    { label: 'POI', path: '/technical/pois', icon: MapPin },
    { label: 'Chạy thử tuyến', path: '/technical/route-tests', icon: Route },
  ] },
]

export const TECHNICAL_NAV: NavItem[] = TECHNICAL_NAV_SECTIONS.flatMap((section) => section.items)
export const TECHNICAL_NAV_ENTRIES: GroupedNavEntry[] = sectionNav(TECHNICAL_NAV_SECTIONS)

/** Pages that are not entries of their own, and the entry they sit under. */
const TECHNICAL_SUBPAGES: Record<string, string> = { '/technical/monitoring': '/technical/robots' }

/** Addresses used before the menu was regrouped (23/11/2026); bookmarks and server links still name them. */
export const TECHNICAL_MOVED_PATHS: Record<string, string> = {
  '/technical/poi-import': '/technical/pois',
  '/technical/poi-file-import': '/technical/pois/import',
  '/technical/confirmations': '/technical/route-tests',
}

export function technicalActivePath(pathname: string): string | null {
  const within = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  const sub = Object.keys(TECHNICAL_SUBPAGES).find(within)
  if (sub) return TECHNICAL_SUBPAGES[sub]
  return TECHNICAL_NAV.find((item) => within(item.path))?.path ?? null
}

/**
 * A link the server sent for a Technical work item. Only links into this area are followed (anything else is
 * shown as text); an old address is rewritten to its new page, keeping the query string.
 */
export function technicalInternalLink(url: string | null): string | null {
  if (!url?.startsWith('/technical/')) return null
  const [path, query] = url.split(/(?=[?#])/, 2)
  return `${TECHNICAL_MOVED_PATHS[path] ?? path}${query ?? ''}`
}
