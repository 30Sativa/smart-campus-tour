import { ApiError } from '../../api/client'

export function errorText(error: unknown) {
  if (error instanceof ApiError && error.body) return error.body
  return error instanceof Error ? error.message : 'Không lưu được. Thử lại.'
}

export const stamp = (iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-'
