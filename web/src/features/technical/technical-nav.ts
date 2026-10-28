import { CheckCheck, FileUp, History, LayoutDashboard, Map, MapPin } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { sectionNav, type GroupedNavEntry } from '../../components/ui/grouped-nav'

export const TECHNICAL_ROOT = '/technical'

/**
 * Technical Staff work only (SRS v1.9 §3.2.c): no Tour preparation, no robot driving.
 * Always-open sections in the order evidence is gathered: map, then POIs on
 * it, then the route that strings them together, then the record of it all.
 */
export const TECHNICAL_NAV_SECTIONS: NavSection[] = [
  { label: null, items: [{ label: 'Tổng quan', path: TECHNICAL_ROOT, icon: LayoutDashboard }] },
  { label: 'Bản đồ', items: [{ label: 'Version map', path: '/technical/maps', icon: Map }] },
  { label: 'POI', items: [
    { label: 'Xác minh POI', path: '/technical/pois', icon: MapPin },
    { label: 'Import POI (YAML)', path: '/technical/poi-import', icon: FileUp },
  ] },
  { label: 'Tuyến', items: [{ label: 'Xác nhận tuyến', path: '/technical/confirmations', icon: CheckCheck }] },
  { label: 'Lịch sử', items: [{ label: 'Nhật ký', path: '/technical/activity', icon: History }] },
]

export const TECHNICAL_NAV: NavItem[] = TECHNICAL_NAV_SECTIONS.flatMap((section) => section.items)
export const TECHNICAL_NAV_ENTRIES: GroupedNavEntry[] = sectionNav(TECHNICAL_NAV_SECTIONS)

/** The overview matches only itself; every other page also owns its detail pages. */
export function technicalActivePath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === TECHNICAL_ROOT) return TECHNICAL_ROOT
  return TECHNICAL_NAV.find((item) => item.path !== TECHNICAL_ROOT && (path === item.path || path.startsWith(`${item.path}/`)))?.path ?? null
}
