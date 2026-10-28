import { CheckCheck, FileUp, Map } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { groupNavSections, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/** Technical Staff work only (SRS v1.9 §3.2.c): no Tour preparation, no robot driving. */
export const TECHNICAL_NAV_SECTIONS: NavSection[] = [
  { label: null, items: [{ label: 'Version map', path: '/technical/maps', icon: Map }] },
  { label: null, items: [{ label: 'Kiểm chứng POI', path: '/technical/poi-import', icon: FileUp }] },
  { label: null, items: [{ label: 'Xác nhận kỹ thuật', path: '/technical/confirmations', icon: CheckCheck }] },
]

export const TECHNICAL_NAV: NavItem[] = TECHNICAL_NAV_SECTIONS.flatMap((section) => section.items)
export const TECHNICAL_NAV_ENTRIES: GroupedNavEntry[] = groupNavSections(TECHNICAL_NAV_SECTIONS)

export function technicalActivePath(pathname: string): string | null {
  return TECHNICAL_NAV.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))?.path ?? null
}
