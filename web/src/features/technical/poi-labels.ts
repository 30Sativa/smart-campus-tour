import type { StatusTone } from '../../components/ui/status-tone'
import { headPresetLabel } from './head-camera-preset'

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

/** Two areas may share a display name, so the area key keeps map choices apart. */
export const mapVersionLabel = (map: { areaName: string; areaKey: string; versionNumber: number }) => `${map.areaName} · ${map.areaKey} · phiên bản ${map.versionNumber}`

export const mapCheckLabel = (status: string) => status === 'PASSED' ? 'Đạt kiểm tra' : status === 'FAILED' ? 'Kiểm tra không đạt' : 'Chờ kỹ thuật kiểm tra'

/**
 * The four on-site observations of a manual POI check, in the order the API stores them
 * (reached, stopped, localization, camera head). The last one names what the head should do at this POI,
 * so the checker confirms that action rather than a generic "camera".
 */
export const poiObservationLabels = (cameraPreset: string): [string, string, string, string] => [
  'Robot tới đúng POI',
  'Robot dừng đúng vị trí',
  'Định vị đạt',
  `Đầu camera làm đúng: ${headPresetLabel(cameraPreset)}`,
]

/** Display names used by more than one area key. Only those need the key beside the name to be told apart. */
export function duplicateAreaNames(areas: Array<{ areaKey: string; name: string }>): Set<string> {
  const keysByName = new Map<string, Set<string>>()
  for (const { areaKey, name } of areas) {
    const normalized = name.trim().toLocaleLowerCase('vi')
    keysByName.set(normalized, (keysByName.get(normalized) ?? new Set()).add(areaKey))
  }
  return new Set([...keysByName].filter(([, keys]) => keys.size > 1).map(([name]) => name))
}

/** "Tầng 6", or "Tầng 6 · tang-6" when another area shares the name. */
export const areaLabel = (name: string, areaKey: string, duplicates: Set<string>) =>
  duplicates.has(name.trim().toLocaleLowerCase('vi')) ? `${name} · ${areaKey}` : name
