import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client'
import type { ApiResponse } from '../../api/contracts/shared'
import type { StreamAccess } from './stream-access'

/** `POST /api/staff/manage/robots/{code}/camera-lease` (ADR-0052). */
export type RobotCameraStatus = {
  robotCode: string
  /** The robot is told to capture now. */
  wanted: boolean
  reason: 'TOUR_RUNNING' | 'STAFF_WATCHING' | 'IDLE'
  /** quest-stream on the robot asked the backend recently; false = it cannot be switched on from here. */
  robotListening: boolean
  lastPollAt: string | null
  leaseUntil: string | null
  /** Relay URL and this Staff user's token (ADR-0055); null when the relay does not carry this robot. */
  stream?: StreamAccess | null
}

/** Well inside the backend's 2-minute lease, so an open page never lets the camera go off. */
const RENEW_MS = 30_000

/**
 * Keeps a robot's Quest camera on while the calling page is open and visible.
 * Hidden tabs stop renewing, so the camera goes off by itself about two
 * minutes after the last page closes.
 */
export function useCameraLease(robotCode: string | null | undefined) {
  return useQuery({
    queryKey: ['camera-lease', robotCode],
    queryFn: () =>
      apiClient<ApiResponse<RobotCameraStatus>>(`/api/staff/manage/robots/${encodeURIComponent(robotCode!)}/camera-lease`, {
        method: 'POST',
      }).then(response => response.data!),
    enabled: Boolean(robotCode),
    refetchInterval: RENEW_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}

/** What the camera panel says while it has no picture, from the last lease answer. */
export function cameraLeaseHint(status: RobotCameraStatus | undefined, failed: boolean): string | undefined {
  if (failed) return 'Không gửi được yêu cầu bật camera tới máy chủ. Đang thử lại…'
  if (!status) return undefined
  if (!status.robotListening)
    return 'Robot chưa nhận yêu cầu bật camera. Kiểm tra robot đang bật và có mạng, còn lỗi thì báo Kỹ thuật kiểm tra.'
  return 'Đang bật camera trên robot. Hình sẽ lên sau khoảng 30 giây.'
}
