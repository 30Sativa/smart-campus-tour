/** Which form "Tạo Tour" opens (ADR-0053): a Tour on a shift, or a quick Tour. */
export type TourKind = 'normal' | 'quick'
/** `?kind=`; `short`, the ADR-0050 name, still opens the quick form. */
export const tourKindOf = (value: string | null): TourKind | null =>
  value === 'normal' ? 'normal' : value === 'quick' || value === 'short' ? 'quick' : null

/**
 * The one place the rules of a quick Tour are put into words (ADR-0053, ADR-0054, ADR-0057). Every screen that
 * explains a quick Tour reads these, so a rule change is one edit here, and `quick-tour.test.ts` blocks wording an
 * accepted decision has replaced (an early Start no longer waits for every viewer, ADR-0057).
 *
 * `waitMinutes` is `quickTourWaitMinutes` from `GET .../tours/shifts`; null while it is unknown.
 */
export const QUICK_TOUR_RULES = {
  /** One line under the kind pill of the form. */
  summary: 'Không chọn ngày, ca. Bắt đầu được ngay khi Tour đã chốt và robot sẵn sàng.',
  /** Page description of the quick create form. */
  pageDescription: 'Tour nhanh giữ robot ngay từ lúc tạo. Đại diện trường đăng ký đoàn, Staff duyệt và chốt Tour, rồi bắt đầu ngay, không cần chờ tới giờ.',
  hold: { value: 'Từ lúc bấm Tạo Tour', note: 'Robot đang bận cho Tour khác thì không tạo được.' },
  start: {
    value: 'Ngay khi Tour đã chốt',
    // TourStartPreflight: a quick Tour starts without any accepted registration (IsShortNotice || HasAcceptedRows).
    note: 'Không cần đăng ký đã duyệt. Robot phải đạt mọi điều kiện. Không phải chờ mọi điểm xem vào phòng chờ: trang kiểm tra chỉ cảnh báo số điểm xem còn thiếu.',
  },
  deadline: (waitMinutes: number | null | undefined) => ({
    value: waitMinutes != null ? `${waitMinutes} phút sau khi tạo` : 'Theo cấu hình máy chủ',
    note: 'Chưa bắt đầu trước hạn thì hệ thống tự huỷ Tour và trả robot.',
  }),
  registration: 'Khi Staff chốt Tour hoặc tới hạn bắt đầu',
  /** The facts on the "Tour nhanh" card of step 1. */
  facts: (waitMinutes: number | null | undefined): string[] => [
    'Không chọn ngày, ca: robot được giữ từ lúc tạo',
    'Bắt đầu ngay khi Tour đã chốt, không phải chờ mọi điểm xem vào phòng chờ',
    waitMinutes != null ? `Chưa bắt đầu sau ${waitMinutes} phút thì tự huỷ` : 'Tự huỷ nếu không bắt đầu kịp',
    'Cần ghi lý do',
  ],
} as const

/** Where a Representative opens a Tour to register a group (`/dai-dien/buoi/:tourId` in app/router). */
export const representativeTourPath = (tourId: string) => `/dai-dien/buoi/${encodeURIComponent(tourId)}`

type QuickTourTimes = { scheduledStartAt: string; latestStartAt?: string | null; autoCancelAt?: string | null }

/**
 * What the share panel of a SCHEDULED quick Tour says (A3). Before the published start the Representative link is
 * still worth sending; after it the Tour can no longer be locked, so the link goes and Staff can only wait for the
 * system cancel or cancel now. `latestStartAt`/`autoCancelAt` come from the server (the rule Start and the cancel
 * worker apply); a sentence whose time the server did not send is left out rather than guessed.
 */
export function quickTourDeadline(tour: QuickTourTimes, now: number, time: (iso: string) => string) {
  const passed = now >= new Date(tour.scheduledStartAt).getTime()
  const latest = tour.latestStartAt ? time(tour.latestStartAt) : null
  const cancelAt = tour.autoCancelAt ? time(tour.autoCancelAt) : null
  if (!passed) {
    const left = countdownText(tour.scheduledStartAt, now)
    return {
      passed, timerLabel: 'Thời gian còn lại để bắt đầu', chip: left ? `Còn ${left}` : null,
      text: [`Bắt đầu trước ${time(tour.scheduledStartAt)}.`,
        latest && `Đã chốt thì còn bắt đầu được tới ${latest}.`,
        cancelAt && `Chưa bắt đầu thì hệ thống tự huỷ và trả robot lúc ${cancelAt}.`].filter(Boolean).join(' '),
    }
  }
  const left = tour.autoCancelAt ? countdownText(tour.autoCancelAt, now) : null
  return {
    passed, timerLabel: 'Thời gian còn lại tới lúc tự huỷ',
    chip: left ? `Tự huỷ sau ${left}` : tour.autoCancelAt ? 'Đang tự huỷ' : 'Quá giờ bắt đầu',
    text: cancelAt
      ? `Đã quá giờ bắt đầu, không chốt được nữa. Hệ thống sẽ tự huỷ lúc ${cancelAt}, hoặc bạn huỷ ngay.`
      : 'Đã quá giờ bắt đầu, không chốt được nữa. Hệ thống sẽ tự huỷ, hoặc bạn huỷ ngay.',
  }
}

/** "28:41" until the deadline; null once it has passed. */
export function countdownText(deadline: string, now: number): string | null {
  const left = Math.floor((new Date(deadline).getTime() - now) / 1000)
  if (!Number.isFinite(left) || left <= 0) return null
  const minutes = Math.floor(left / 60)
  const seconds = String(left % 60).padStart(2, '0')
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}
