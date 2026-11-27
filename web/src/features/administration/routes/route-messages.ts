import { ApiError, apiErrorDetail } from '../../../api/client'
import { formatExpectedDuration } from '../../../components/ui/date-time'
import { MISSING_ENDPOINT_MESSAGE, backendMessage } from '../tours/tour-messages'
import type { StopDraft } from './RouteStopsEditor'
import type { RouteLegCoverage, RouteMissingLeg, RouteScheduledTour, RouteSharedResultRevision, RouteTestRun, VersionedRoute } from './versioned-api'
import { campusShortStamp } from '../tours/tour-calendar'

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
  // ADR-0065: a voting route whose PASS runs have not driven every leg yet; it cannot take a Tour.
  if (status === 'LEGS_INCOMPLETE') return { label: 'Chạy thử chưa đủ chặng', chip: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]' }
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
  if (route.verificationStatus === 'LEGS_INCOMPLETE') return { label: 'Chạy thử chưa đủ chặng', chip }
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

/**
 * "Phiên bản 4 (17/11 12:21)": the one name for a route revision on the route test and Staff route pages; the number
 * and the save time are the same thing. `lower` for the middle of a sentence.
 */
export const revisionLabel = (revision: { revisionNumber: number; createdAt: string }, lower = false) =>
  `${lower ? 'phiên bản' : 'Phiên bản'} ${revision.revisionNumber} (${campusShortStamp(revision.createdAt)})`

/** The other save whose run this revision carries, when the result was recorded there (ADR-0023 addendum). */
export function resultSource(route: AppliedRunRoute & Pick<VersionedRoute, 'revisionId' | 'sharedResultRevisions'>): RouteSharedResultRevision | undefined {
  const run = appliedRun(route)
  if (!run || run.routeRevisionId === route.revisionId) return undefined
  return route.sharedResultRevisions?.find(item => item.revisionId === run.routeRevisionId)
}

/**
 * "theo lần chạy 16/11 19:09 trên phiên bản 2 (16/11 18:51)" for a history row whose Đạt/Không đạt comes from a run
 * recorded on another save with the same path (ADR-0023 addendum).
 * Null when the row has no applied result, the run was recorded on this save, or the data does not name the run's save.
 */
export function historyResultSource(
  revision: { revisionId: string; verificationStatus: string; effectiveTestRunId: string | null },
  testRuns: Pick<RouteTestRun, 'id' | 'routeRevisionId' | 'checkedAt'>[],
  history: { revisionId: string; revisionNumber: number; createdAt: string }[],
): string | null {
  if (!['PASS', 'FAIL'].includes(revision.verificationStatus) || !revision.effectiveTestRunId) return null
  const run = testRuns.find(item => item.id === revision.effectiveTestRunId)
  if (!run || run.routeRevisionId === revision.revisionId) return null
  const save = history.find(item => item.revisionId === run.routeRevisionId)
  if (!save) return null
  return `theo lần chạy ${campusShortStamp(run.checkedAt)} trên ${revisionLabel(save, true)}`
}

type RunRoute = Pick<VersionedRoute, 'revisionId' | 'configurationFingerprint' | 'verificationStatus' | 'effectiveTestRunId' | 'viewerChoosesNextStop' | 'legCoverage' | 'testRuns' | 'revisionHistory'>

/**
 * Whether a run was recorded on this revision's path. The revision read returns every run of the route, so a run on
 * a save with another path is listed too; its save's fingerprint says which. A save the history does not list counts
 * as the same path only when it is this one.
 */
export function runOnPath(route: Pick<RunRoute, 'revisionId' | 'configurationFingerprint' | 'revisionHistory'>, run: Pick<RouteTestRun, 'routeRevisionId'>) {
  if (run.routeRevisionId === route.revisionId) return true
  const save = route.revisionHistory?.find(item => item.revisionId === run.routeRevisionId)
  return Boolean(save && save.configurationFingerprint === route.configurationFingerprint)
}

