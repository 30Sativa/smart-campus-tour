import { ApiError } from '../../api/client'
import type { RegistrationInput, RegistrationState, RepresentativeErrorBody, TourState } from '../../api/contracts/representative'

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

export function formatDateTime(iso: string) {
  return `${formatTime(iso)} · ${formatDate(iso)}`
}

export function dayMonth(iso: string) {
  const d = new Date(iso)
  return { day: pad(d.getDate()), month: `Th${pad(d.getMonth() + 1)}`, weekday: WEEKDAYS[d.getDay()] }
}

export type Tone = 'accent' | 'solid' | 'warn' | 'danger' | 'info' | 'muted' | 'outline'

export const REGISTRATION_LABEL: Record<RegistrationState, { label: string; tone: Tone }> = {
  Submitted: { label: 'Chờ duyệt', tone: 'warn' },
  Approved: { label: 'Đã duyệt', tone: 'accent' },
  Rejected: { label: 'Bị từ chối', tone: 'danger' },
  Cancelled: { label: 'Đã hủy', tone: 'muted' },
}

export const TOUR_LABEL: Record<TourState, { label: string; tone: Tone }> = {
  Scheduled: { label: 'Đang nhận đăng ký', tone: 'info' },
  Ready: { label: 'Đã chốt danh sách', tone: 'solid' },
  Running: { label: 'Đang diễn ra', tone: 'accent' },
  Completed: { label: 'Đã hoàn thành', tone: 'outline' },
  Cancelled: { label: 'Buổi đã hủy', tone: 'muted' },
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

/** The message a representative pastes into the class group chat. */
export function studentMessage(p: { tourName: string; scheduledAt: string; joinLink: string; groupCode: string; schoolName: string }) {
  return [
    `CampusTour · ${p.tourName}`,
    `Thời gian: ${formatDateTime(p.scheduledAt)}`,
    `Đường dẫn: ${p.joinLink}`,
    `Mã đoàn: ${p.groupCode}`,
    '',
    `Các em nhập mã đoàn, họ tên và lớp đúng như danh sách ${p.schoolName} đã gửi. Không cần tạo tài khoản.`,
    'Vào trước khoảng 10 phút để kiểm tra loa và kết nối.',
  ].join('\n')
}
