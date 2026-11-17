import type { TourActionAvailability, TourDetails } from '../../administration/tours/types'
import { STEP_LABEL, assistanceInfo, robotFaultText, robotReasonText } from './operation-labels'

/**
 * The console actions that a situation can point at. End Early has its own place and is never the suggested step.
 * `depart` is Next from the start of an opened Tour (it carries the on-site confirmations); `retryLeg` is also the
 * Resume of a paused leg.
 */
export type ConsoleAction = 'depart' | 'next' | 'pause' | 'retryLeg' | 'skip' | 'reconcile'

export type Situation = {
  tone: 'ok' | 'info' | 'warn' | 'danger'
  title: string
  body: string
  /** The one action this situation calls for; whether it may run now is still the server's `allowedActions`. */
  action: ConsoleAction | null
  /** Other ways forward from here, shown smaller (Skip). */
  secondary: readonly ConsoleAction[]
  /** No action of the console can continue the Tour; End Early is the remaining way out. */
  onlyEndEarly: boolean
}

/** What the robot itself reports now; it says why a stored command is not being picked up. */
export type RobotReport = { localized: boolean | null; motionReady: boolean | null; faultCode: string | null } | null

/** The server's gate for an action; `depart` is Next from the start, so it shares Next's gate. */
export function actionGate(detail: TourDetails, action: ConsoleAction | 'endEarly'): TourActionAvailability | null {
  const key = action === 'depart' ? 'next' : action
  return detail.allowedActions?.[key] ?? null
}

/** Names for the places the Tour can go next, from the route revision the server returned. */
export function tourTargets(detail: TourDetails) {
  const stops = detail.routeRevision?.stops ?? []
  const execution = detail.execution
  const byId = (id: string | null | undefined) => stops.find(stop => stop.id === id) ?? null
  const after = (order: number) => stops.filter(stop => stop.stopOrder > order).sort((a, b) => a.stopOrder - b.stopOrder)[0] ?? null
  const endsAtPose = detail.routeRevision?.endMode === 'POSE'
  const placeAfter = (order: number) => after(order)?.name ?? (endsAtPose ? 'điểm kết thúc' : null)
  // The leg the robot is on, or stopped on: its POI, or the end pose.
  const current = execution?.currentLegKind === 'TO_END' ? 'điểm kết thúc' : byId(execution?.currentRevisionStopId)?.name ?? null
  const here = execution?.currentStep === 'INITIALIZING' ? 0 : byId(execution?.lastArrivedRevisionStopId)?.stopOrder ?? 0
  const currentOrder = byId(execution?.currentRevisionStopId)?.stopOrder ?? null
  return {
    /** Where the leg the robot is on (or was stopped on) goes. */
    current,
    /** Where Next or the departure goes; null when the route ends at this POI. */
    next: placeAfter(here),
    /** The POI Skip passes over, and where the robot then goes. */
    skipped: execution?.currentStep === 'OBSERVING' || execution?.currentStep === 'INITIALIZING' ? after(here)?.name ?? null : current,
    afterSkip: execution?.currentStep === 'OBSERVING' || execution?.currentStep === 'INITIALIZING'
      ? (after(here) ? placeAfter(after(here)!.stopOrder) : null)
      : currentOrder !== null ? placeAfter(currentOrder) : null,
    endsAtPose,
  }
}

/** Why the robot stopped, in its own words first: the leg's reason code says more than the Tour's assistance reason. */
function causeOf(detail: TourDetails): string {
  const execution = detail.execution
  const command = execution?.command
  if (command?.state === 'EXPIRED') return 'Robot không lấy lệnh trước thời hạn nên lệnh đã hết hiệu lực; robot chưa nhận lệnh này.'
  const robot = robotReasonText(command?.reasonCode)
  return robot ? `${robot}.` : assistanceInfo(execution?.assistanceReason).hint
}

/**
 * What is happening now and what a person should do next, in one sentence each,
 * from the server's answer and the robot's own report. The command's own state
 * comes first: a Tour's assistance reason says why it stopped, the command says
 * what the robot may still be doing. Nothing here enables a button; the server's gate does.
 */
