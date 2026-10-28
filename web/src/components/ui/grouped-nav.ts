import type { LucideIcon } from 'lucide-react'
import type { NavItem, NavSection } from './nav-types'

/**
 * A sidebar entry as the grouped sidebar draws it: a section with several
 * pages becomes one folding group under the section's name; a section with
 * one page is a plain link.
 */
export type GroupedNavEntry =
  | { kind: 'link'; item: NavItem }
  | { kind: 'group'; key: string; label: string; icon: LucideIcon; items: NavItem[] }
  | { kind: 'heading'; key: string; label: string }

export function groupNavSections(sections: NavSection[], groupIcons: Record<string, LucideIcon> = {}): GroupedNavEntry[] {
  return sections.map((section) =>
    section.items.length > 1 && section.label
      ? { kind: 'group', key: section.label, label: section.label, icon: groupIcons[section.label] ?? section.items[0].icon, items: section.items }
      : { kind: 'link', item: section.items[0] },
  )
}

/**
 * Always-open sections: each labelled section becomes a small heading followed
 * by its pages as plain links, so every page stays one click away.
 */
export function sectionNav(sections: NavSection[]): GroupedNavEntry[] {
  return sections.flatMap((section): GroupedNavEntry[] => [
    ...(section.label ? [{ kind: 'heading' as const, key: section.label, label: section.label }] : []),
    ...section.items.map((item) => ({ kind: 'link' as const, item })),
  ])
}
