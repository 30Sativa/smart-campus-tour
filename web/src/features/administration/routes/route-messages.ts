import { ApiError, apiErrorDetail } from '../../../api/client'
import { formatExpectedDuration } from '../../../components/ui/date-time'
import { MISSING_ENDPOINT_MESSAGE, backendMessage } from '../tours/tour-messages'
import type { StopDraft } from './RouteStopsEditor'
import type { RouteScheduledTour, RouteSharedResultRevision, RouteTestRun, VersionedRoute } from './versioned-api'
import { campusShortDate, campusShortStamp, campusTime } from '../tours/tour-calendar'

const fitMinutes = formatExpectedDuration

/** The server estimates a route's length (dwell plus travel at a configured speed); nobody types it. */
export const expectedDurationText = (seconds: number) => `Thời lượng dự kiến: ${fitMinutes(seconds)} (tự tính từ thời gian dừng và quãng đường)`

/** docs/lich-tour-theo-ca.md §4: the words for a route that does not sit comfortably in a shift; null when it fits. */
export function scheduleFitLabel(route: Pick<VersionedRoute, 'scheduleFit' | 'expectedDurationSeconds'>): { tone: 'danger' | 'warn'; text: string; detail: string } | null {
  const expected = route.expectedDurationSeconds ? `Dự kiến ${fitMinutes(route.expectedDurationSeconds)}` : 'Thời lượng dự kiến'
  if (route.scheduleFit === 'TOO_LONG_FOR_SHIFT')
    return { tone: 'danger', text: 'Quá dài cho 1 ca', detail: `${expected}, vượt thời lượng tối đa của mọi ca nên không xếp lịch được.` }
  if (route.scheduleFit === 'OVER_RECOMMENDED')
    return { tone: 'warn', text: 'Dài hơn mức khuyến nghị', detail: `${expected}, dài hơn mức khuyến nghị. Vẫn xếp lịch được.` }
  return null
}

/** A revision's state as words and colour: not submitted, submitted and not run, passed, failed. */
export function revisionTone(submitted: boolean, status: string) {
  if (!submitted) return { label: 'Chưa gửi kiểm chứng', chip: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085]' }
  if (status === 'PASS') return { label: 'Chạy thử đạt', chip: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]' }
  if (status === 'FAIL') return { label: 'Chạy thử không đạt', chip: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]' }
  return { label: 'Chưa chạy thử', chip: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]' }
}

/**
 * A route's state in Staff's words: whether it passed a run, never which revision it is.
 * Technical screens keep `revisionTone`.
 */
export function staffRouteStatus(route: { isSubmitted: boolean; verificationStatus: string }) {
  const { chip } = revisionTone(route.isSubmitted, route.verificationStatus)
  if (!route.isSubmitted) return { label: 'Chưa gửi kiểm chứng', chip }
  if (route.verificationStatus === 'FAIL') return { label: 'Chạy thử không đạt', chip }
  if (route.verificationStatus !== 'PASS') return { label: 'Chờ chạy thử', chip }
  return { label: 'Đã chạy thử đạt', chip }
}

type AppliedRunRoute = Pick<VersionedRoute, 'effectiveTestRunId' | 'testRuns'>

/** The run whose result this revision carries now: the newest run of its path, maybe recorded on another save. */
export const appliedRun = (route: AppliedRunRoute): RouteTestRun | undefined =>
  route.testRuns?.find(run => run.id === route.effectiveTestRunId)

/** When the run behind this revision's PASS was recorded; undefined when it has no applied PASS or the data does not say. */
export const passedAt = (route: AppliedRunRoute & Pick<VersionedRoute, 'verificationStatus'>) =>
  route.verificationStatus === 'PASS' ? appliedRun(route)?.checkedAt : undefined

/** The applied run when it is a FAIL; undefined otherwise. */
export const appliedFail = (route: AppliedRunRoute & Pick<VersionedRoute, 'verificationStatus'>) =>
  route.verificationStatus === 'FAIL' ? appliedRun(route) : undefined

