import type { RegistrationSummary } from './api/types'
import { formatShortDate, formatTime, groupLabel } from './rep-format'

export type RepNoticeTone = 'ok' | 'bad' | 'warn' | 'info' | 'mute'

export type RepNotice = {
  /** Stable per event, so "đã đọc" survives refetches. */
  id: string
  tone: RepNoticeTone
  title: string
  /** Which Tour and group the notice is about. */
  subject: string
  detail: string
  /** When the event happened (or, for a reminder, the Tour start). */
  at: string
  /** Reminders stay pinned on top while they apply. */
  pinned?: boolean
  to: string
  toLabel: string
}

const DAY = 24 * 60 * 60 * 1000

function startLabel(iso: string, now: number) {
  const start = new Date(iso)
  const today = new Date(now)
  const sameDay = (a: Date, b: Date) => formatShortDate(a.toISOString()) === formatShortDate(b.toISOString())
  const when = sameDay(start, today) ? 'hôm nay' : sameDay(start, new Date(now + DAY)) ? 'ngày mai' : formatShortDate(iso)
  return `${formatTime(iso)} ${when}`
}

/**
 * What a representative should hear about, derived from their registrations:
 * review results, the Tour being finalised, cancelled, about to start, live,
 * or finished. Their own actions (sending, cancelling) are not notices.
 * Newest first, with an upcoming-start reminder pinned on top.
 */
export function buildRepNotices(rows: readonly RegistrationSummary[], now: number): RepNotice[] {
  const notices: RepNotice[] = []
  for (const r of rows) {
    const subject = [r.tourName, groupLabel(r)].filter(Boolean).join(', ')
    const to = `/dai-dien/dang-ky/${r.id}`
    const start = new Date(r.tourScheduledStartAt).getTime()

    if (r.tourState === 'CANCELLED') {
      notices.push({ id: `${r.id}:tour-cancelled`, tone: 'bad', title: 'Buổi tham quan đã bị hủy', subject,
        detail: `Nhà trường đã hủy buổi này${r.tourCancelReason?.trim() ? `: ${r.tourCancelReason.trim()}` : ''}. Bạn có thể chọn một buổi khác để đăng ký lại.`, at: r.updatedAt, to: '/dai-dien/buoi', toLabel: 'Xem buổi khác' })
      continue
    }
    if (r.state === 'REJECTED') {
      notices.push({ id: `${r.id}:rejected:${r.updatedAt}`, tone: 'bad', title: 'Đơn đăng ký bị từ chối', subject,
        detail: r.tourState === 'SCHEDULED' ? 'Xem lý do và cập nhật khi buổi còn cho phép.' : 'Buổi đã khóa thay đổi. Xem lý do từ chối trong hồ sơ.', at: r.updatedAt, to, toLabel: 'Xem lý do' })
      continue
    }
    if (r.state !== 'APPROVED') continue

    if (r.tourState === 'COMPLETED') {
      notices.push({ id: `${r.id}:completed`, tone: 'mute', title: 'Buổi tham quan đã hoàn thành', subject,
        detail: 'Thông tin buổi và hồ sơ được giữ lại để tra cứu.', at: r.tourScheduledStartAt, to, toLabel: 'Xem đơn' })
      continue
    }
    if (r.tourState === 'RUNNING') {
      notices.push({ id: `${r.id}:running`, tone: 'info', title: 'Buổi tham quan đang diễn ra', subject, pinned: true,
        detail: 'Người xem sử dụng lời mời riêng còn hiệu lực. Kiểm tra trạng thái tại mục Lời mời.', at: r.tourScheduledStartAt, to, toLabel: 'Xem chi tiết' })
      continue
    }

    notices.push({ id: `${r.id}:approved`, tone: 'ok', title: 'Đăng ký có dòng được chấp nhận', subject,
      detail: 'Xem kết quả từng dòng. Quyền truy cập và trạng thái email được theo dõi riêng tại mục Lời mời.', at: r.updatedAt, to, toLabel: 'Xem đơn' })
    if (r.tourState === 'READY')
      notices.push({ id: `${r.id}:ready`, tone: 'info', title: 'Danh sách đoàn đã được chốt', subject,
        detail: 'Kiểm tra hiệu lực mã và trạng thái gửi email của từng lời mời trước buổi.', at: r.updatedAt, to, toLabel: 'Xem lời mời' })
    if (start > now && start - now <= DAY)
      notices.push({ id: `${r.id}:soon`, tone: 'warn', title: `Sắp diễn ra lúc ${startLabel(r.tourScheduledStartAt, now)}`, subject, pinned: true,
        detail: 'Nhắc học sinh kiểm tra máy và vào phòng chờ sớm vài phút.', at: new Date(start - DAY).toISOString(), to, toLabel: 'Xem chi tiết' })
  }
  return notices.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.at.localeCompare(a.at))
}
