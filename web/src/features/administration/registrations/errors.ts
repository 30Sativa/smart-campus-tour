import { ApiError } from '../../../api/client'

export function reviewError(error: unknown): { message: string; reload: boolean; fields: string[] } {
  const fallback = 'Không thực hiện được. Kiểm tra kết nối rồi thử lại.'
  if (!(error instanceof ApiError)) return { message: fallback, reload: false, fields: [] }
  if (error.status === 401 || error.status === 403) return { message: 'Bạn không có quyền xét duyệt. Vui lòng đăng nhập lại bằng tài khoản quản trị.', reload: false, fields: [] }
  try {
    const body = JSON.parse(error.body) as { message?: string; errors?: { code?: string; fields?: Record<string, string[]> } | Record<string, string[]> }
    const errors = body.errors
    const fields = errors && 'fields' in errors ? errors.fields as Record<string, string[]> | null : errors as Record<string, string[]> | undefined
    return { message: error.status === 400 ? 'Thông tin chưa hợp lệ; kiểm tra lý do hoặc danh sách đăng ký.' : error.status === 409 ? body.message || fallback : fallback,
      reload: error.status === 409, fields: error.status === 400 || error.status === 409 ? Object.values(fields ?? {}).filter(Array.isArray).flat() : [] }
  } catch { return { message: fallback, reload: error.status === 409, fields: [] } }
}
