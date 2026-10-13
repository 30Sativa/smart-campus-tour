import { ApiError } from '../../../api/client'

export function emailCorrectionError(error: unknown): { message: string; reload: boolean; uncertain: boolean } {
  const uncertain = { message: 'Chưa xác nhận được kết quả. Thử lại cùng yêu cầu để tránh cấp mã hai lần.', reload: false, uncertain: true }
  if (!(error instanceof ApiError) || error.status >= 500) return uncertain
  if (error.status === 401 || error.status === 403)
    return { message: 'Chỉ quản trị viên được sửa email. Vui lòng đăng nhập bằng tài khoản Admin.', reload: true, uncertain: false }
  if (error.status === 404) return { message: 'Dòng đăng ký không còn tồn tại. Tải lại danh sách.', reload: true, uncertain: false }
  try {
    const body = JSON.parse(error.body) as { message?: string; errors?: { code?: string } }
    if (error.status === 400) return { message: 'Email hoặc phiên bản dữ liệu không hợp lệ. Kiểm tra email đã nhập.', reload: false, uncertain: false }
    if (body.errors?.code === 'EMAIL_RESERVED') return { message: 'Email đã được đăng ký trong danh sách hoặc Tour này. Nhập email khác.', reload: false, uncertain: false }
    if (body.errors?.code === 'EMAIL_UNCHANGED') return { message: 'Email mới phải khác email hiện tại.', reload: false, uncertain: false }
    return { message: body.message ?? 'Dữ liệu đã thay đổi. Tải lại trước khi sửa email.', reload: true, uncertain: false }
  } catch { return { message: 'Không thực hiện được. Tải lại để kiểm tra dữ liệu và quyền sửa.', reload: true, uncertain: false } }
}