/**
 * What one recorded run is to this revision's result, by the server's rule (RouteVerification, RouteLegCoverage):
 * - a fixed route takes the newest run on its path: that run is "Kết quả hiện tại";
 * - a voting route (ADR-0065) adds up the legs its PASS runs drove since the newest FAIL: each of those runs is
 *   "Tính vào n/m chặng" (no single run is the whole-route result), and a newest FAIL is "Kết quả hiện tại".
 * Null for a run that does not decide the result now.
 */
export function runResultTag(route: RunRoute, run: RouteTestRun): string | null {
  if (!route.viewerChoosesNextStop || !route.legCoverage) return run.id === route.effectiveTestRunId ? 'Kết quả hiện tại' : null
  if (route.verificationStatus === 'FAIL') return run.id === route.effectiveTestRunId ? 'Kết quả hiện tại' : null
  const onPath = (route.testRuns ?? []).filter(item => runOnPath(route, item))
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt) || a.id.localeCompare(b.id))
  const lastFail = onPath.map(item => item.resultCode).lastIndexOf('FAIL')
  const counted = onPath.slice(lastFail + 1).some(item => item.id === run.id && item.resultCode === 'PASS' && item.traversedStopIds?.length)
  return counted ? `Tính vào ${legCoverageText(route.legCoverage).replace('Đã đi ', '')}` : null
}

/** The note under the run form: how the server turns runs into this revision's result. */
export const runRuleNote = (voting: boolean) => voting
  ? 'Mỗi lần chạy được ghi thêm, không sửa được. Tuyến cho Viewer chọn điểm tiếp theo: các lần chạy đạt từ sau lần không đạt gần nhất cộng dồn các chặng đã đi, tuyến đạt khi đủ mọi chặng; một lần chạy không đạt là kết quả hiện tại và tính lại từ đầu. Áp dụng cho mọi phiên bản có cùng đường đi. Chỉ đổi tên, mô tả, thời gian dừng hoặc thuyết minh thì giữ kết quả.'
  : 'Mỗi lần chạy được ghi thêm, không sửa được. Lần chạy mới nhất trên đường đi này là kết quả hiện tại, cho mọi phiên bản có cùng đường đi. Chỉ đổi tên, mô tả, thời gian dừng hoặc thuyết minh thì giữ kết quả.'

/** The checks a run did not pass, in the words of the record form. */
export const failedCheckNames = (run: Pick<RouteTestRun, 'allStopsReached' | 'safelyStopped' | 'localizationPassed'>) =>
  [!run.allStopsReached && 'đi đủ điểm dừng', !run.safelyStopped && 'dừng an toàn', !run.localizationPassed && 'định vị']
    .filter((item): item is string => Boolean(item))

/** "C → B", with the start and the end in words when the server sends no name for them. */
export const legText = (leg: RouteMissingLeg) =>
  `${leg.fromStopId ? leg.fromName : leg.fromName || 'Điểm bắt đầu'} → ${leg.toStopId ? leg.toName : leg.toName || 'Điểm kết thúc'}`

/**
 * ADR-0065: "Còn thiếu 2 chặng: C → B, B → Điểm kết thúc", or null when every leg is covered or the route does not
 * vote. The legs come from the server; the web never works out which legs a route has.
 */
export function missingLegsText(coverage: RouteLegCoverage | null | undefined): string | null {
  const missing = coverage?.missingLegs ?? []
  return missing.length ? `Còn thiếu ${missing.length} chặng: ${missing.map(legText).join(', ')}` : null
}

/** "Đã đi 5/7 chặng". */
export const legCoverageText = (coverage: RouteLegCoverage) => `Đã đi ${coverage.coveredCount}/${coverage.requiredCount} chặng`

const tourLine = (tour: RouteScheduledTour) => `${tour.name} · ${campusShortStamp(tour.scheduledStartAt)}`

/**
 * "Kết quả này áp dụng cho cả: phiên bản 3 (16/11 12:23) · 1 Tour đã lên lịch: …". Null when no other save shares the
 * path. A result is recorded per path, not per save, so Technical sees which Tours it also decides.
 */
