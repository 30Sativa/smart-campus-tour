import { describe, expect, it } from 'vitest'
import { TECHNICAL_MOVED_PATHS, TECHNICAL_NAV, TECHNICAL_NAV_SECTIONS, technicalActivePath, technicalInternalLink } from './technical-nav'

describe('technical navigation', () => {
  // Regrouped 23/11/2026 from three groups of six entries split by data type into two groups by work.
  it('has two groups, five entries and one Robot entry', () => {
    expect(TECHNICAL_NAV_SECTIONS.map((section) => [section.label, section.items.map((item) => [item.label, item.path])])).toEqual([
      ['Giám sát', [['Tổng quan', '/technical/dashboard'], ['Robot', '/technical/robots']]],
      ['Chuẩn bị', [['Bản đồ', '/technical/maps'], ['POI', '/technical/pois'], ['Chạy thử tuyến', '/technical/route-tests']]],
    ])
    expect(TECHNICAL_NAV.filter((item) => /robot/i.test(item.label))).toHaveLength(1)
    expect(TECHNICAL_NAV.some((item) => item.path === '/technical/monitoring')).toBe(false)
  })

  it.each([
    ['/technical/dashboard', '/technical/dashboard'],
    ['/technical/robots', '/technical/robots'],
    // The monitoring of one robot sits under the Robot entry.
    ['/technical/monitoring', '/technical/robots'],
    ['/technical/maps', '/technical/maps'],
    ['/technical/pois', '/technical/pois'],
    // Importing POI from a file is part of the POI entry.
    ['/technical/pois/import', '/technical/pois'],
    ['/technical/route-tests', '/technical/route-tests'],
    ['/technical/profile', null],
  ])('lights the right entry for %s', (path, expected) => {
    expect(technicalActivePath(path)).toBe(expected)
  })

  it('opens a server link to an old address at its new page with the same query string', () => {
    expect(technicalInternalLink('/technical/poi-import')).toBe('/technical/pois')
    expect(technicalInternalLink('/technical/poi-file-import?map=m-1')).toBe('/technical/pois/import?map=m-1')
    expect(technicalInternalLink('/technical/confirmations#rerun')).toBe('/technical/route-tests#rerun')
    expect(technicalInternalLink('/technical/robots?robot=r1')).toBe('/technical/robots?robot=r1')
    expect(technicalInternalLink('https://example.test/technical/pois')).toBeNull()
    expect(technicalInternalLink(null)).toBeNull()
  })

  it('moves every old address to a page that is in the menu or under it', () => {
    for (const to of Object.values(TECHNICAL_MOVED_PATHS)) expect(technicalActivePath(to)).not.toBeNull()
  })
})

/**
 * No source file links to an address the menu left behind. The old paths may appear only where they are moved:
 * the redirect table in the router and TECHNICAL_MOVED_PATHS, plus tests that prove the move.
 */
describe('no internal link to an old Technical address', () => {
  const SOURCES = import.meta.glob<string>('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const OLD = /\/technical\/(poi-import|poi-file-import|confirmations)\b|['"](poi-import|poi-file-import|confirmations)['"]/
  const ALLOWED = new Set(['../../app/router/index.tsx', './technical-nav.ts'])

  it('finds none in the source tree', () => {
    const files = Object.keys(SOURCES).filter((file) => !/\.test\.tsx?$/.test(file) && !ALLOWED.has(file))
    expect(files.length).toBeGreaterThan(50)
    expect(files.filter((file) => OLD.test(SOURCES[file]))).toEqual([])
  })
})
