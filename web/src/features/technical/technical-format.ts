import { ApiError } from '../../api/client'
import type { StatusTone } from '../../components/ui/status-tone'
import type { ConfirmationState } from './types'

export const CONFIRMATION_STATE: Record<ConfirmationState, { label: string; tone: StatusTone }> = {
  CONFIRMED: { label: 'Đã xác nhận', tone: 'ok' },
  UNCONFIRMED: { label: 'Chưa xác nhận', tone: 'muted' },
  NEEDS_RECONFIRM: { label: 'Cần xác nhận lại', tone: 'warn' },
}

export function errorText(error: unknown) {
  if (error instanceof ApiError && error.body) return error.body
  return error instanceof Error ? error.message : 'Không lưu được. Thử lại.'
}

export const stamp = (iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-'
