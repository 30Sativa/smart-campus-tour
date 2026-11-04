import type { TourDetails, TourSummary } from '../../administration/tours/types'
import { campusTime } from '../../administration/tours/tour-calendar'
import { assistanceInfo } from './operation-labels'

export type AttentionItem = {
  id: string
  tone: 'danger' | 'warn' | 'info'
  subject: string
  headline: string
  detail?: string
  to: string
  toLabel: string
}

/**
 * What needs a person, from real Tours only: a running Tour that needs
 * assistance first, then today's READY Tours waiting for Start, then today's
 * Tours not READY yet. Nothing is derived beyond the state the server returned.
 */
export function buildAttention(running: TourDetails[], today: TourSummary[]): AttentionItem[] {
  const help = running.filter(detail => detail.execution?.operationalStatus === 'NEEDS_ASSISTANCE').map((detail): AttentionItem => {
    const reason = assistanceInfo(detail.execution?.assistanceReason)
    return { id: `assist-${detail.tour.id}`, tone: 'danger', subject: detail.tour.name, headline: `Cần hỗ trợ: ${reason.label}`, detail: reason.hint, to: `/staff/live/${detail.tour.id}`, toLabel: 'Mở điều hành' }
  })
  const ready = today.filter(tour => tour.state === 'READY').map((tour): AttentionItem => ({
    id: `ready-${tour.id}`, tone: 'info', subject: tour.name, headline: `Đã chốt, giờ bắt đầu ${campusTime(tour.scheduledStartAt)}`, to: `/staff/tours/${tour.id}/start`, toLabel: 'Kiểm tra trước khi bắt đầu',
  }))
  const scheduled = today.filter(tour => tour.state === 'SCHEDULED').map((tour): AttentionItem => ({
    id: `scheduled-${tour.id}`, tone: 'warn', subject: tour.name, headline: `Chưa chốt, giờ bắt đầu ${campusTime(tour.scheduledStartAt)}`, to: `/staff/manage/tours/${tour.id}`, toLabel: 'Chuẩn bị và chốt',
  }))
  return [...help, ...ready, ...scheduled]
}