export function sharedResultLine(route: Pick<VersionedRoute, 'sharedResultRevisions'>): string | null {
  const saves = route.sharedResultRevisions ?? []
  if (!saves.length) return null
  return `Kết quả này áp dụng cho cả: ${saves.map(save => `${revisionLabel(save, true)}${save.scheduledTours.length
    ? ` · ${save.scheduledTours.length} Tour đã lên lịch: ${save.scheduledTours.map(tourLine).join('; ')}` : ''}`).join(', ')}`
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
  if (route.verificationStatus === 'FAIL') return 'Đường đi không đổi nên giữ kết quả chạy thử không đạt. Nếu lỗi do đường đi thì sửa rồi gửi lại; nếu không, nhờ Kỹ thuật chạy lại.'
  if (route.verificationStatus === 'LEGS_INCOMPLETE') return 'Đường đi không đổi nên giữ các chặng đã chạy thử. Kỹ thuật còn phải chạy các chặng chưa đi trước khi tạo Tour.'
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
export type RoutePathShape = Pick<VersionedRoute, 'mapVersionId' | 'startX' | 'startY' | 'startYaw' | 'endMode' | 'endX' | 'endY' | 'endYaw' | 'viewerChoosesNextStop'> & {
  /** Not part of the path: a rename or a new description keeps the result. Compared trimmed, as saved. */
  name?: string; description?: string | null
  /** A saved revision's path fingerprint; when both sides have one it decides `pathChanged`, as on the server. */
  configurationFingerprint?: string
  stops: Array<{
    poiRevisionId: string; dwellSeconds: number; headSteps: Array<{ preset: string; holdSeconds: number }>
    /**
     * The POI the revision belongs to, its name and its navigation (the server's POI fingerprint: x, y, yaw, camera).
     * With them a newer revision of the same POI is told apart from a real add and remove; without them a stop is
     * known only by its POI revision.
     */
    poiProposalId?: string | null; name?: string; x?: number; y?: number; yaw?: number; cameraPreset?: string
  }>
}

type PathStop = RoutePathShape['stops'][number]
/** The server's PoiNavigationFingerprint fields at its precision; unknown navigation compares as changed. */
const navigationKey = (stop: PathStop) => stop.x == null || stop.y == null || stop.yaw == null ? null
  : [stop.x.toFixed(4), stop.y.toFixed(4), stop.yaw.toFixed(6), (stop.cameraPreset ?? '').trim().toUpperCase()].join('|')
const sameNavigation = (a: PathStop, b: PathStop) => a.poiRevisionId === b.poiRevisionId ||
  (navigationKey(a) != null && navigationKey(a) === navigationKey(b))

/**
 * How `current` differs from `previous`, in Staff's words, and whether the path changed. A stop is matched by its POI
 * revision, else by its POI, so a stop moved to a newer revision of the same POI is "1 POI có phiên bản mới (tên)",
 * not one added and one removed. Like the server (RouteNavigationConfigurationFactory.SameNavigation) that changes
 * the path only when the POI's position, heading or camera changed; with both fingerprints known, they decide.
 */
export function routeChanges(previous: RoutePathShape, current: RoutePathShape): { changes: string[]; pathChanged: boolean } {
  const matched = new Set<PathStop>()
  const pairs = current.stops.map(stop => {
    const before = previous.stops.find(item => !matched.has(item) && item.poiRevisionId === stop.poiRevisionId)
      ?? (stop.poiProposalId ? previous.stops.find(item => !matched.has(item) && item.poiProposalId === stop.poiProposalId) : undefined)
    if (before) matched.add(before)
    return { stop, before }
  })
  const kept = pairs.filter((pair): pair is { stop: PathStop; before: PathStop } => Boolean(pair.before))
  const path: string[] = []
  if (previous.mapVersionId !== current.mapVersionId) path.push('đổi bản đồ')
  const added = pairs.length - kept.length
  const removed = previous.stops.length - kept.length
  if (added) path.push(`thêm ${added} điểm dừng`)
  if (removed) path.push(`bớt ${removed} điểm dừng`)
  if (kept.map(pair => previous.stops.indexOf(pair.before)).some((index, at, all) => at > 0 && index < all[at - 1])) path.push('đổi thứ tự điểm dừng')
  const renewed = kept.filter(pair => pair.before.poiRevisionId !== pair.stop.poiRevisionId)
  const moved = renewed.filter(pair => !sameNavigation(pair.before, pair.stop)).map(pair => pair.stop)
  const samePosition = renewed.filter(pair => sameNavigation(pair.before, pair.stop)).map(pair => pair.stop)
  const names = (stops: PathStop[]) => stops.map(stop => stop.name ?? 'POI').join(', ')
  if (moved.length) path.push(`${moved.length} POI có phiên bản mới, đổi vị trí hoặc hướng (${names(moved)})`)
  if (previous.startX !== current.startX || previous.startY !== current.startY || previous.startYaw !== current.startYaw) path.push('đổi điểm bắt đầu')
  if (previous.endMode !== current.endMode || previous.endX !== current.endX || previous.endY !== current.endY || previous.endYaw !== current.endYaw) path.push('đổi điểm kết thúc')
  // ADR-0065: the flag is part of the path fingerprint, so switching it needs a new run.
  if (Boolean(previous.viewerChoosesNextStop) !== Boolean(current.viewerChoosesNextStop))
    path.push(current.viewerChoosesNextStop ? 'bật cho Viewer chọn điểm tiếp theo' : 'tắt cho Viewer chọn điểm tiếp theo')
  const heads = (steps: PathStop['headSteps']) => steps.map(step => `${step.preset}:${step.holdSeconds}`).join()
  if (kept.some(pair => heads(pair.before.headSteps) !== heads(pair.stop.headSteps))) path.push('đổi góc nhìn camera')
  const dwell = kept.filter(pair => pair.before.dwellSeconds !== pair.stop.dwellSeconds).length
  const text = (value: string | null | undefined) => (value ?? '').trim()
  const labels = [
    samePosition.length > 0 && `${samePosition.length} POI có phiên bản mới (${names(samePosition)})`,
    text(previous.name) !== text(current.name) && 'đổi tên tuyến',
    text(previous.description) !== text(current.description) && 'đổi mô tả',
    dwell > 0 && `đổi thời gian dừng ${dwell} điểm`,
  ].filter((item): item is string => Boolean(item))
  const fingerprints = previous.configurationFingerprint && current.configurationFingerprint
  const pathChanged = fingerprints ? previous.configurationFingerprint !== current.configurationFingerprint : path.length > 0
  // The fingerprints differ for a reason the fields above do not name (the map package itself, say).
  if (pathChanged && !path.length) path.push('đổi đường đi')
  return { changes: [...path, ...labels], pathChanged }
}

/**
 * B4 on the route test form: how a revision differs from the one before. A revision that already has a run deciding
 * its result needs no "cần chạy thử lại", whatever changed: it says so instead (4.1).
 */
export function routeChangeText(changes: string[], pathChanged: boolean, alreadyPassed: boolean): string {
  const what = changes.length ? `${changes.join(', ')}.` : 'không đổi đường đi hay thời gian dừng.'
  if (alreadyPassed) return `${what} Bản này đã có lần chạy đạt.`
  return `${what}${pathChanged ? ' Đường đi đã đổi, cần chạy thử lại.' : changes.length ? ' Đường đi không đổi.' : ''}`
}

/**
 * The robot field of a new Tour (round 7, 2.4): an option only says it is not ready; the server's whole reason sits
 * under the field for the robot chosen, or for every robot when none can be chosen.
 */
export const tourRobotText = {
  notReadyOption: ' (chưa sẵn sàng)',
  noneReady: 'Chưa có robot nào sẵn sàng cho tuyến này.',
  askTechnical: (mapLabel: string | null) => `Nhờ Kỹ thuật gán và kiểm tra robot trên bản đồ ${mapLabel ?? 'của tuyến'}.`,
}