/** The other save whose run this revision carries, when the result was recorded there (ADR-0023 addendum). */
export function resultSource(route: AppliedRunRoute & Pick<VersionedRoute, 'revisionId' | 'sharedResultRevisions'>): RouteSharedResultRevision | undefined {
  const run = appliedRun(route)
  if (!run || run.routeRevisionId === route.revisionId) return undefined
  return route.sharedResultRevisions?.find(item => item.revisionId === run.routeRevisionId)
}

/**
 * "theo lần chạy 16/11 19:09 trên bản lưu 18:51" for a history row whose Đạt/Không đạt comes from a run recorded on
 * another save with the same path (ADR-0023 addendum). The save shows only its time when it is the same day as the run.
 * Null when the row has no applied result, the run was recorded on this save, or the data does not name the run's save.
 */
export function historyResultSource(
  revision: { revisionId: string; verificationStatus: string; effectiveTestRunId: string | null },
  testRuns: Pick<RouteTestRun, 'id' | 'routeRevisionId' | 'checkedAt'>[],
  history: { revisionId: string; createdAt: string }[],
): string | null {
  if (!['PASS', 'FAIL'].includes(revision.verificationStatus) || !revision.effectiveTestRunId) return null
  const run = testRuns.find(item => item.id === revision.effectiveTestRunId)
  if (!run || run.routeRevisionId === revision.revisionId) return null
  const save = history.find(item => item.revisionId === run.routeRevisionId)
  if (!save) return null
  const saveStamp = campusShortDate(save.createdAt) === campusShortDate(run.checkedAt) ? campusTime(save.createdAt) : campusShortStamp(save.createdAt)
  return `theo lần chạy ${campusShortStamp(run.checkedAt)} trên bản lưu ${saveStamp}`
}

/** The checks a run did not pass, in the words of the record form. */
export const failedCheckNames = (run: Pick<RouteTestRun, 'allStopsReached' | 'safelyStopped' | 'localizationPassed'>) =>
  [!run.allStopsReached && 'đi đủ điểm dừng', !run.safelyStopped && 'dừng an toàn', !run.localizationPassed && 'định vị']
    .filter((item): item is string => Boolean(item))

const tourLine = (tour: RouteScheduledTour) => `${tour.name} · ${campusShortStamp(tour.scheduledStartAt)}`

/**
 * "Kết quả này áp dụng cho cả: bản lưu 16/11 12:23 (1 Tour đã lên lịch: …)". Null when no other save shares the path.
 * A result is recorded per path, not per save, so Technical sees which Tours it also decides.
 */
export function sharedResultLine(route: Pick<VersionedRoute, 'sharedResultRevisions'>): string | null {
  const saves = route.sharedResultRevisions ?? []
  if (!saves.length) return null
  return `Kết quả này áp dụng cho cả: ${saves.map(save => `bản lưu ${campusShortStamp(save.createdAt)}${save.scheduledTours.length
    ? ` (${save.scheduledTours.length} Tour đã lên lịch: ${save.scheduledTours.map(tourLine).join('; ')})` : ''}`).join(', ')}`
}

/** Whether a FAIL here stops Tours: those on this save or on a save sharing its path. */
export const hasScheduledToursOnPath = (route: Pick<VersionedRoute, 'sharedResultRevisions' | 'scheduledTours'>) =>
  Boolean(route.scheduledTours?.length || route.sharedResultRevisions?.some(save => save.scheduledTours.length))

/**
 * "x phút y giây". `formatDuration` in components/ui/date-time.ts drops the seconds above a minute, which hides a 15 s
 * dwell change, so route screens keep this one until the shared formatter covers it.
 */