export function tourSituation(detail: TourDetails, robot: RobotReport = null): Situation {
  const { state } = detail.tour
  const execution = detail.execution
  const command = execution?.command
  const unknownGoTo = command?.kind === 'GoTo' && command.state === 'UNKNOWN'
  const quiet = { action: null, secondary: [], onlyEndEarly: false } as const
  const targets = tourTargets(detail)

  if (state === 'COMPLETED')
    return { ...quiet, tone: 'ok', title: 'Tour đã hoàn thành', body: 'Robot đã báo tới điểm cuối của tuyến. Không còn thao tác nào trên Tour này.' }
  if (state === 'CANCELLED') {
    if (unknownGoTo) return {
      tone: 'danger', title: 'Tour đã kết thúc, lệnh di chuyển cuối chưa rõ kết quả', action: 'reconcile', secondary: [], onlyEndEarly: false,
      body: 'Robot có thể vẫn đang thực hiện lệnh này. Đến robot, xác nhận robot đứng yên an toàn rồi đối soát lệnh. Robot chỉ được trả lại sau khi lệnh được đối soát và kỹ thuật viên kiểm tra tại chỗ.',
    }
    return detail.startedAt
      ? { ...quiet, tone: 'warn', title: 'Tour đã kết thúc sớm', body: 'Nếu robot còn đang đi lúc kết thúc, nó được giữ lại cho tới khi kỹ thuật viên kiểm tra tại chỗ; nếu robot đang đứng yên, nó đã được trả.' }
      : { ...quiet, tone: 'warn', title: 'Tour đã bị hủy trước khi bắt đầu', body: 'Tour chưa từng chạy nên không có lệnh robot nào.' }
  }
  if (state !== 'RUNNING')
    return { ...quiet, tone: 'info', title: state === 'READY' ? 'Tour đã chốt nhưng chưa mở' : 'Tour chưa được chốt', body: 'Tour chưa chạy nên chưa có gì để điều hành.' }

  if (execution?.operationalStatus === 'NEEDS_ASSISTANCE') {
    const reason = assistanceInfo(execution.assistanceReason)
    if (unknownGoTo) return {
      tone: 'danger', title: 'Chưa rõ robot đã làm gì với lệnh', action: 'reconcile', secondary: [], onlyEndEarly: false,
      body: 'Robot có thể đã bắt đầu, có thể vẫn đang chạy. Đến robot và xác nhận robot đứng yên an toàn trước. Đối soát đóng lệnh mà không ghi kết quả; sau đó robot cần kỹ thuật viên kiểm tra và Tour chỉ còn Kết thúc sớm.',
    }
    if (command?.state === 'RECONCILED') return {
      tone: 'danger', title: 'Lệnh đã được đối soát, Tour không chạy tiếp được', action: null, secondary: [], onlyEndEarly: true,
      body: 'Kết quả thật của lệnh vẫn chưa rõ, nên máy chủ không gửi thêm lệnh nào. Kết thúc sớm Tour; robot chờ kỹ thuật viên kiểm tra tại chỗ.',
    }
    // Whether this leg may be retried is the server's rule (FAILED, REJECTED, or EXPIRED never taken by the robot);
    // a refusal for other reasons (movement checks) still shows Retry, disabled with its checks.
    const retry = actionGate(detail, 'retryLeg')
    const retryable = Boolean(retry && (retry.allowed || !retry.blockedBy.includes('TOUR_RETRY_NOT_ALLOWED')))
    if (retryable) return {
      tone: 'danger', title: `Robot đã dừng: ${reason.label}`, action: 'retryLeg', secondary: ['skip'], onlyEndEarly: false,
      body: `${causeOf(detail)} Xử lý tại chỗ (kết nối, vị trí, đường đi) rồi cho robot đi lại${targets.current ? ` tới ${targets.current}` : ''}, bỏ qua điểm này, hoặc kết thúc sớm.`,
    }
    return { tone: 'danger', title: `Cần hỗ trợ: ${reason.label}`, action: null, secondary: [], onlyEndEarly: true,
      body: `${causeOf(detail)} Máy chủ không cho thử lại chặng này; kiểm tra robot tại chỗ, rồi kết thúc sớm Tour nếu không tiếp tục được.` }
  }

  if (execution?.operationalStatus === 'PAUSED') return {
    tone: 'warn', title: 'Đã tạm dừng', action: 'retryLeg', secondary: ['skip'], onlyEndEarly: false,
    body: `Robot báo đã dừng${targets.current ? ` trên đường tới ${targets.current}` : ''}. Bấm Tiếp tục khi đường đi thông thoáng; robot đi một chặng mới, không tự chạy lại.`,
  }

  const step = execution?.currentStep
  if (step === 'INITIALIZING') return {
    tone: 'info', title: 'Chuẩn bị khởi hành', action: 'depart', secondary: [], onlyEndEarly: false,
    body: 'Tour đã mở, robot đứng yên ở điểm xuất phát. Kiểm tra camera, bản đồ và robot, đánh dấu 4 xác nhận tại chỗ rồi bấm Khởi hành.',
  }
  if (step === 'OBSERVING') {
    const auto = execution?.autoAdvance
    const autoText = auto?.blockedReason ? 'Hết giờ dừng nhưng robot chưa đi được (xem lý do bên dưới); bấm khi sẵn sàng.'
      : auto?.enabled ? 'Robot tự đi tiếp khi hết giờ dừng. Tắt "Tự đi tiếp" để giữ robot ở đây.'
      : 'Bấm khi đoàn đã xem xong; robot không tự rời điểm dừng.'
    return { tone: 'info', title: 'Đang dừng tại điểm tham quan', action: 'next', secondary: targets.skipped ? ['skip'] : [], onlyEndEarly: false, body: autoText }
  }
  const moving = step ? STEP_LABEL[step] : 'Đang chạy'
  if (command?.cancelRequested) return { ...quiet, tone: 'warn', title: 'Đang dừng…',
    body: 'Đã gửi yêu cầu dừng, chờ robot báo đã dừng. Nếu nguy hiểm, người đi kèm bấm nút dừng khẩn cấp trên robot.' }
  const pause = { action: 'pause' as const, secondary: [], onlyEndEarly: false }
  switch (command?.state) {
    case 'PENDING': {
      // The server keeps a new GoTo until the robot reports it is ready (ADR-0042): say so instead of "waiting".
      const held = robot && (robot.localized !== true ? 'robot báo chưa định vị'
        : robot.motionReady !== true ? robotFaultText(robot.faultCode)?.toLowerCase() ?? 'robot báo chưa sẵn sàng di chuyển' : null)
      return { ...pause, tone: held ? 'warn' : 'info', title: 'Đang gửi lệnh cho robot',
        body: held ? `${moving}. Máy chủ giữ lệnh vì ${held}; robot chưa di chuyển.` : `${moving}. Robot chưa lấy lệnh nên chưa di chuyển.` }
    }
    case 'DELIVERED': return { ...pause, tone: 'info', title: 'Robot đã lấy lệnh', body: `${moving}. Chờ robot báo bắt đầu đi.` }
    case 'ACCEPTED': return { ...pause, tone: 'info', title: moving + (targets.current ? `: ${targets.current}` : ''), body: 'Robot đang đi. Theo dõi camera và bản đồ; bấm Tạm dừng nếu cần dừng chặng này.' }
    default: return { ...quiet, tone: 'info', title: moving, body: 'Chờ máy chủ cập nhật trạng thái lệnh của chặng.' }
  }
}

/** What End Early does to the command the robot holds now, in the server's terms (ADR-0043 D13, D14). */
export function endEarlyEffect(detail: TourDetails): string {
  const command = detail.execution?.command
  if (command?.kind !== 'GoTo' || !['PENDING', 'DELIVERED', 'ACCEPTED', 'UNKNOWN'].includes(command.state))
    return 'Robot đang đứng yên nên được trả ngay, không cần kiểm tra tại chỗ.'
  switch (command.state) {
    case 'PENDING': return 'Robot chưa lấy lệnh di chuyển hiện tại, nên máy chủ rút lệnh lại. Robot được giữ chờ kỹ thuật viên kiểm tra tại chỗ.'
    case 'UNKNOWN': return 'Lệnh di chuyển hiện tại chưa rõ kết quả và được giữ nguyên. Sau khi kết thúc, vẫn cần đối soát lệnh này.'
    default: return 'Robot đã lấy lệnh di chuyển hiện tại, nên máy chủ xếp một lệnh hủy; robot dừng khi lấy được lệnh hủy. Robot được giữ chờ kỹ thuật viên kiểm tra tại chỗ.'
  }
}
