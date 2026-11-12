import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiClient } from '../../api/client'
import type { ApiResponse } from '../../api/contracts/shared'
import type { StatusTone } from '../../components/ui/status-tone'

/**
 * `GET /api/staff/manage/robots/{code}/headset` (ADR-0056): the Quest headset as the robot's quest-stream reported it
 * with its last camera poll. Works on the deployed site, unlike the LAN-only `http://<NUC>:8080/device`.
 */
export type RobotHeadsetStatus = {
  robotCode: string
  /** False until the robot sends its first report (quest-stream without QUEST_CONTROL_URL never does). */
  reported: boolean
  connection: 'connected' | 'unauthorized' | 'offline' | 'not_found' | 'adb_error' | 'unknown' | null
  batteryPercent: number | null
  charging: boolean | null
  stream: 'live' | 'connecting' | 'paused' | 'lost' | null
  reportedAt: string | null
  /** The robot stopped reporting: the numbers may be out of date. */
  stale: boolean
  /**
   * The headset's display (ADR-0056 addendum). Null: the robot's quest-stream is too old to report it, and cannot run
   * the wake/sleep buttons either.
   */
  screen?: 'awake' | 'asleep' | 'unknown' | null
}

export type HeadsetAction = 'WAKE' | 'SLEEP'

/** `POST /api/staff/manage/robots/{code}/headset/commands`: the press waits for the robot's next camera poll. */
export type HeadsetCommandResult = { robotCode: string; commandId: string; action: HeadsetAction; expiresAt: string }

const REFRESH_MS = 10_000
/** After a press, read the headset again once the robot has had time to poll, run it and report. */
const AFTER_PRESS_MS = [3_000, 7_000, 12_000]
/** A press the screen has not followed by then is said to have failed (the backend drops it after ~20 s). */
export const PRESS_WAIT_MS = 25_000

const headsetKey = (robotCode: string | null | undefined) => ['robot-headset', robotCode] as const

export function useRobotHeadset(robotCode: string | null | undefined) {
  return useQuery({
    queryKey: headsetKey(robotCode),
    queryFn: ({ signal }) =>
      apiClient<ApiResponse<RobotHeadsetStatus>>(`/api/staff/manage/robots/${encodeURIComponent(robotCode!)}/headset`, { signal })
        .then(response => response.data ?? null),
    enabled: Boolean(robotCode),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}

const CONNECTION_TEXT: Record<Exclude<RobotHeadsetStatus['connection'], 'connected' | null>, { text: string; tone: StatusTone }> = {
  not_found: { text: 'Chưa cắm kính vào miniPC', tone: 'danger' },
  offline: { text: 'Kính mất kết nối USB', tone: 'danger' },
  unauthorized: { text: 'Kính chưa cho phép USB debugging (đeo kính, bấm Allow)', tone: 'warn' },
  adb_error: { text: 'Lỗi adb trên miniPC', tone: 'danger' },
  unknown: { text: 'Chưa rõ trạng thái kính', tone: 'muted' },
}

/** One line for the Robot panel, and how worrying it is. A low battery is said before anything else. */
export function headsetSummary(status: RobotHeadsetStatus | null | undefined, failed: boolean): { text: string; tone: StatusTone } {
  if (failed && !status) return { text: 'Không đọc được từ máy chủ', tone: 'muted' }
  if (!status) return { text: 'Đang đọc…', tone: 'muted' }
  if (!status.reported) return { text: 'Robot chưa báo tình trạng kính', tone: 'muted' }
  const old = status.stale ? ' (số liệu cũ)' : ''
  if (status.connection && status.connection !== 'connected') {
    const view = CONNECTION_TEXT[status.connection]
    return { text: view.text + old, tone: status.stale ? 'muted' : view.tone }
  }
  if (status.batteryPercent == null) return { text: 'Đã kết nối, chưa đọc được pin' + old, tone: 'muted' }
  const level = Math.round(status.batteryPercent)
  const tone: StatusTone = status.stale ? 'muted' : level < 20 ? 'danger' : level < 40 ? 'warn' : 'ok'
  return { text: `Pin ${level}%${status.charging ? ' · đang sạc' : ''}${old}`, tone }
}

export function useHeadsetCommand(robotCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: HeadsetAction) =>
      apiClient<ApiResponse<HeadsetCommandResult>>(`/api/staff/manage/robots/${encodeURIComponent(robotCode)}/headset/commands`,
        { method: 'POST', json: { action } }).then(response => response.data),
    onSuccess: () => {
      for (const ms of AFTER_PRESS_MS)
        setTimeout(() => void queryClient.invalidateQueries({ queryKey: headsetKey(robotCode) }), ms)
    },
  })
}

/** The server's own words for a refused press (they say what to fix), or a plain fallback. */
export function headsetCommandError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Không gửi được lệnh tới máy chủ. Hãy thử lại.'
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
  if (error.status === 403) return 'Tài khoản hiện tại không có quyền điều khiển kính.'
  try {
    const message: unknown = (JSON.parse(error.body) as { message?: unknown }).message
    if (error.status < 500 && typeof message === 'string' && message.trim()) return message
  } catch { /* not JSON */ }
  return 'Không gửi được lệnh tới kính. Hãy thử lại.'
}

export type HeadsetPress = { action: HeadsetAction; at: number }

export type HeadsetControlView = {
  /** Buttons to show; empty when the headset cannot take a press now. */
  actions: HeadsetAction[]
  /** The display, in words, or null when unknown. */
  screenText: string | null
  /** What happened to the last press, if anything is worth saying. */
  pressText: string | null
  pressTone: StatusTone
}

const SCREEN_AFTER: Record<HeadsetAction, 'awake' | 'asleep'> = { WAKE: 'awake', SLEEP: 'asleep' }

/**
 * Which wake/sleep buttons fit the headset now (ADR-0056 addendum), and how the last press went. Only a fresh report
 * of a connected headset from a quest-stream that reports its screen gets buttons; a press the screen has not
 * followed within {@link PRESS_WAIT_MS} is said to have failed rather than shown as pending forever.
 */
export function headsetControl(status: RobotHeadsetStatus | null | undefined, press: HeadsetPress | null, now: number): HeadsetControlView {
  const screen = status?.screen ?? null
  const usable = !!status && status.reported && !status.stale && status.connection === 'connected' && screen !== null
  const actions: HeadsetAction[] = !usable ? [] : screen === 'awake' ? ['SLEEP'] : screen === 'asleep' ? ['WAKE'] : ['WAKE', 'SLEEP']
  const screenText = !usable ? null : screen === 'awake' ? 'Màn hình đang bật' : screen === 'asleep' ? 'Kính đang ngủ' : 'Chưa rõ màn hình'
  let pressText: string | null = null
  let pressTone: StatusTone = 'muted'
  if (press && screen !== SCREEN_AFTER[press.action]) {
    if (now - press.at < PRESS_WAIT_MS) {
      pressText = press.action === 'WAKE' ? 'Đã gửi lệnh đánh thức, chờ robot (vài giây)…' : 'Đã gửi lệnh cho ngủ, chờ robot (vài giây)…'
    } else {
      pressText = 'Kính chưa đổi trạng thái. Kiểm tra kính và thử lại.'
      pressTone = 'warn'
    }
  }
  return { actions, screenText, pressText, pressTone }
}
