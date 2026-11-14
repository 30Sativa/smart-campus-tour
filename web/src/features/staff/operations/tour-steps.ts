import type { TourDetails } from '../../administration/tours/types'

export type TourPageKind = 'prepare' | 'start' | 'live'
export type StepStatus = 'done' | 'current' | 'next' | 'skipped'
type Step = { key: TourPageKind | 'result'; title: string; status: StepStatus; note: string; to: string | null }

const STATUS_NOTE: Record<StepStatus, string> = { done: 'Xong', current: 'Tour đang ở đây', next: 'Chưa tới', skipped: 'Bỏ qua' }

/**
 * Where a Tour is in its life, as four steps, and which of its pages each one
 * opens. Read from the Tour's state only; what may be done on a page stays
 * with that page and the server. A step links only when its page has
 * something to show: the pre-start check while READY, the console once started.
 */
export function tourSteps(detail: Pick<TourDetails, 'tour' | 'startedAt'>): Step[] {
  const { id, state } = detail.tour
  const started = state === 'RUNNING' || Boolean(detail.startedAt)
  const ended = state === 'COMPLETED' || state === 'CANCELLED'
  const at = state === 'SCHEDULED' ? 0 : state === 'READY' ? 1 : state === 'RUNNING' ? 2 : 3
  // A Tour cancelled before it ran skipped the check and the console.
  const status = (index: number): StepStatus => index < at ? (ended && !started && (index === 1 || index === 2) ? 'skipped' : 'done') : index === at ? (index === 3 ? 'done' : 'current') : 'next'
  return [
    { key: 'prepare', title: 'Chuẩn bị & chốt', status: status(0), note: state === 'SCHEDULED' ? 'Duyệt đăng ký, rồi chốt Tour' : STATUS_NOTE[status(0)], to: `/staff/manage/tours/${id}` },
    { key: 'start', title: 'Mở Tour', status: status(1), note: state === 'READY' ? 'Mở Tour khi tới giờ' : STATUS_NOTE[status(1)], to: state === 'READY' ? `/staff/tours/${id}/start` : null },
    { key: 'live', title: 'Điều hành', status: status(2), note: state === 'RUNNING' ? 'Robot đang dẫn Tour' : STATUS_NOTE[status(2)], to: started ? `/staff/live/${id}` : null },
    { key: 'result', title: 'Kết quả', status: status(3), note: state === 'COMPLETED' ? 'Hoàn thành' : state === 'CANCELLED' ? 'Đã hủy' : STATUS_NOTE[status(3)], to: null },
  ]
}
