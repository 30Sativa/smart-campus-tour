import { ApiError } from '../../api/client'
import type { RegistrationInput, RegistrationState, RepresentativeErrorBody, RepresentativeRegistration, TourState } from '../../api/contracts/representative'
import type { StatusTone } from '../staff/status'

/**
 * Words and formats of the representative area. The enums stay in code; only
 * these labels reach a screen (web/AGENTS.md).
 */

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const pad = (n: number) => String(n).padStart(2, '0')

export function formatTime(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(iso: string) {
  const d = new Date(iso)
  return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatShortDate(iso: string) {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatDateTime(iso: string) {
  return `${formatTime(iso)}, ${formatDate(iso)}`
}

export function dayMonth(iso: string) {
  const d = new Date(iso)
  return { day: pad(d.getDate()), month: `Tháng ${d.getMonth() + 1}`, weekday: WEEKDAYS[d.getDay()] }
}

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

export const REGISTRATION_LABEL: Record<RegistrationState, { label: string; tone: StatusTone }> = {
  Submitted: { label: 'Chờ duyệt', tone: 'warn' },
  Approved: { label: 'Đã duyệt', tone: 'ok' },
  Rejected: { label: 'Từ chối', tone: 'danger' },
  Cancelled: { label: 'Đã hủy', tone: 'muted' },
}

export const TOUR_LABEL: Record<TourState, { label: string; tone: StatusTone }> = {
  Scheduled: { label: 'Đang nhận đăng ký', tone: 'info' },
  Ready: { label: 'Đã chốt danh sách', tone: 'muted' },
  Running: { label: 'Đang diễn ra', tone: 'info' },
  Completed: { label: 'Đã hoàn thành', tone: 'muted' },
  Cancelled: { label: 'Buổi đã hủy', tone: 'muted' },
}

/** Display of the optional group/class name. */
export const groupLabel = (r: Pick<RepresentativeRegistration, 'groupName'>) => r.groupName?.trim() || null

/** One line of what happened last, for the dashboard and the list. */
export function lastActivity(r: RepresentativeRegistration): string {
  switch (r.state) {
    case 'Submitted':
      return r.resubmittedAfterApproval ? 'Đã gửi danh sách mới, chờ Admin duyệt lại' : 'Đã gửi đăng ký, chờ Admin duyệt'
    case 'Approved':
      return r.participation?.emailSentAt ? 'Admin đã duyệt và gửi thông tin tham gia' : 'Admin đã duyệt đăng ký'
    case 'Rejected':
      return 'Admin đã từ chối đăng ký'
    default:
      return 'Đăng ký đã hủy'
  }
}

export type RepError = {
  status?: number
  code?: RepresentativeErrorBody['code']
  message: string
  fieldErrors: Partial<Record<keyof RegistrationInput, string>>
}

export function readRepError(error: unknown, fallback = 'Không thực hiện được. Kiểm tra kết nối rồi thử lại.'): RepError {
  if (!(error instanceof ApiError)) return { message: fallback, fieldErrors: {} }
  try {
    const body = JSON.parse(error.body) as RepresentativeErrorBody
    return { status: error.status, code: body.code, message: body.message || fallback, fieldErrors: body.fieldErrors ?? {} }
  } catch {
    return { status: error.status, message: error.body || fallback, fieldErrors: {} }
  }
}

/** The message a representative pastes into the class group chat. Never contains the roster. */
export function studentMessage(p: { tourName: string; scheduledAt: string; joinLink: string; groupCode: string; schoolName: string }) {
  return [
    `CampusTour: ${p.tourName}`,
    `Thời gian: ${formatDateTime(p.scheduledAt)}`,
    `Đường dẫn: ${p.joinLink}`,
    `Mã đoàn: ${p.groupCode}`,
    '',
    `Các em nhập mã đoàn, họ tên và lớp đúng như danh sách ${p.schoolName} đã gửi. Không cần tạo tài khoản.`,
    'Vào trước khoảng 10 phút để kiểm tra loa và kết nối.',
  ].join('\n')
}

/** Filters of "Đăng ký của tôi", keyed by the `?trang-thai=` slug. */
export const REGISTRATION_FILTERS: Array<{ slug: string; label: string; state: RegistrationState | null }> = [
  { slug: 'tat-ca', label: 'Tất cả', state: null },
  { slug: 'cho-duyet', label: 'Chờ duyệt', state: 'Submitted' },
  { slug: 'da-duyet', label: 'Đã duyệt', state: 'Approved' },
  { slug: 'tu-choi', label: 'Từ chối', state: 'Rejected' },
  { slug: 'da-huy', label: 'Đã hủy', state: 'Cancelled' },
]
