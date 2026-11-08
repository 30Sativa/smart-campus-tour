import { Activity, Bot, CheckCheck, ClipboardCheck, FileUp, LayoutDashboard, Map } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { sectionNav, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/** Technical Staff work only (SRS v1.9 §3.2.c): no Tour preparation, no robot driving. */
export const TECHNICAL_NAV_SECTIONS: NavSection[] = [
  { label: 'Giám sát', items: [
    { label: 'Tổng quan', path: '/technical/dashboard', icon: LayoutDashboard },
    { label: 'Robot và Mini PC', path: '/technical/monitoring', icon: Activity },
  ] },
  { label: 'Bản đồ', items: [{ label: 'Quản lý bản đồ', path: '/technical/maps', icon: Map }] },
  { label: 'Robot', items: [{ label: 'Robot', path: '/technical/robots', icon: Bot }] },
  { label: 'POI', items: [
    { label: 'Nhập POI từ file', path: '/technical/poi-file-import', icon: FileUp },
    { label: 'Kiểm chứng POI', path: '/technical/poi-import', icon: ClipboardCheck },
  ] },
  { label: 'Tuyến', items: [{ label: 'Xác nhận kỹ thuật', path: '/technical/confirmations', icon: CheckCheck }] },
]

export const TECHNICAL_NAV: NavItem[] = TECHNICAL_NAV_SECTIONS.flatMap((section) => section.items)
export const TECHNICAL_NAV_ENTRIES: GroupedNavEntry[] = sectionNav(TECHNICAL_NAV_SECTIONS)

export function technicalActivePath(pathname: string): string | null {
  return TECHNICAL_NAV.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))?.path ?? null
}
