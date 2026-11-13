import { describe, expect, it } from 'vitest'
import type { NavSection } from '../components/ui/nav-types'
import { STAFF_NAV_SECTIONS } from '../features/staff/staff-nav'
import { ADMIN_NAV_SECTIONS } from '../features/administration/admin-nav'
import { TECHNICAL_NAV_SECTIONS } from '../features/technical/technical-nav'
import { NAV_PAGE_PAIRS, type NavPagePair } from './nav-page-titles'

const SECTIONS: Record<NavPagePair['area'], NavSection[]> = { staff: STAFF_NAV_SECTIONS, admin: ADMIN_NAV_SECTIONS, technical: TECHNICAL_NAV_SECTIONS }

const SOURCES = import.meta.glob<string>('../routes/**/*Page.tsx', { query: '?raw', import: 'default', eager: true })

/** The menu entry for a path: its label and the group it sits under. */
function navEntry(pair: NavPagePair) {
  for (const section of SECTIONS[pair.area]) {
    const item = section.items.find(({ path }) => path === pair.path)
    if (item) return { label: item.label, group: section.label }
  }
  return null
}

/** What the page writes as its name, and the line above it (PageHeader only). */
function pageHeading(pair: NavPagePair): { title: string | null; eyebrow: string | null } {
  const source = SOURCES[`../routes/${pair.file}`]
  if (!source) throw new Error(`No page source ${pair.file}`)
  if (pair.heading === 'h1') return { title: source.match(/>([^<>{}]+)<\/h1>/)?.[1]?.trim() ?? null, eyebrow: null }
  const start = source.indexOf('<PageHeader')
  const block = start < 0 ? '' : source.slice(start, source.indexOf('description=', start))
  return { title: block.match(/\btitle="([^"]+)"/)?.[1] ?? null, eyebrow: block.match(/\beyebrow="([^"]+)"/)?.[1] ?? null }
}

function matches(pair: NavPagePair) {
  const entry = navEntry(pair)
  const heading = pageHeading(pair)
  return Boolean(entry) && heading.title === entry?.label && (pair.heading === 'h1' || heading.eyebrow === entry?.group)
}

describe('console menu entries and page names', () => {
  it.each(Object.keys(SECTIONS) as NavPagePair['area'][])('lists every %s menu entry in the pair table', (area) => {
    const listed = NAV_PAGE_PAIRS.filter((pair) => pair.area === area).map((pair) => pair.path)
    expect(listed).toEqual(SECTIONS[area].flatMap((section) => section.items.map((item) => item.path)))
  })

  for (const pair of NAV_PAGE_PAIRS) {
    const entry = navEntry(pair)
    const name = `${pair.path}: page is named "${entry?.label}"${pair.heading === 'PageHeader' ? ` under "${entry?.group}"` : ''}`
    // A pair whose page file belongs to another workstream is a todo until that page says the same as the menu.
    if (pair.pending && !matches(pair)) {
      it.todo(`${name} (${pair.pending} sets it in routes/${pair.file})`)
      continue
    }
    it(name, () => {
      const heading = pageHeading(pair)
      expect(heading.title).toBe(entry?.label)
      if (pair.heading === 'PageHeader') expect(heading.eyebrow).toBe(entry?.group)
    })
  }
})
