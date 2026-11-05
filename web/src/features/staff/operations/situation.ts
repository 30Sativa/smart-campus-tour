import type { TourActionAvailability, TourDetails } from '../../administration/tours/types'
import { STEP_LABEL, assistanceInfo } from './operation-labels'

/** The console actions that a situation can point at. End Early has its own place and is never the suggested step. */
export type ConsoleAction = 'next' | 'retryLeg' | 'reconcile'

export type Situation = {
  tone: 'ok' | 'info' | 'warn' | 'danger'
  title: string
  body: string
  /** The one action this situation calls for; whether it may run now is still the server's `allowedActions`. */
  action: ConsoleAction | null
  /** No action of the console can continue the Tour; End Early is the remaining way out. */
  onlyEndEarly: boolean
}

export function actionGate(detail: TourDetails, action: ConsoleAction | 'endEarly'): TourActionAvailability | null {
  return detail.allowedActions?.[action] ?? null
}

/**
 * What is happening now and what a person should do next, in one sentence each,
 * from the server's answer only. The command's own state comes first: a Tour's
 * assistance reason says why it stopped, the command says what the robot may
 * still be doing. Nothing here enables a button; the server's gate does.
 */
export function tourSituation(detail: TourDetails): Situation {
  const { state } = detail.tour
  const execution = detail.execution
  const command = execution?.command
  const unknownGoTo = command?.kind === 'GoTo' && command.state === 'UNKNOWN'
  const quiet = { action: null, onlyEndEarly: false } as const

  if (state === 'COMPLETED')
    return { ...quiet, tone: 'ok', title: 'Tour đã hoàn thành', body: 'Robot đã báo tới điểm cuối của tuyến. Không còn thao tác nào trên Tour này.' }
  if (state === 'CANCELLED') {
    if (unknownGoTo) return {
      tone: 'danger', title: 'Tour đã kết thúc, lệnh di chuyển cuối chưa rõ kết quả', action: 'reconcile', onlyEndEarly: false,
      body: 'Robot có thể vẫn đang thực hiện lệnh này. Đến robot, xác nhận robot đứng yên an toàn rồi đối soát lệnh. Robot chỉ được trả lại sau khi lệnh được đối soát và kỹ thuật viên kiểm tra tại chỗ.',
    }
    return detail.startedAt
      ? { ...quiet, tone: 'warn', title: 'Tour đã kết thúc sớm', body: 'Robot được giữ lại cho tới khi kỹ thuật viên kiểm tra tại chỗ và trả robot. Màn hình này không xác nhận robot đã dừng.' }
      : { ...quiet, tone: 'warn', title: 'Tour đã bị hủy trước khi bắt đầu', body: 'Tour chưa từng chạy nên không có lệnh robot nào.' }
  }
  if (state !== 'RUNNING')
    return { ...quiet, tone: 'info', title: state === 'READY' ? 'Tour đã chốt nhưng chưa bắt đầu' : 'Tour chưa được chốt', body: 'Tour chưa chạy nên chưa có gì để điều hành.' }

  if (execution?.operationalStatus === 'NEEDS_ASSISTANCE') {
    const reason = assistanceInfo(execution.assistanceReason)
    if (unknownGoTo) return {
      tone: 'danger', title: 'Chưa rõ robot đã làm gì với lệnh', action: 'reconcile', onlyEndEarly: false,
      body: 'Robot có thể đã bắt đầu, có thể vẫn đang chạy. Đến robot và xác nhận robot đứng yên an toàn trước. Đối soát đóng lệnh mà không ghi kết quả; sau đó robot cần kỹ thuật viên kiểm tra và Tour chỉ còn Kết thúc sớm.',
    }
    if (command?.state === 'RECONCILED') return {
      tone: 'danger', title: 'Lệnh đã được đối soát, Tour không chạy tiếp được', action: null, onlyEndEarly: true,
      body: 'Kết quả thật của lệnh vẫn chưa rõ, nên máy chủ không gửi thêm lệnh nào. Kết thúc sớm Tour; robot chờ kỹ thuật viên kiểm tra tại chỗ.',
    }
    if (command?.state === 'EXPIRED') return {
      tone: 'danger', title: `Cần hỗ trợ: ${reason.label}`, action: null, onlyEndEarly: true,
      body: 'Robot không lấy lệnh trước thời hạn nên lệnh đã hết hiệu lực; robot chưa nhận lệnh này. Máy chủ không cho thử lại chặng sau khi hết hạn. Kiểm tra robot tại chỗ, rồi kết thúc sớm Tour nếu không tiếp tục được.',
    }
    const retry = actionGate(detail, 'retryLeg')
    // Retry exists for a leg that really ended FAILED or REJECTED; a refusal for other reasons (movement checks) still shows it, disabled.
    if (retry && (retry.allowed || !retry.blockedBy.includes('TOUR_RETRY_NOT_ALLOWED'))) return {
      tone: 'danger', title: `Cần hỗ trợ: ${reason.label}`, action: 'retryLeg', onlyEndEarly: false,
      body: `${reason.hint} Xử lý nguyên nhân tại chỗ rồi thử lại chặng, hoặc kết thúc sớm Tour.`,
    }
    return { tone: 'danger', title: `Cần hỗ trợ: ${reason.label}`, action: null, onlyEndEarly: true,
      body: `${reason.hint} Máy chủ không cho thử lại chặng này; kết thúc sớm Tour nếu không tiếp tục được.` }
  }

  const step = execution?.currentStep
  if (step === 'OBSERVING')
    return { tone: 'info', title: 'Đang dừng tại điểm tham quan', action: 'next', onlyEndEarly: false,
      body: 'Bấm Đi tiếp khi đoàn đã xem xong. Tour không tự rời điểm dừng khi hết thời gian gợi ý.' }
  const moving = step ? STEP_LABEL[step] : 'Đang chạy'
  switch (command?.state) {
    case 'PENDING': return { ...quiet, tone: 'info', title: 'Chờ robot lấy lệnh', body: `${moving}. Lệnh đã lưu trên máy chủ nhưng robot chưa lấy về, nên robot chưa di chuyển vì lệnh này.` }
    case 'DELIVERED': return { ...quiet, tone: 'info', title: 'Robot đã lấy lệnh, chưa báo nhận', body: `${moving}. Chờ robot báo đã nhận lệnh.` }
    case 'ACCEPTED': return { ...quiet, tone: 'info', title: moving, body: 'Robot báo đã nhận lệnh và đang thực hiện. Theo dõi robot tại chỗ; Đi tiếp mở khi robot báo tới điểm dừng.' }
    default: return { ...quiet, tone: 'info', title: moving, body: 'Chờ máy chủ cập nhật trạng thái lệnh của chặng.' }
  }
}

/** What End Early does to the command the robot holds now, in the server's terms (ADR-0043 D13, D14). */
export function endEarlyEffect(detail: TourDetails): string {
  const command = detail.execution?.command
  if (command?.kind !== 'GoTo') return 'Robot không còn lệnh di chuyển nào đang mở.'
  switch (command.state) {
    case 'PENDING': return 'Robot chưa lấy lệnh di chuyển hiện tại, nên máy chủ rút lệnh lại.'
    case 'DELIVERED':
    case 'ACCEPTED': return 'Robot đã lấy lệnh di chuyển hiện tại, nên máy chủ xếp một lệnh hủy. Robot chỉ dừng chặng khi lấy được lệnh hủy; kết quả thật của chặng vẫn được ghi khi robot báo.'
    case 'UNKNOWN': return 'Lệnh di chuyển hiện tại chưa rõ kết quả và được giữ nguyên. Sau khi kết thúc, vẫn cần đối soát lệnh này.'
    default: return 'Lệnh di chuyển của chặng hiện tại đã kết thúc.'
  }
}
