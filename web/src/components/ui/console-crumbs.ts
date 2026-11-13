/**
 * The breadcrumb for a console page. `page` is the title the page set (usePageTitle),
 * null before a lazy page mounts; then the menu item stands in for it.
 */
export function consoleCrumbs({ section, entry, page }: { section: string; entry: string | null; page: string | null }): string[] {
  const current = page ?? entry
  const crumbs = [section]
  if (entry && entry !== current && entry !== section) crumbs.push(entry)
  if (current && current !== section) crumbs.push(current)
  return crumbs
}

/** Initials for an account avatar, from a name like "Nguyễn Anh" or "nguyen.anh". */
export function initialsOf(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts.slice(-2).map((part) => part[0]).join('') : name.slice(0, 2)).toUpperCase()
}
