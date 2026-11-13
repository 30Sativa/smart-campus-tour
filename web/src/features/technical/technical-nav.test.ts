import { describe, expect, it } from 'vitest'
import { TECHNICAL_NAV, TECHNICAL_NAV_SECTIONS, technicalActivePath } from './technical-nav'

describe('technical navigation', () => {
  it('has three groups and one Robot entry', () => {
    expect(TECHNICAL_NAV_SECTIONS.map((section) => [section.label, section.items.map((item) => item.label)])).toEqual([
      ['Giám sát', ['Tổng quan', 'Robot']],
      ['Bản đồ & POI', ['Bản đồ', 'Nhập POI từ file', 'Kiểm chứng POI']],
      ['Tuyến', ['Xác nhận chạy thử']],
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
    ['/technical/poi-import', '/technical/poi-import'],
    ['/technical/poi-file-import', '/technical/poi-file-import'],
    ['/technical/confirmations', '/technical/confirmations'],
    ['/technical/profile', null],
  ])('lights the right entry for %s', (path, expected) => {
    expect(technicalActivePath(path)).toBe(expected)
  })
})
