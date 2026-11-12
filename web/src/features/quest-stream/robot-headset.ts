import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
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
}

const REFRESH_MS = 10_000

export function useRobotHeadset(robotCode: string | null | undefined) {
  return useQuery({
    queryKey: ['robot-headset', robotCode],
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
