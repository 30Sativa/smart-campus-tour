import type { TourSummary } from '../../administration/tours/types'
import { campusTime } from '../../administration/tours/tour-calendar'
import type { RunningTour } from './hooks'
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

export const RECONCILE_HEADLINE = 'Tour đã kết thúc, còn lệnh chưa rõ kết quả cần đối soát'
export const RECONCILE_HINT = 'Robot vẫn bị giữ cho đến khi người vận hành đối soát lệnh và Technical Staff kiểm tra tại chỗ.'

/**
 * What needs a person, from real Tours only: a running Tour that needs
 * assistance first, then an ended Tour whose GoTo the server still reports
 * UNKNOWN (`needsReconcile`), then today's READY Tours waiting for Start, then
 * today's Tours not READY yet. Nothing is derived beyond what the server returned.
 */
export function buildAttention(running: RunningTour[], today: TourSummary[], ended: TourSummary[] = []): AttentionItem[] {
  const help = running.filter(({ execution }) => execution?.operationalStatus === 'NEEDS_ASSISTANCE').map(({ tour, execution }): AttentionItem => {
    const reason = assistanceInfo(execution?.assistanceReason)
    return { id: `assist-${tour.id}`, tone: 'danger', subject: tour.name, headline: `Cần hỗ trợ: ${reason.label}`, detail: reason.hint, to: `/staff/live/${tour.id}`, toLabel: 'Mở điều hành' }
  })
  const reconcile = ended.filter(tour => tour.state !== 'RUNNING' && tour.execution?.needsReconcile === true).map((tour): AttentionItem => ({
    id: `reconcile-${tour.id}`, tone: 'danger', subject: tour.name, headline: RECONCILE_HEADLINE, detail: RECONCILE_HINT, to: `/staff/live/${tour.id}`, toLabel: 'Mở để đối soát',
  }))
  const ready = today.filter(tour => tour.state === 'READY').map((tour): AttentionItem => ({
    id: `ready-${tour.id}`, tone: 'info', subject: tour.name, headline: `Đã chốt, giờ bắt đầu ${campusTime(tour.scheduledStartAt)}`, to: `/staff/tours/${tour.id}/start`, toLabel: 'Mở Tour',
  }))
  const scheduled = today.filter(tour => tour.state === 'SCHEDULED').map((tour): AttentionItem => ({
    id: `scheduled-${tour.id}`, tone: 'warn', subject: tour.name, headline: `Chưa chốt, giờ bắt đầu ${campusTime(tour.scheduledStartAt)}`, to: `/staff/manage/tours/${tour.id}`, toLabel: 'Chuẩn bị và chốt',
  }))
  return [...help, ...reconcile, ...ready, ...scheduled]
}
