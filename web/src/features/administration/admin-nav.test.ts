import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, adminActivePath } from './admin-nav'

describe('administration navigation', () => {
  it('lists account/security administration without adding Tour preparation or control', () => {
    expect(ADMIN_NAV.map((item) => item.label)).toEqual([
      'Tài khoản', 'Vai trò & quyền', 'Lịch vận hành', 'Lịch sử khóa robot', 'Hạ tầng máy chủ', 'Nhật ký hệ thống', 'Khu vực vận hành',
    ])
    expect(ADMIN_NAV.map((item) => item.path)).toEqual([
      '/admin/accounts', '/admin/roles', '/admin/schedule-blocks', '/admin/robot-credentials', '/admin/infrastructure', '/admin/audit-logs', '/staff',
    ])
  })

  it.each([
    ['/admin/accounts', '/admin/accounts'],
    ['/admin/roles', '/admin/roles'],
    ['/admin/robot-credentials', '/admin/robot-credentials'],
    ['/admin/infrastructure', '/admin/infrastructure'],
    ['/admin/audit-logs', '/admin/audit-logs'],
    ['/staff', '/staff'],
    ['/admin', null],
  ])('lights the right entry for %s', (path, expected) => {
    expect(adminActivePath(path)).toBe(expected)
  })
})
