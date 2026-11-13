import { ApiError } from '../../api/client'
import type { RegistrationGroup, RegistrationSummary, TourState } from './api/types'
import type { StatusTone } from '../../components/ui/status-tone'
import { formatDate as sharedDate, formatDateTime as sharedDateTime, formatRelative as sharedRelative, formatTime as sharedTime } from '../../components/ui/date-time'
import type { DateValue } from '../../components/ui/date-time'

/**
 * Words and formats of the representative area. The enums stay in code; only
 * these labels reach a screen (web/AGENTS.md).
 */

// Dates go through the shared campus-time module (components/ui/date-time.ts). These names stay so
// existing imports keep working; they only delegate.
/** "14:30". */
export const formatTime = (iso: DateValue) => sharedTime(iso)
/** "Thứ sáu, 13/11/2026". */
export const formatDate = (iso: DateValue) => sharedDate(iso, { weekday: 'long' })
/** "13/11/2026". */
export const formatShortDate = (iso: DateValue) => sharedDate(iso)
/** "13/11/2026 14:30". */
export const formatDateTime = (iso: DateValue) => sharedDateTime(iso)
export function dayMonth(iso: DateValue) {
  const [day = '', month = ''] = sharedDate(iso).split('/')
  return { day, month: `Tháng ${Number(month)}`, weekday: sharedDate(iso, { weekday: 'long' }).split(',')[0] }
}
/** "5 phút trước", "3 ngày trước", or a date for anything older. */
export const formatRelative = (iso: DateValue, now = Date.now()) => sharedRelative(iso, now)

export const TOUR_LABEL: Record<TourState, { label: string; tone: StatusTone }> = {
  SCHEDULED: { label: 'Đang nhận đăng ký', tone: 'info' },
  READY: { label: 'Đã chốt danh sách', tone: 'muted' },
  RUNNING: { label: 'Đang diễn ra', tone: 'info' },
  COMPLETED: { label: 'Đã hoàn thành', tone: 'muted' },
  CANCELLED: { label: 'Đã hủy', tone: 'muted' },
}

/** Display of the required group name. */
export const groupLabel = (r: Pick<RegistrationSummary, 'groupName'>) => r.groupName?.trim() || null

/** "Đoàn 10A1", without doubling the word when the group name already starts with it. */
export function groupLine(r: Pick<RegistrationSummary, 'groupName'>) {
  const name = groupLabel(r)
  if (!name) return null
  return /^đoàn\s/i.test(name) ? name : `Đoàn ${name}`
}

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

/** 403 or 404: the record is not, or no longer, open to this Representative. Retrying will not change that. */
export function isNotOpenError(error: unknown) {
  const status = readRepError(error).status
  return status === 403 || status === 404
}

/** The two tabs of "Đăng ký của tôi", keyed by the `?nhom=` slug. */
export const REGISTRATION_GROUPS: Array<{ slug: string; label: string; group: RegistrationGroup }> = [
  { slug: 'dang-hoat-dong', label: 'Đang hoạt động', group: 'active' },
  { slug: 'da-huy', label: 'Đã hủy', group: 'closed' },
]

/**
 * The text stored when a registration is still undecided at T-24h. Must stay identical to the reason the backend's
 * expiry writes (ADR-0048). It lives in `rejectionReason`, but nobody refused the registration and it cannot be resubmitted.
 */
const REVIEW_EXPIRED_REASON = 'Hết hạn duyệt trước giờ tham quan 24 giờ.'
export const REVIEW_EXPIRED_LABEL = 'Hết hạn duyệt'
export const REVIEW_EXPIRED_TEXT = 'Hồ sơ chưa được duyệt trước giờ tham quan 24 giờ nên đã hết hạn.'

export const isReviewExpired = (r: Pick<RegistrationSummary, 'state' | 'rejectionReason'>) =>
  r.state === 'REJECTED' && r.rejectionReason?.trim() === REVIEW_EXPIRED_REASON

/**
 * Same rule as the backend's `RegistrationGroups`: a registration has ended when it was cancelled,
 * its Tour was cancelled, or it was refused after the Tour stopped taking changes. A registration that
 * expired at T-24h has also ended, even while its Tour is still SCHEDULED.
 */
export function isClosedRegistration(r: Pick<RegistrationSummary, 'state' | 'tourState' | 'rejectionReason'>) {
  return r.state === 'CANCELLED' || r.tourState === 'CANCELLED' || (r.state === 'REJECTED' && r.tourState !== 'SCHEDULED') || isReviewExpired(r)
}

export type ClosedNote = { badge: string; tone: 'muted' | 'danger'; by: string; reason: string; at: string | null }

/**
 * The text stored when the system cancels a Tour that never started. Must stay identical to
 * `TourAutoCancel.Reason` in backend/src/SmartCampus.Application/Features/Tours/TourAutoCancel.cs.
 */
const SYSTEM_NO_START_REASON = 'Không bắt đầu trong khung giờ, hệ thống tự huỷ.'
const SYSTEM_NO_START_TEXT = 'Buổi tham quan không bắt đầu đúng giờ nên đã bị huỷ. Đại học FPT sẽ liên hệ nếu sắp xếp lại.'

/** The one neutral label a registration of a cancelled Tour carries. */
export const TOUR_CANCELLED_LABEL = 'Buổi đã huỷ'

export const isSystemNoStart = (reason?: string | null) => reason?.trim() === SYSTEM_NO_START_REASON

/** A stored Tour cancel reason as a Representative should read it; null when none was stored. */
export function tourCancelReasonText(reason?: string | null) {
  return isSystemNoStart(reason) ? SYSTEM_NO_START_TEXT : reason?.trim() || null
}

/** Why an ended registration ended, as one kind, so a list can gather records of the same kind. */
export type ClosedKind = 'self-cancelled' | 'tour-no-start' | 'tour-cancelled' | 'review-expired' | 'rejected'
export function closedKind(r: Pick<RegistrationSummary, 'state' | 'tourState' | 'rejectionReason' | 'tourCancelReason'>): ClosedKind {
  if (r.state === 'CANCELLED') return 'self-cancelled'
  if (r.tourState === 'CANCELLED') return isSystemNoStart(r.tourCancelReason) ? 'tour-no-start' : 'tour-cancelled'
  if (isReviewExpired(r)) return 'review-expired'
  return 'rejected'
}

/**
 * Why an ended registration ended, who ended it and when. A cancelled Tour has no `at`: the Representative API
 * does not return when it ended, and the registration's own update time would read as the cancellation time.
 */
export function closedNote(r: RegistrationSummary): ClosedNote {
  if (r.state === 'CANCELLED')
    return { badge: 'Bạn đã hủy', tone: 'muted', by: 'Đại diện', reason: 'Bạn đã hủy đăng ký này.', at: `Hủy lúc ${formatDateTime(r.updatedAt)}` }
  if (r.tourState === 'CANCELLED')
    return { badge: TOUR_CANCELLED_LABEL, tone: 'muted', by: 'Đại học FPT', reason: tourCancelReasonText(r.tourCancelReason) || 'Buổi tham quan đã bị hủy.', at: null }
  if (isReviewExpired(r)) return { badge: REVIEW_EXPIRED_LABEL, tone: 'muted', by: 'Hệ thống', reason: REVIEW_EXPIRED_TEXT, at: null }
  const at = r.reviewedAt ?? r.updatedAt
  return { badge: 'Bị từ chối', tone: 'danger', by: 'Đại học FPT', reason: r.rejectionReason?.trim() || 'Đại học FPT không ghi lý do.', at: `Từ chối lúc ${formatDateTime(at)}` }
}
