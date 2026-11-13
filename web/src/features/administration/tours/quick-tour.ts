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
    note: 'Cần ít nhất một đăng ký đã duyệt và robot đạt mọi điều kiện. Không phải chờ mọi điểm xem vào phòng chờ: trang kiểm tra chỉ cảnh báo số điểm xem còn thiếu.',
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
  /** Toast after a quick Tour is created. */
  created: 'Robot đã được giữ. Gửi link cho đại diện trường để đăng ký đoàn, duyệt rồi chốt Tour và bắt đầu trước hạn.',
} as const

/** Where a Representative opens a Tour to register a group (`/dai-dien/buoi/:tourId` in app/router). */
export const representativeTourPath = (tourId: string) => `/dai-dien/buoi/${encodeURIComponent(tourId)}`
