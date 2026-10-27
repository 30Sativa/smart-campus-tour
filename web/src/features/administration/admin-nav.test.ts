import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, adminActivePath } from './admin-nav'

describe('administration navigation', () => {
  it('lists only administration, nothing that prepares or drives a Tour', () => {
    const labels = ADMIN_NAV.map((item) => item.label).join(' ')
    expect(labels).not.toMatch(/Robot|Điều hành|Fleet|Tour|Đăng ký|Tuyến|POI/i)
  })

  it.each([
    ['/admin/accounts', '/admin/accounts'],
    ['/admin/roles', null],
    ['/admin', null],
  ])('lights the right entry for %s', (path, expected) => {
    expect(adminActivePath(path)).toBe(expected)
  })
})
