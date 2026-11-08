import { ApiError } from '../../api/client'
import type { RegistrationGroup, RegistrationSummary, TourState } from './api/types'
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
  CANCELLED: { label: 'Đã hủy', tone: 'muted' },
}

/** Display of the required group name. */
export const groupLabel = (r: Pick<RegistrationSummary, 'groupName'>) => r.groupName?.trim() || null

export type RepError = { status?: number; code?: string; message: string; fieldErrors: Record<string, string> }
export function readRepError(error: unknown, fallback = 'Không thực hiện được. Kiểm tra kết nối rồi thử lại.'): RepError {
  if ((error instanceof Error || error instanceof DOMException) && error.name === 'TimeoutError') return {
    message: 'Hệ thống chưa phản hồi sau 15 giây. Kiểm tra kết nối hoặc thử tải lại dữ liệu.', fieldErrors: {},
  }
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

/** The two tabs of "Đăng ký của tôi", keyed by the `?nhom=` slug. */
export const REGISTRATION_GROUPS: Array<{ slug: string; label: string; group: RegistrationGroup }> = [
  { slug: 'dang-hoat-dong', label: 'Đang hoạt động', group: 'active' },
  { slug: 'da-huy', label: 'Đã hủy', group: 'closed' },
]

/**
 * Same rule as the backend's `RegistrationGroups`: a registration has ended when it was cancelled,
 * its Tour was cancelled, or it was refused after the Tour stopped taking changes.
 */
export function isClosedRegistration(r: Pick<RegistrationSummary, 'state' | 'tourState'>) {
  return r.state === 'CANCELLED' || r.tourState === 'CANCELLED' || (r.state === 'REJECTED' && r.tourState !== 'SCHEDULED')
}

export type ClosedNote = { badge: string; tone: 'muted' | 'danger'; by: string; reason: string; at: string | null }

/**
 * The text stored when the system cancels a Tour that never started. Must stay identical to
 * `TourAutoCancel.Reason` in backend/src/SmartCampus.Application/Features/Tours/TourAutoCancel.cs.
 */
const SYSTEM_NO_START_REASON = 'Không bắt đầu trong khung giờ, hệ thống tự huỷ.'
const SYSTEM_NO_START_TEXT = 'Buổi tham quan không bắt đầu đúng giờ nên đã bị huỷ. Nhà trường sẽ liên hệ nếu sắp xếp lại.'

export const isSystemNoStart = (reason?: string | null) => reason?.trim() === SYSTEM_NO_START_REASON

/** A stored Tour cancel reason as a Representative should read it; null when none was stored. */
export function tourCancelReasonText(reason?: string | null) {
  return isSystemNoStart(reason) ? SYSTEM_NO_START_TEXT : reason?.trim() || null
}

/**
 * Why an ended registration ended, who ended it and when. A cancelled Tour has no `at`: the Representative API
 * does not return when it ended, and the registration's own update time would read as the cancellation time.
 */
export function closedNote(r: RegistrationSummary): ClosedNote {
  if (r.state === 'CANCELLED')
    return { badge: 'Bạn đã hủy', tone: 'muted', by: 'Đại diện', reason: 'Bạn đã hủy đăng ký này.', at: `Hủy lúc ${formatTime(r.updatedAt)}, ${formatShortDate(r.updatedAt)}` }
  if (r.tourState === 'CANCELLED')
    return { badge: 'Buổi bị hủy', tone: 'danger', by: 'Nhà trường', reason: tourCancelReasonText(r.tourCancelReason) || 'Buổi tham quan đã bị hủy.', at: null }
  const at = r.reviewedAt ?? r.updatedAt
  return { badge: 'Bị từ chối', tone: 'danger', by: 'Nhà trường', reason: r.rejectionReason?.trim() || 'Nhà trường không ghi lý do.', at: `Từ chối lúc ${formatTime(at)}, ${formatShortDate(at)}` }
}
