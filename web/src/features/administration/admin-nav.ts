import { UsersRound } from 'lucide-react'
import type { NavItem, NavSection } from '../../components/ui/nav-types'
import { groupNavSections, type GroupedNavEntry } from '../../components/ui/grouped-nav'

/**
 * Administration is accounts, roles, configuration and audit only (SRS v1.9 §3.2.c).
 * Tour preparation (Tours, registrations, Routes, POIs) belongs to Staff and
 * lives under `/staff/manage/*`.
 */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  { label: 'Quản lý tài khoản', items: [{ label: 'Tài khoản', path: '/admin/accounts', icon: UsersRound }] },
]

export const ADMIN_NAV: NavItem[] = ADMIN_NAV_SECTIONS.flatMap((section) => section.items)

export const ADMIN_NAV_ENTRIES: GroupedNavEntry[] = groupNavSections(ADMIN_NAV_SECTIONS, {})

export function adminActivePath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  let best: string | null = null
  for (const item of ADMIN_NAV) {
    if ((path === item.path || path.startsWith(`${item.path}/`)) && (!best || item.path.length > best.length)) best = item.path
  }
  return best
}