export const dwellText = (seconds: number) =>
  seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút${seconds % 60 ? ` ${seconds % 60} giây` : ''}`

/**
 * What a save means for its run, after Staff saved or submitted it: it keeps the result of its path (only dwell or
 * narration changed), it needs a new run, or it is not submitted yet.
 */
export function saveResultText(route: Pick<VersionedRoute, 'isSubmitted' | 'verificationStatus'>): string {
  if (!route.isSubmitted) return 'Chưa gửi kiểm chứng. Bấm Gửi kiểm chứng tuyến để Kỹ thuật chạy thử.'
  if (route.verificationStatus === 'PASS') return 'Đường đi không đổi nên giữ kết quả chạy thử đạt. Dùng được để tạo Tour.'
  if (route.verificationStatus === 'FAIL') return 'Đường đi không đổi nên giữ kết quả chạy thử không đạt. Sửa đường đi rồi gửi lại.'
  return 'Đường đi đã đổi nên cần Kỹ thuật chạy thử lại. Chưa tạo được Tour cho tới khi chạy thử đạt.'
}

const ISSUES: Record<string, string> = {
  MAP_REQUIRED: 'Chưa có map và frame.', START_POSE_INVALID: 'Pose bắt đầu không hợp lệ.',
  END_POSE_REQUIRED: 'Điểm kết thúc cần đủ x, y và yaw hợp lệ.', END_MODE_INVALID: 'Cách kết thúc và pose kết thúc không khớp.',
  STOPS_REQUIRED: 'Cần ít nhất một POI.', STOP_ORDER_INVALID: 'Thứ tự điểm dừng phải liên tiếp từ 1.',
  DUPLICATE_POI: 'Mỗi POI chỉ xuất hiện một lần trong tuyến.', POI_NOT_FOUND: 'Có POI không còn tồn tại.',
  POI_MAP_MISMATCH: 'Tất cả POI phải có cùng map và frame với tuyến.', DWELL_INVALID: 'Thời gian dừng phải lớn hơn 0.',
  POI_POSE_INVALID: 'Có POI chứa tọa độ hoặc hướng không hợp lệ. Kiểm tra lại POI.',
  HEAD_STEPS_INVALID: 'Mỗi góc nhìn cần thời gian giữ dương, tổng không vượt thời gian dừng.',
  POI_INACTIVE: 'Có POI chưa khả dụng. Kích hoạt POI trước khi kích hoạt tuyến.',
}
export function routeIssue(code: string): string { return ISSUES[code] ?? 'Cấu hình cần được kiểm tra lại.' }
export function routeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không thể kết nối máy chủ. Hãy thử lại.'
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản không có quyền quản lý tuyến.'
  if (error.status === 404) return 'Tuyến không còn tồn tại. Hãy tải lại danh sách.'
  let body: { errors?: { code?: string } | Record<string, string[]> } = {}
  try {
    const decoded: unknown = JSON.parse(error.body)
    if (decoded && typeof decoded === 'object') body = decoded as typeof body
  } catch { /* Use the status message below. */ }
  if (error.status === 409 && body.errors?.code === 'ROUTE_CONCURRENT_CHANGE') return 'Dữ liệu liên quan đang được cập nhật đồng thời. Nội dung đang nhập vẫn được giữ; tải lại và thử lại.'
  if (error.status === 409) return body.errors?.code === 'STALE_ROUTE'
    ? 'Tuyến đã thay đổi. Nội dung đang nhập vẫn được giữ; tải lại trang để lấy phiên bản mới trước khi sửa tiếp.'
    : 'Tuyến đang được tham chiếu hoặc được Tour đã chốt sử dụng. Hãy tải lại; sao chép tuyến nếu cần đổi hành trình.'
  if (error.status === 400) {
    const detail = apiErrorDetail(error)
    if (detail) return detail
    const codes = Object.values(body.errors ?? {}).flat().filter((v): v is string => typeof v === 'string' && v in ISSUES)
    return codes.length ? [...new Set(codes)].map(routeIssue).join(' ') : 'Dữ liệu chưa hợp lệ. Kiểm tra tên, map, pose, điểm dừng và thời gian giữ góc nhìn.'
  }
  return 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.'
}

/** Deactivate and activate speak in the backend's words, which name the actual refusal. */
export function routeAvailabilityError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không thể kết nối máy chủ. Hãy thử lại.'
  if (error.status === 401) return 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản không có quyền quản lý tuyến.'
  const message = backendMessage(error)
  if (message) return message
  if (error.status === 404) return error.body.trim() ? 'Không tìm thấy tuyến. Hãy tải lại danh sách.' : MISSING_ENDPOINT_MESSAGE
  return 'Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.'
}

/** Same rule the backend enforces (HEAD_STEPS_INVALID / DWELL_INVALID), checked early so the wizard can block "Tiếp". */
export function stopIssue(stop: StopDraft): string | null {
  if (!(stop.dwellSeconds > 0)) return 'Nhập thời gian dừng lớn hơn 0.'
  if (stop.headSteps.some(h => !(h.holdSeconds > 0))) return 'Nhập thời gian giữ lớn hơn 0 cho mọi góc nhìn.'
  const total = stop.headSteps.reduce((sum, h) => sum + h.holdSeconds, 0)
  return total > stop.dwellSeconds ? `Tổng góc nhìn ${total}s vượt thời gian dừng ${stop.dwellSeconds}s.` : null
}

/** What a save's run depends on, from a saved revision or a form draft. */
export type RoutePathShape = Pick<VersionedRoute, 'mapVersionId' | 'startX' | 'startY' | 'startYaw' | 'endMode' | 'endX' | 'endY' | 'endYaw'> & {
  stops: Array<{ poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: string; holdSeconds: number }> }>
}

/**
 * How `current` differs from `previous`, in Staff's words, and whether the path changed. The server decides by the POI
 * position, not the POI save, so a stop moved to a newer POI save with the same position still keeps the result there;
 * this compares POI saves and may say "cần chạy lại" where the server keeps it.
 */
export function routeChanges(previous: RoutePathShape, current: RoutePathShape): { changes: string[]; pathChanged: boolean } {
  const before = previous.stops.map(stop => stop.poiRevisionId)
  const after = current.stops.map(stop => stop.poiRevisionId)
  const path: string[] = []
  if (previous.mapVersionId !== current.mapVersionId) path.push('đổi bản đồ')
  const added = after.filter(id => !before.includes(id)).length
  const removed = before.filter(id => !after.includes(id)).length
  if (added) path.push(`thêm ${added} điểm dừng`)
  if (removed) path.push(`bớt ${removed} điểm dừng`)
  const kept = after.filter(id => before.includes(id))
  if (kept.join() !== before.filter(id => after.includes(id)).join()) path.push('đổi thứ tự điểm dừng')
  if (previous.startX !== current.startX || previous.startY !== current.startY || previous.startYaw !== current.startYaw) path.push('đổi điểm bắt đầu')
  if (previous.endMode !== current.endMode || previous.endX !== current.endX || previous.endY !== current.endY || previous.endYaw !== current.endYaw) path.push('đổi điểm kết thúc')
  const byId = new Map(previous.stops.map(stop => [stop.poiRevisionId, stop]))
  const heads = (steps: RoutePathShape['stops'][number]['headSteps']) => steps.map(step => `${step.preset}:${step.holdSeconds}`).join()
  if (current.stops.some(stop => byId.has(stop.poiRevisionId) && heads(byId.get(stop.poiRevisionId)!.headSteps) !== heads(stop.headSteps))) path.push('đổi góc nhìn camera')
  const dwell = current.stops.filter(stop => byId.has(stop.poiRevisionId) && byId.get(stop.poiRevisionId)!.dwellSeconds !== stop.dwellSeconds).length
  return { changes: [...path, ...(dwell ? [`đổi thời gian dừng ${dwell} điểm`] : [])], pathChanged: path.length > 0 }
}
