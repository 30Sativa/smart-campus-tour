import type { StatusTone } from '../../components/ui/status-tone'
import { headPresetLabel } from './head-camera-preset'
import type { PoiNarrationSummary, PoiProposal } from './api/technical'

/** The four states of a POI revision's navigation check ("Kiểm chứng"). */
export type VerificationState = 'DRAFT' | 'WAIT' | 'PASS' | 'FAIL'

/**
 * Staff-facing wording for the navigation check, the one source for the POI list, its filter chips and map pins,
 * the POI page and its history. The API speaks in submit and PASS/FAIL.
 */
export const VERIFICATION: Record<VerificationState, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Chưa gửi', tone: 'muted' },
  WAIT: { label: 'Chờ kỹ thuật', tone: 'warn' },
  PASS: { label: 'Đạt', tone: 'ok' },
  FAIL: { label: 'Không đạt', tone: 'danger' },
}

/**
 * The check result comes first. A PASS belongs to the navigation fingerprint, so a revision that only changed its
 * name or text keeps the PASS without being submitted again, and a route may use it (SaveRouteRevision).
 */
export const verificationState = (revision: { navigationStatus: string; isSubmitted: boolean }): VerificationState =>
  revision.navigationStatus === 'PASS' ? 'PASS' : revision.navigationStatus === 'FAIL' ? 'FAIL' : revision.isSubmitted ? 'WAIT' : 'DRAFT'

export const poiStatus = (revision: { navigationStatus: string; isSubmitted: boolean }) => VERIFICATION[verificationState(revision)]

/**
 * "Kiểm chứng: …" for a whole POI. Retiring takes a submitted revision out of the technical queue (ADR-0062), so a
 * retired POI is never "Chờ kỹ thuật": nobody will check it until it is used again. A result it already has stays.
 */
export function poiCheckBadge(proposal: Pick<PoiProposal, 'revision' | 'retiredAt'>): { label: string; tone: StatusTone } {
  const state = verificationState(proposal.revision)
  if (!proposal.retiredAt) return VERIFICATION[state]
  if (state === 'WAIT') return { label: 'Không kiểm vì đã ngưng dùng', tone: 'muted' }
  return { label: VERIFICATION[state].label, tone: 'muted' }
}

export const verificationMethodLabel: Record<string, string> = { POSE_CAPTURE: 'Ghi pose trực tiếp trên robot', MANUAL_CHECK: 'Kiểm tra thủ công' }

export const poiImportActionLabel: Record<string, string> = { CREATE: 'Tạo POI mới', NEW_REVISION: 'Thêm phiên bản', NO_CHANGE: 'Không thay đổi' }

/**
 * Where a POI's narration stands ("Thuyết minh"), from the proposal's narration summary (ADR-0060), for the POI
 * list, the POI page and the route picker. Only an approved version can join a new route revision; a draft waits for
 * a second Staff to approve it. Inside the narration tab a draft is still called "bản đang soạn".
 */
export function narrationStatus(summary: PoiNarrationSummary | null | undefined): { label: string; tone: StatusTone; approved: boolean } {
  if (summary?.approved && summary.draft) return { label: 'Đã duyệt · có bản chờ duyệt', tone: 'ok', approved: true }
  if (summary?.approved) return { label: 'Đã duyệt', tone: 'ok', approved: true }
  if (summary?.draft) return { label: 'Chờ duyệt', tone: 'warn', approved: false }
  return { label: 'Chưa có', tone: 'muted', approved: false }
}

/** A route revision takes a POI only with both a navigation PASS and an approved narration, and not once retired (ADR-0062). */
export const usableForRoute = (proposal: PoiProposal) =>
  proposal.revision.navigationStatus === 'PASS' && Boolean(proposal.narration?.approved) && !proposal.retiredAt && !proposal.discardedAt

/** "Dùng được cho tuyến: …", by the server's rule for SaveRouteRevision (PASS, approved narration, not retired or discarded). */
export function routeUseLine(proposal: PoiProposal): { usable: boolean; text: string } {
  if (proposal.discardedAt) return { usable: false, text: 'Không, POI đã bị xoá khỏi danh sách' }
  if (proposal.retiredAt) return { usable: false, text: 'Chưa, vì POI đã ngưng dùng' }
  const reasons = [
    proposal.revision.navigationStatus !== 'PASS' && 'vị trí chưa đạt kiểm chứng',
    !proposal.narration?.approved && 'chưa có thuyết minh đã duyệt',
  ].filter(Boolean)
  return reasons.length ? { usable: false, text: `Chưa, vì ${reasons.join(' và ')}` } : { usable: true, text: 'Có' }
}

/** Two areas may share a display name, so the area key keeps map choices apart. */
export const mapVersionLabel = (map: { areaName: string; areaKey: string; versionNumber: number }) => `${map.areaName} · ${map.areaKey} · phiên bản ${map.versionNumber}`

export const mapCheckLabel = (status: string) => status === 'PASSED' ? 'Từng kiểm tra triển khai đạt' : status === 'FAILED' ? 'Kiểm tra triển khai chưa đạt' : 'Chưa kiểm tra triển khai'

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

/** An area name as the server compares it for MAP_AREA_NAME_TAKEN: trimmed, case ignored. */
const normalizedAreaName = (name: string) => name.trim().toLocaleLowerCase('vi')
export const sameAreaName = (a: string, b: string) => normalizedAreaName(a) === normalizedAreaName(b)

/** Display names used by more than one area key. Only those need the key beside the name to be told apart. */
export function duplicateAreaNames(areas: Array<{ areaKey: string; name: string }>): Set<string> {
  const keysByName = new Map<string, Set<string>>()
  for (const { areaKey, name } of areas) {
    const normalized = normalizedAreaName(name)
    keysByName.set(normalized, (keysByName.get(normalized) ?? new Set()).add(areaKey))
  }
  return new Set([...keysByName].filter(([, keys]) => keys.size > 1).map(([name]) => name))
}

/** "Tầng 6", or "Tầng 6 · tang-6" when another area shares the name. */
export const areaLabel = (name: string, areaKey: string, duplicates: Set<string>) =>
  duplicates.has(normalizedAreaName(name)) ? `${name.trim()} · ${areaKey}` : name.trim()

/** A map version in running text: "Tầng 6 · v1", or "Tầng 6 · tang-6 · v1" when another area shares the name. */
export const mapShortLabel = (map: { areaName: string; areaKey: string; versionNumber: number }, duplicates: Set<string>) =>
  `${areaLabel(map.areaName, map.areaKey, duplicates)} · v${map.versionNumber}`
