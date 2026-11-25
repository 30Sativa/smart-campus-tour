import type { AudienceSegment, EngagementSignal, PoiEngagement, StopEngagement } from './engagement-api'

export const ROW_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: 'Lời mời cá nhân',
  SHARED_VIEWING: 'Phòng xem chung',
}

export const STOP_OUTCOME_LABEL: Record<StopEngagement['outcome'], string> = {
  VISITED: 'Đã đến',
  SKIPPED: 'Đã bỏ qua',
  NOT_REACHED: 'Chưa đến',
}

/** A short tag for a table cell, and what Staff could change about the Tour because of it. */
export const SIGNAL: Record<EngagementSignal, { label: string; tone: 'info' | 'warn' | 'good'; advice: string }> = {
  MOST_QUESTIONS: {
    label: 'Được hỏi nhiều nhất', tone: 'info',
    advice: 'Người xem còn nhiều thắc mắc ở đây: bổ sung thuyết minh hoặc tăng thời gian dừng.',
  },
  MOST_LEFT: {
    label: 'Nhiều người rời nhất', tone: 'warn',
    advice: 'Nhiều người rời buổi tại điểm này: xem lại nội dung hoặc rút ngắn thời gian dừng.',
  },
  MOST_VOTED: {
    label: 'Được bầu nhiều nhất', tone: 'good',
    advice: 'Người xem muốn đến điểm này: cân nhắc đưa nó lên sớm hơn trong tuyến.',
  },
  OVER_DWELL: {
    label: 'Dừng lâu hơn kế hoạch', tone: 'warn',
    advice: 'Thời gian dừng thực tế vượt kế hoạch: cập nhật thời gian dừng của tuyến cho sát thực tế.',
  },
  SHORT_DWELL: {
    label: 'Rời sớm hơn kế hoạch', tone: 'info',
    advice: 'Robot thường rời trước nửa thời gian dự kiến: có thể rút ngắn thời gian dừng.',
  },
  SKIPPED: {
    label: 'Bị bỏ qua', tone: 'warn',
    advice: 'Điểm này hay bị bỏ qua: kiểm tra lý do hoặc cân nhắc bỏ khỏi tuyến.',
  },
  NO_QUESTIONS: {
    label: 'Chưa có câu hỏi', tone: 'info',
    advice: 'Chưa ai hỏi ở điểm này: thêm một câu gợi mở vào thuyết minh.',
  },
}

export const SIGNAL_TONE_CLASS: Record<'info' | 'warn' | 'good', string> = {
  info: 'border-[#cfe0ee] bg-[#f2f8fc] text-[#235b80]',
  warn: 'border-[#f3d9a8] bg-[#fff8eb] text-[#8a5a00]',
  good: 'border-[#bfe3d2] bg-[#effaf4] text-[#1f6b49]',
}

/** "62%" or "-" when nothing was measured. */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-'
}

/** The rate as a percentage, or "-". */
export function rate(value: number | null | undefined): string {
  return value == null ? '-' : `${Math.round(value * 100)}%`
}

/** A count with one decimal at most, in Vietnamese notation: 1,5. */
export function decimal(value: number | null | undefined): string {
  if (value == null) return '-'
  return (Math.round(value * 10) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

export function sortedAudience(audience: AudienceSegment[]): AudienceSegment[] {
  const order = ['INDIVIDUAL', 'SHARED_VIEWING']
  return [...audience].sort((a, b) => (order.indexOf(a.rowType) + 1 || 99) - (order.indexOf(b.rowType) + 1 || 99))
}

/** One suggestion per POI and signal, the strongest first: what to look at before the next Tour. */
export function suggestions(pois: PoiEngagement[]): Array<{ poi: string; signal: EngagementSignal; advice: string }> {
  const weight: Record<EngagementSignal, number> = {
    MOST_LEFT: 0, SKIPPED: 1, MOST_QUESTIONS: 2, OVER_DWELL: 3, NO_QUESTIONS: 4, SHORT_DWELL: 5, MOST_VOTED: 6,
  }
  return pois.flatMap(poi => poi.signals.map(signal => ({ poi: poi.name, signal, advice: SIGNAL[signal].advice })))
    .sort((a, b) => weight[a.signal] - weight[b.signal] || a.poi.localeCompare(b.poi, 'vi'))
}
