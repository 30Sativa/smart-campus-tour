import { describe, expect, it } from 'vitest'
import {
  matchStudentInRoster,
  normalizeStudentClass,
  normalizeStudentName,
} from './student-matching'
import type { RosterItem } from './student-types'

describe('student matching logic (Scope Mục 5.2)', () => {
  it('normalizes Vietnamese names correctly (bỏ dấu, thường hóa, đ/d, khoảng trắng)', () => {
    expect(normalizeStudentName('Nguyễn Văn An')).toBe('nguyen van an')
    expect(normalizeStudentName('  ĐỖ   QUỐC   BẢO  ')).toBe('do quoc bao')
    expect(normalizeStudentName('Trần Thị   Mai  ')).toBe('tran thi mai')
    expect(normalizeStudentName('')).toBe('')
  })

  it('normalizes class names', () => {
    expect(normalizeStudentClass(' 12A1 ')).toBe('12a1')
    expect(normalizeStudentClass('10 c 2')).toBe('10c2')
    expect(normalizeStudentClass(undefined)).toBe('')
  })

  const sampleRoster: RosterItem[] = [
    { hoTen: 'Nguyễn Văn An', lop: '12A1' },
    { hoTen: 'Trần Thị Mai', lop: '12A1' },
    { hoTen: 'Lê Hoàng Nam', lop: '12A2' },
    { hoTen: 'Võ Quốc Bảo' }, // Dòng không có lớp
  ]

  it('matches exactly with accentless, case-insensitive name and matching class', () => {
    const res = matchStudentInRoster('nguyen van an', '12a1', sampleRoster)
    expect(res.isMatch).toBe(true)
    expect(res.matchedItem?.hoTen).toBe('Nguyễn Văn An')
  })

  it('matches when roster row has no class even if input class is omitted', () => {
    const res = matchStudentInRoster('Vo Quoc Bao', undefined, sampleRoster)
    expect(res.isMatch).toBe(true)
    expect(res.matchedItem?.hoTen).toBe('Võ Quốc Bảo')
  })

  it('fails if roster row has class but input omitted or has different class', () => {
    // Nguyen Van An is in 12A1, not 12A2
    const res1 = matchStudentInRoster('Nguyễn Văn An', '12A2', sampleRoster)
    expect(res1.isMatch).toBe(false)
    expect(res1.errorMessage).toBe('Không thể xác nhận quyền tham gia. Vui lòng liên hệ đại diện.')

    // Class omitted when roster requires 12A1
    const res2 = matchStudentInRoster('Nguyễn Văn An', '', sampleRoster)
    expect(res2.isMatch).toBe(false)
  })

  it('fails if name is not found in roster with generic security message', () => {
    const res = matchStudentInRoster('Học Sinh Không Có Tên', '12A1', sampleRoster)
    expect(res.isMatch).toBe(false)
    expect(res.errorMessage).toBe('Không thể xác nhận quyền tham gia. Vui lòng liên hệ đại diện.')
  })

  it('requires name to be entered', () => {
    const res = matchStudentInRoster('', '12A1', sampleRoster)
    expect(res.isMatch).toBe(false)
    expect(res.errorMessage).toBe('Vui lòng nhập họ và tên')
  })
})
