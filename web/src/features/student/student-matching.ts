import type { RosterItem } from './student-types'

/**
 * Chuẩn hóa tên tiếng Việt theo quy định tại Scope Mục 5.2:
 * - Chuyển chữ thường
 * - Khử dấu tiếng Việt
 * - Đồng nhất 'đ'/'Đ' thành 'd'
 * - Gộp các khoảng trắng liên tiếp thành 1 khoảng trắng
 * - Trim hai đầu
 */
export function normalizeStudentName(name: string): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Chuẩn hóa mã lớp: chữ thường, bỏ khoảng trắng thừa
 */
export function normalizeStudentClass(className?: string): string {
  if (!className) return ''
  return className
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

export interface MatchResult {
  isMatch: boolean
  matchedItem?: RosterItem
  errorMessage?: string
}

/**
 * Đối chiếu danh sách học sinh:
 * - So khớp họ tên sau chuẩn hóa
 * - Lớp bắt buộc nếu dòng trong roster có thông tin lớp
 * - Nếu dòng trong roster không có lớp thì học sinh không bắt buộc nhập lớp
 */
export function matchStudentInRoster(
  inputName: string,
  inputClass: string | undefined,
  roster: RosterItem[]
): MatchResult {
  const normInputName = normalizeStudentName(inputName)
  if (!normInputName) {
    return {
      isMatch: false,
      errorMessage: 'Vui lòng nhập họ và tên',
    }
  }

  const normInputClass = normalizeStudentClass(inputClass)

  for (const item of roster) {
    const normItemName = normalizeStudentName(item.hoTen)
    if (normItemName !== normInputName) {
      continue
    }

    // Họ tên đã khớp! Giờ kiểm tra điều kiện lớp:
    const itemHasClass = Boolean(item.lop && item.lop.trim().length > 0)
    if (itemHasClass) {
      const normItemClass = normalizeStudentClass(item.lop)
      // Dòng roster có lớp -> input bắt buộc phải có và khớp lớp
      if (!normInputClass || normInputClass !== normItemClass) {
        continue // Thử tìm dòng khác nếu có trùng tên khác lớp
      }
    }

    // Khớp thành công
    return {
      isMatch: true,
      matchedItem: item,
    }
  }

  // Không khớp bất kỳ dòng nào
  return {
    isMatch: false,
    errorMessage: 'Không thể xác nhận quyền tham gia. Vui lòng liên hệ đại diện.',
  }
}
