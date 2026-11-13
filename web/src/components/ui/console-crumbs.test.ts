import { describe, expect, it } from 'vitest'
import { consoleCrumbs, initialsOf } from './console-crumbs'

describe('consoleCrumbs', () => {
  it('names a menu page once, after its group', () => {
    expect(consoleCrumbs({ section: 'Giám sát', entry: 'Tổng quan', page: 'Tổng quan' })).toEqual(['Giám sát', 'Tổng quan'])
  })

  it('shows the page in front, under the menu item it belongs to', () => {
    expect(consoleCrumbs({ section: 'Tour & đăng ký', entry: 'Lịch Tour', page: 'Tạo Tour mới' })).toEqual(['Tour & đăng ký', 'Lịch Tour', 'Tạo Tour mới'])
  })

  it('falls back to the menu item before a lazy page has set its title', () => {
    expect(consoleCrumbs({ section: 'Quản trị', entry: 'Tài khoản', page: null })).toEqual(['Quản trị', 'Tài khoản'])
  })

  it('never repeats the group as the page', () => {
    expect(consoleCrumbs({ section: 'Tài khoản', entry: null, page: 'Hồ sơ của tôi' })).toEqual(['Tài khoản', 'Hồ sơ của tôi'])
    expect(consoleCrumbs({ section: 'Kỹ thuật', entry: null, page: null })).toEqual(['Kỹ thuật'])
  })
})

describe('initialsOf', () => {
  it('takes two letters from a username or a full name', () => {
    expect(initialsOf('staff')).toBe('ST')
    expect(initialsOf('nguyen.anh')).toBe('NA')
  })
})
