/**
 * Administration's vocabulary: the enums stay in code, only these labels reach
 * a screen (web/AGENTS.md). Admin names Scheduled "Đang chuẩn bị" because for
 * Admin that is what it is: the Tour is being prepared (registrations,
 * checklist) and is not yet locked.
 */
import { ApiError } from '../../api/client'
import type { AdminErrorBody, RegistrationState, TourState } from '../../api/contracts/admin'
import type { StatusTone } from '../staff/status'

type Entry = { label: string; tone: StatusTone }

export const TOUR_STATE: Record<TourState, Entry> = {
  Scheduled: { label: 'Đang chuẩn bị', tone: 'warn' },
  Ready: { label: 'Sẵn sàng', tone: 'ok' },
  Running: { label: 'Đang diễn ra', tone: 'info' },
  Completed: { label: 'Hoàn thành', tone: 'muted' },
  Cancelled: { label: 'Đã hủy', tone: 'danger' },
}

export const REGISTRATION_STATE: Record<RegistrationState, Entry> = {
  Submitted: { label: 'Chờ duyệt', tone: 'warn' },
  Approved: { label: 'Đã duyệt', tone: 'ok' },
  Rejected: { label: 'Từ chối', tone: 'danger' },
  Cancelled: { label: 'Đã hủy', tone: 'muted' },
}

export const TOUR_STATES = Object.keys(TOUR_STATE) as TourState[]
export const REGISTRATION_STATES = Object.keys(REGISTRATION_STATE) as RegistrationState[]

/** Administration's log entries, on top of the operations vocabulary in `staff/status.ts`. */
export const ADMIN_EVENT_LABEL: Record<string, string> = {
  TourCreated: 'Tạo Tour',
  TourUpdated: 'Sửa thông tin Tour',
  ReadyConfirmed: 'Chốt Tour (Sẵn sàng)',
  TourReopened: 'Mở lại Tour',
  TourCancelled: 'Hủy Tour',
  RegistrationApproved: 'Duyệt đăng ký',
  RegistrationRejected: 'Từ chối đăng ký',
  RosterReplaced: 'Đại diện thay danh sách',
  InvitationSent: 'Gửi thông tin tham gia',
  InvitationFailed: 'Gửi email thất bại',
}

export type AdminError = { status?: number; code?: AdminErrorBody['code']; message: string; fieldErrors: NonNullable<AdminErrorBody['fieldErrors']> }

/**
 * What went wrong, readable. The server's body is JSON `AdminErrorBody`; if
 * it is not (a proxy page, a network error) the fallback is a plain sentence.
 */
export function readAdminError(error: unknown, fallback = 'Không thực hiện được. Kiểm tra kết nối rồi thử lại.'): AdminError {
  if (!(error instanceof ApiError)) return { message: fallback, fieldErrors: {} }
  if (error.status === 403) return { status: 403, code: 'NotAllowed', message: 'Tài khoản hiện tại không có quyền thực hiện thao tác này.', fieldErrors: {} }
  try {
    const body = JSON.parse(error.body) as AdminErrorBody
    return { status: error.status, code: body.code, message: body.message || fallback, fieldErrors: body.fieldErrors ?? {} }
  } catch {
    return { status: error.status, message: error.body || fallback, fieldErrors: {} }
  }
}

export const isStale = (error: unknown) => readAdminError(error).code === 'StaleData'
