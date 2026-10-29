import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, adminActivePath } from './admin-nav'

describe('administration navigation', () => {
  it('lists account/security administration without adding Tour preparation or control', () => {
    expect(ADMIN_NAV.map((item) => item.label)).toEqual([
      'Tài khoản', 'Vai trò & quyền', 'Lịch sử khóa robot', 'Khu vực vận hành',
    ])
    expect(ADMIN_NAV.map((item) => item.path)).toEqual([
      '/admin/accounts', '/admin/roles', '/admin/robot-credentials', '/staff',
    ])
  })

  it.each([
    ['/admin/accounts', '/admin/accounts'],
    ['/admin/roles', '/admin/roles'],
    ['/admin/robot-credentials', '/admin/robot-credentials'],
    ['/staff', '/staff'],
    ['/admin', null],
  ])('lights the right entry for %s', (path, expected) => {
    expect(adminActivePath(path)).toBe(expected)
  })
})
