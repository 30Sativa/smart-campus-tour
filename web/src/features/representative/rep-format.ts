import { ApiError } from '../../api/client'
import type { RegistrationState, RegistrationSummary, TourState } from './api/types'
import type { StatusTone } from '../../components/ui/status-tone'

/**
 * Words and formats of the representative area. The enums stay in code; only
 * these labels reach a screen (web/AGENTS.md).
 */

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const parts = (iso: string) => Object.fromEntries(dateFormat.formatToParts(new Date(iso)).map(p => [p.type, p.value]))
export function formatTime(iso: string) { const p = parts(iso); return `${p.hour}:${p.minute}` }
export function formatDate(iso: string) { const p = parts(iso); return `${p.weekday}, ${p.day}/${p.month}/${p.year}` }
export function formatShortDate(iso: string) { const p = parts(iso); return `${p.day}/${p.month}/${p.year}` }
export function formatDateTime(iso: string) { return `${formatTime(iso)}, ${formatDate(iso)} (UTC+7)` }
export function dayMonth(iso: string) { const p = parts(iso); return { day: p.day, month: `Tháng ${Number(p.month)}`, weekday: p.weekday } }

/** "5 phút trước", "Hôm qua 14:20", or a date for anything older. */
export function formatRelative(iso: string, now = Date.now()) {
  const diff = now - new Date(iso).getTime()
  const minute = 60_000
  if (diff < minute) return 'Vừa xong'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} phút trước`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} giờ trước`
  if (diff < 2 * 24 * 60 * minute) return `Hôm qua ${formatTime(iso)}`
  return `${formatTime(iso)} ${formatShortDate(iso)}`
}

export const TOUR_LABEL: Record<TourState, { label: string; tone: StatusTone }> = {
  SCHEDULED: { label: 'Đang nhận đăng ký', tone: 'info' },
  READY: { label: 'Đã chốt danh sách', tone: 'muted' },
  RUNNING: { label: 'Đang diễn ra', tone: 'info' },
  COMPLETED: { label: 'Đã hoàn thành', tone: 'muted' },
  CANCELLED: { label: 'Buổi đã hủy', tone: 'muted' },
}

/** Display of the required group name. */
export const groupLabel = (r: Pick<RegistrationSummary, 'groupName'>) => r.groupName?.trim() || null

export type RepError = { status?: number; code?: string; message: string; fieldErrors: Record<string, string> }
export function readRepError(error: unknown, fallback = 'Không thực hiện được. Kiểm tra kết nối rồi thử lại.'): RepError {
  if (!(error instanceof ApiError)) return { message: fallback, fieldErrors: {} }
  try {
    const body = JSON.parse(error.body) as {
      message?: string
      errors?: Record<string, string[]> | { code?: string; fields?: Record<string, string[]> }
    }
    const errors = body.errors
    const conflict = errors && !Array.isArray(errors) && 'code' in errors
    const conflictErrors = conflict ? errors as { code?: string; fields?: Record<string, string[]> } : undefined
    const fields = conflictErrors?.fields ?? (errors && !conflict ? errors as Record<string, string[]> : {})
    const fieldErrors = Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values.join(' ')]))
    return {
      status: error.status,
      code: conflictErrors?.code,
      message: error.status === 400 ? 'Kiểm tra các thông tin chưa hợp lệ.' : body.message || fallback,
      fieldErrors,
    }
  } catch {
    return { status: error.status, message: fallback, fieldErrors: {} }
  }
}

/** Filters of "Đăng ký của tôi", keyed by the `?trang-thai=` slug. */
export const REGISTRATION_FILTERS: Array<{ slug: string; label: string; state: RegistrationState | null }> = [
  { slug: 'tat-ca', label: 'Tất cả', state: null },
  { slug: 'cho-duyet', label: 'Chờ duyệt', state: 'SUBMITTED' },
  { slug: 'da-duyet', label: 'Đã duyệt', state: 'APPROVED' },
  { slug: 'tu-choi', label: 'Từ chối', state: 'REJECTED' },
  { slug: 'da-huy', label: 'Đã hủy', state: 'CANCELLED' },
]
