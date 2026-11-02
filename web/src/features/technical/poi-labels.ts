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

export const verificationMethodLabel: Record<string, string> = { POSE_CAPTURE: 'Ghi pose trực tiếp trên robot', MANUAL_CHECK: 'Kiểm tra thủ công' }

export const poiImportActionLabel: Record<string, string> = { CREATE: 'Tạo POI mới', NEW_REVISION: 'Thêm phiên bản', NO_CHANGE: 'Không thay đổi' }

export const NARRATION_NEEDED = 'Cần bổ sung nội dung thuyết minh'

export const cameraPresetLabel: Record<string, string> = { FRONT: 'Phía trước', LEFT: 'Bên trái', RIGHT: 'Bên phải' }

/** Two areas may share a display name, so the area key keeps map choices apart. */
export const mapVersionLabel = (map: { areaName: string; versionNumber: number }) => `${map.areaName} · phiên bản ${map.versionNumber}`

export const mapCheckLabel = (status: string) => status === 'PASSED' ? 'Đạt kiểm tra' : status === 'FAILED' ? 'Kiểm tra không đạt' : 'Chờ kỹ thuật kiểm tra'
