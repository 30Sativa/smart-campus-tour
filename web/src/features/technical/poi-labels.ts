import type { StatusTone } from '../../components/ui/status-tone'

/**
 * Staff-facing wording for a POI revision's lifecycle. The API speaks in
 * revisions, submit and PASS/FAIL; the screen speaks in drafts, "gửi kiểm
 * chứng" and Đạt/Không đạt.
 */
export function poiStatus(revision: { navigationStatus: string; isSubmitted: boolean }): { label: string; tone: StatusTone } {
  if (revision.navigationStatus === 'PASS') return { label: 'Đạt', tone: 'ok' }
  if (revision.navigationStatus === 'FAIL') return { label: 'Không đạt · cần sửa', tone: 'danger' }
  return revision.isSubmitted ? { label: 'Chờ kiểm chứng', tone: 'warn' } : { label: 'Bản nháp', tone: 'muted' }
}

export const cameraPresetLabel: Record<string, string> = { FRONT: 'Phía trước', LEFT: 'Bên trái', RIGHT: 'Bên phải' }

/** ROS yaw (radian) shown as a compass-free whole degree, -180..180. */
export const yawDegrees = (yaw: number) => Math.round((yaw * 180) / Math.PI)

export const mapCheckLabel = (status: string) => status === 'PASSED' ? 'Đạt kiểm tra' : status === 'FAILED' ? 'Kiểm tra không đạt' : 'Chờ kỹ thuật kiểm tra'
