import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, adminActivePath } from './admin-nav'

describe('administration navigation', () => {
  it('lists only pre-run work and records, nothing that drives a robot', () => {
    const labels = ADMIN_NAV.map((item) => item.label).join(' ')
    expect(labels).not.toMatch(/Robot|Điều hành|Fleet|Bảo trì|Phân tích/i)
  })

  it.each([
    ['/admin', '/admin'],
    ['/admin/tours', '/admin/tours'],
    ['/admin/tours/new', '/admin/tours/new'],
    ['/admin/tours/tour-03', '/admin/tours'],
    ['/admin/tours/tour-03/edit', '/admin/tours'],
    ['/admin/registrations', '/admin/registrations'],
    ['/admin/registrations/pending', '/admin/registrations/pending'],
    ['/admin/history', '/admin/history'],
    ['/admin/roles', null],
  ])('lights the right entry for %s', (path, expected) => {
    expect(adminActivePath(path)).toBe(expected)
  })
})
