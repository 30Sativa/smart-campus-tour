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
    const subject = [r.tourName, groupLabel(r)].filter(Boolean).join(' · ')
    const to = `/dai-dien/dang-ky/${r.id}`
    const start = new Date(r.tourScheduledStartAt).getTime()

    if (r.tourState === 'CANCELLED') {
      notices.push({ id: `${r.id}:tour-cancelled`, tone: 'bad', title: 'Buổi tham quan đã bị hủy', subject,
        detail: 'Nhà trường đã hủy buổi này. Bạn có thể chọn một buổi khác để đăng ký lại.', at: r.updatedAt, to: '/dai-dien/buoi', toLabel: 'Xem buổi khác' })
      continue
    }
    if (r.state === 'REJECTED') {
      notices.push({ id: `${r.id}:rejected:${r.updatedAt}`, tone: 'bad', title: 'Đơn đăng ký bị từ chối', subject,
        detail: 'Xem lý do, sửa danh sách rồi gửi lại để được duyệt.', at: r.updatedAt, to, toLabel: 'Xem lý do' })
      continue
    }
    if (r.state !== 'APPROVED') continue

    if (r.tourState === 'COMPLETED') {
      notices.push({ id: `${r.id}:completed`, tone: 'mute', title: 'Buổi tham quan đã hoàn thành', subject,
        detail: 'Cảm ơn đoàn đã tham gia cùng robot CampusTour.', at: r.tourScheduledStartAt, to, toLabel: 'Xem đơn' })
      continue
    }
    if (r.tourState === 'RUNNING') {
      notices.push({ id: `${r.id}:running`, tone: 'info', title: 'Buổi tham quan đang diễn ra', subject, pinned: true,
        detail: 'Học sinh vào xem bằng link mời đã gửi cho đoàn.', at: r.tourScheduledStartAt, to, toLabel: 'Xem chi tiết' })
      continue
    }

    notices.push({ id: `${r.id}:approved`, tone: 'ok', title: 'Đơn đăng ký đã được duyệt', subject,
      detail: `Đoàn ${r.rowCount} học sinh đã có chỗ trong buổi tham quan.`, at: r.updatedAt, to, toLabel: 'Xem đơn' })
    if (r.tourState === 'READY')
      notices.push({ id: `${r.id}:ready`, tone: 'info', title: 'Danh sách đoàn đã được chốt', subject,
        detail: 'Nhà trường đã chốt danh sách. Gửi link mời cho học sinh trước giờ bắt đầu.', at: r.updatedAt, to, toLabel: 'Xem link mời' })
    if (start > now && start - now <= DAY)
      notices.push({ id: `${r.id}:soon`, tone: 'warn', title: `Sắp diễn ra lúc ${startLabel(r.tourScheduledStartAt, now)}`, subject, pinned: true,
        detail: 'Nhắc học sinh kiểm tra máy và vào phòng chờ sớm vài phút.', at: new Date(start - DAY).toISOString(), to, toLabel: 'Xem chi tiết' })
  }
  return notices.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.at.localeCompare(a.at))
}
