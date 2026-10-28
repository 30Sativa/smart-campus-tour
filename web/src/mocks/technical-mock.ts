/**
 * Labelled fixtures for the Technical Staff area while `/api/technical/*` does
 * not exist (proposal B7). In-memory only: a reload starts over. Map keys and
 * map images are the real committed map versions; POI positions sit on free
 * cells of map2-v2. Deployment, localization, POI checks and confirmations are
 * sample data. The rules the server must enforce are enforced here too, so the
 * screens show the refusals the real API will give.
 */
import { ApiError } from '../api/client'
import { mockDelay } from './mock-mode'
import { OCCUPANCY_MAPS } from '../features/administration/pois/map/catalog'
import { useAuthStore } from '../stores/auth-store'
import { isTechnicalRole } from '../auth/roles'
import type {
  ActivityKind, DeploymentInput, LocalizationInput, MapUploadInput, MapVersionStatus, PoiCheckInput,
  RouteTestInput, RouteVersionConfirmation, TechnicalActivity, TechnicalPoi,
} from '../features/technical/types'

export const TECHNICAL_ROBOTS = ['AMR-01']
/** Sample Staff operators a route test is run with. */
export const TECHNICAL_OPERATORS = ['Nguyễn Văn An', 'Trần Thị Bình']

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
const CURRENT = OCCUPANCY_MAPS[0].mapKey
const LEGACY = OCCUPANCY_MAPS[1]?.mapKey ?? CURRENT

function seedMaps(): MapVersionStatus[] {
  return [
    { mapKey: CURRENT, area: 'Tầng 6 · tòa Alpha', checksum: '1d2cd4d1…fec9', packageSize: '4.2 MB', uploadedAt: hoursAgo(46), uploadedBy: 'kythuat01', changeNote: 'Quét lại hành lang, thêm khu Robotics.', deployedAt: hoursAgo(20), deployedBy: 'kythuat01', deployedRobot: 'AMR-01', onRobot: true, localization: { passed: true, errorCm: 4.2, points: [{ label: 'Sảnh thang máy', errorCm: 3 }, { label: 'Thư viện', errorCm: 5 }, { label: 'AI Lab', errorCm: 4 }], note: 'Khớp hành lang tầng 6, Twin không lệch góc.', at: hoursAgo(19), by: 'kythuat01' } },
    { mapKey: LEGACY, area: 'Tầng 6 · tòa Alpha', checksum: '8a41e0b7…22c3', packageSize: '3.9 MB', uploadedAt: hoursAgo(24 * 19), uploadedBy: 'kythuat01', changeNote: 'Bản đầu tiên.', deployedAt: hoursAgo(24 * 9), deployedBy: 'kythuat01', deployedRobot: 'AMR-01', onRobot: false, localization: { passed: true, errorCm: 5.1, points: [{ label: 'Sảnh thang máy', errorCm: 4 }, { label: 'Thư viện', errorCm: 6 }], note: 'Bản đồ cũ, giữ cho tuyến đã xác nhận.', at: hoursAgo(24 * 9), by: 'kythuat01' } },
  ]
}

const verified = (at: number, errorCm: number) => ({ passed: true, errorCm, note: `Đạt · lệch ${errorCm} cm`, at: hoursAgo(at), by: 'kythuat01' })

function seedPois(): TechnicalPoi[] {
  return [
    { id: 'tp-1', name: 'Sảnh thang máy', mapKey: CURRENT, x: 10.2, y: 6.35, yaw: 0, source: 'STAFF_PROPOSAL', state: 'VERIFIED', cameraAngle: 'FRONT', revision: 2, lastCheck: verified(18, 3) },
    { id: 'tp-2', name: 'Thư viện', mapKey: CURRENT, x: 34.2, y: 1.55, yaw: 1.57, source: 'STAFF_PROPOSAL', state: 'VERIFIED', cameraAngle: 'LEFT', revision: 1, lastCheck: verified(18, 4) },
    { id: 'tp-3', name: 'AI Lab', mapKey: CURRENT, x: 9.6, y: -13.75, yaw: -1.57, source: 'STAFF_PROPOSAL', state: 'VERIFIED', cameraAngle: 'RIGHT', revision: 1, lastCheck: verified(18, 5) },
    { id: 'tp-4', name: 'Phòng Robotics', mapKey: CURRENT, x: 42.3, y: -23.65, yaw: 3.14, source: 'STAFF_PROPOSAL', state: 'PENDING', cameraAngle: null, revision: 1, lastCheck: null },
    { id: 'tp-5', name: 'Hành lang tầng 6', mapKey: CURRENT, x: 12.3, y: -33.55, yaw: 0, source: 'STAFF_PROPOSAL', state: 'VERIFIED', cameraAngle: 'FRONT', revision: 1, lastCheck: verified(17, 4) },
    { id: 'tp-6', name: 'Khu trưng bày', mapKey: CURRENT, x: 41.7, y: -46.75, yaw: 1.57, source: 'YAML_IMPORT', state: 'PENDING', cameraAngle: null, revision: 1, lastCheck: null },
    { id: 'tp-7', name: 'Phòng hội thảo', mapKey: CURRENT, x: 14.7, y: -53.65, yaw: -1.57, source: 'STAFF_PROPOSAL', state: 'FAILED', cameraAngle: 'FRONT', revision: 1, lastCheck: { passed: false, errorCm: 18, note: 'Robot lệch 18 cm, vướng cánh cửa khi quay.', at: hoursAgo(30), by: 'kythuat01' } },
    { id: 'lp-1', name: 'Sảnh thang máy', mapKey: LEGACY, x: 10.2, y: 6.35, yaw: 0, source: 'STAFF_PROPOSAL', state: 'VERIFIED', cameraAngle: 'FRONT', revision: 1, lastCheck: verified(24 * 9, 4) },
    { id: 'lp-2', name: 'Thư viện', mapKey: LEGACY, x: 34.2, y: 1.55, yaw: 1.57, source: 'STAFF_PROPOSAL', state: 'VERIFIED', cameraAngle: 'LEFT', revision: 1, lastCheck: verified(24 * 9, 6) },
    { id: 'lp-3', name: 'AI Lab', mapKey: LEGACY, x: 9.6, y: -13.75, yaw: -1.57, source: 'STAFF_PROPOSAL', state: 'VERIFIED', cameraAngle: 'RIGHT', revision: 1, lastCheck: verified(24 * 9, 5) },
  ]
}

function seedConfirmations(): RouteVersionConfirmation[] {
  const base = { branches: [], inheritedFrom: null, blockingSession: null, stateNote: null, confirmedAt: null, confirmedBy: null, testedWith: null, note: null }
  return [
    { ...base, id: 'rv-1', routeName: 'Thư viện – AI Lab', routeVersion: '3', mapKey: CURRENT, poiCount: 3, stopIds: ['tp-1', 'tp-2', 'tp-3'], changes: [{ text: `Chuyển sang ${CURRENT}`, affectsMovement: true }], previousVersion: '2', state: 'CONFIRMED', confirmedAt: hoursAgo(18), confirmedBy: 'kythuat01', testedWith: 'Nguyễn Văn An', note: 'Đã đi từng POI và chạy thử toàn tuyến cùng người vận hành.', history: [{ at: hoursAgo(18), text: 'Xác nhận kỹ thuật sau khi chạy thử cùng Nguyễn Văn An.' }] },
    { ...base, id: 'rv-2', routeName: 'Thư viện – AI Lab', routeVersion: '4', mapKey: CURRENT, poiCount: 4, stopIds: ['tp-1', 'tp-2', 'tp-4', 'tp-3'], branches: ['Nhánh rẽ: AI Lab → Hành lang tầng 6'], changes: [{ text: 'Thêm điểm dừng Phòng Robotics', affectsMovement: true }, { text: 'Đổi thứ tự dừng 3–4', affectsMovement: true }, { text: 'Sửa thuyết minh tại Thư viện', affectsMovement: false }], previousVersion: '3', blockingSession: 'buổi 30/10 · 09:00', state: 'NEEDS_RECONFIRM', stateNote: 'Version mới thêm POI và đổi thứ tự dừng: ảnh hưởng di chuyển.', history: [{ at: hoursAgo(10), text: 'Staff tạo v4 từ v3. Có thay đổi ảnh hưởng di chuyển nên không thừa hưởng xác nhận.' }] },
    { ...base, id: 'rv-5', routeName: 'Thư viện – AI Lab', routeVersion: '3.1', mapKey: CURRENT, poiCount: 3, stopIds: ['tp-1', 'tp-2', 'tp-3'], changes: [{ text: 'Sửa thuyết minh tại Sảnh thang máy', affectsMovement: false }], previousVersion: '3', inheritedFrom: '3', state: 'CONFIRMED', confirmedAt: hoursAgo(18), confirmedBy: 'kythuat01', testedWith: 'Nguyễn Văn An', note: 'Giữ xác nhận của v3.', history: [{ at: hoursAgo(6), text: 'Chỉ đổi thuyết minh: giữ xác nhận của v3, không cần chạy lại navigation.' }] },
    { ...base, id: 'rv-3', routeName: 'Hành lang tầng 6', routeVersion: '1', mapKey: CURRENT, poiCount: 2, stopIds: ['tp-3', 'tp-5'], changes: [{ text: 'Tuyến mới', affectsMovement: true }], previousVersion: null, state: 'UNCONFIRMED', stateNote: 'Chưa kiểm tra thực tế.', history: [{ at: hoursAgo(26), text: 'Staff soạn tuyến mới.' }] },
    { ...base, id: 'rv-4', routeName: 'Thư viện – AI Lab', routeVersion: '2', mapKey: LEGACY, poiCount: 3, stopIds: ['lp-1', 'lp-2', 'lp-3'], changes: [{ text: 'Thêm AI Lab', affectsMovement: true }], previousVersion: '1', state: 'CONFIRMED', confirmedAt: hoursAgo(24 * 9), confirmedBy: 'kythuat01', testedWith: 'Trần Thị Bình', note: 'Version cũ giữ nguyên xác nhận trong cấu hình đã test.', history: [{ at: hoursAgo(24 * 9), text: 'Xác nhận kỹ thuật.' }] },
  ]
}

function seedActivity(): TechnicalActivity[] {
  const entry = (h: number, by: string, kind: ActivityKind, action: string, target: string, note: string) => ({ id: `a-${h}-${action}`, at: hoursAgo(h), by, kind, action, target, note })
  return [
    entry(6, 'staff01', 'ROUTE', 'Sửa thuyết minh', 'Thư viện – AI Lab v3.1', 'Giữ xác nhận của v3'),
    entry(10, 'staff01', 'ROUTE', 'Tạo version tuyến', 'Thư viện – AI Lab v4', 'Đổi thứ tự dừng: cần xác nhận lại'),
    entry(18, 'kythuat01', 'ROUTE', 'Xác nhận kỹ thuật', 'Thư viện – AI Lab v3', 'Chạy thử cùng Nguyễn Văn An'),
    entry(19, 'kythuat01', 'MAP', 'Ghi localization', CURRENT, 'Đạt · lệch 4.2 cm'),
    entry(20, 'kythuat01', 'MAP', 'Ghi deploy', `${CURRENT} → AMR-01`, 'Checksum khớp'),
    entry(30, 'kythuat01', 'POI', 'Xác minh POI', 'Phòng hội thảo', 'Không đạt · vướng cửa'),
    entry(46, 'kythuat01', 'MAP', 'Upload version map', CURRENT, 'Quét lại hành lang, thêm khu Robotics.'),
  ]
}

let maps = seedMaps()
let pois = seedPois()
let confirmations = seedConfirmations()
let activity = seedActivity()

export function resetTechnicalMock() {
  maps = seedMaps()
  pois = seedPois()
  confirmations = seedConfirmations()
  activity = seedActivity()
}

function caller(): string {
  const user = useAuthStore.getState().user
  if (!isTechnicalRole(user?.role)) throw new ApiError(403, 'Chỉ nhân viên kỹ thuật được ghi xác nhận kỹ thuật.')
  return user?.username ?? 'kythuat'
}

function log(by: string, kind: ActivityKind, action: string, target: string, note: string) {
  activity = [{ id: `a-${Date.now()}-${activity.length}`, at: new Date().toISOString(), by, kind, action, target, note }, ...activity]
}

const copy = <T,>(value: T): T => structuredClone(value)
const routeLabel = (item: RouteVersionConfirmation) => `${item.routeName} v${item.routeVersion}`
const localized = (mapKey: string) => maps.find((m) => m.mapKey === mapKey)?.localization?.passed === true

export const mockTechnicalService = {
  maps: () => mockDelay(copy(maps)),
  pois: () => mockDelay(copy(pois)),
  confirmations: () => mockDelay(copy(confirmations)),
  activity: () => mockDelay(copy(activity)),

  uploadMap(input: MapUploadInput) {
    const by = caller()
    if (maps.some((m) => m.mapKey === input.mapKey)) throw new ApiError(409, `Version ${input.mapKey} đã tồn tại.`)
    maps = [{ mapKey: input.mapKey, area: input.area, checksum: input.checksum, packageSize: input.packageSize, uploadedAt: new Date().toISOString(), uploadedBy: by, changeNote: input.changeNote, deployedAt: null, deployedBy: null, deployedRobot: null, onRobot: false, localization: null }, ...maps]
    log(by, 'MAP', 'Upload version map', input.mapKey, input.changeNote || input.fileName)
    return mockDelay(null)
  },
  recordDeployment({ mapKey, robot, checksumMatched }: DeploymentInput) {
    const by = caller()
    if (!checksumMatched) throw new ApiError(409, 'Checksum trên robot phải khớp package trước khi ghi deploy.')
    maps = maps.map((m): MapVersionStatus => m.mapKey === mapKey
      ? { ...m, deployedAt: new Date().toISOString(), deployedBy: by, deployedRobot: robot, onRobot: true, localization: null }
      : { ...m, onRobot: false })
    log(by, 'MAP', 'Ghi deploy', `${mapKey} → ${robot}`, 'Checksum khớp · kết quả localization cũ đã xóa')
    return mockDelay(null)
  },
  recordLocalization({ mapKey, passed, errorCm, points, note }: LocalizationInput) {
    const by = caller()
    const map = maps.find((m) => m.mapKey === mapKey)
    if (!map?.deployedAt) throw new ApiError(409, 'Ghi đã deploy map lên robot trước khi kiểm tra localization.')
    maps = maps.map((m): MapVersionStatus => m.mapKey === mapKey ? { ...m, localization: { passed, errorCm, points, note, at: new Date().toISOString(), by } } : m)
    log(by, 'MAP', 'Ghi localization', mapKey, `${passed ? 'Đạt' : 'Không đạt'} · lệch ${errorCm} cm`)
    return mockDelay(null)
  },
  reopenLocalization(mapKey: string) {
    const by = caller()
    maps = maps.map((m): MapVersionStatus => m.mapKey === mapKey ? { ...m, localization: null } : m)
    log(by, 'MAP', 'Mở đo lại localization', mapKey, '')
    return mockDelay(null)
  },
  verifyPoi({ id, passed, arrived, framingOk, cameraAngle, errorCm, note }: PoiCheckInput) {
    const by = caller()
    const poi = pois.find((p) => p.id === id)
    if (!poi) throw new ApiError(404, 'Không tìm thấy POI.')
    if (!localized(poi.mapKey)) throw new ApiError(409, `Map ${poi.mapKey} chưa đạt localization.`)
    if (passed && (!arrived || !framingOk || !cameraAngle)) throw new ApiError(409, 'Đạt cần: robot tới đúng vị trí, chọn góc camera và khung hình đúng nội dung.')
    const text = [passed ? 'Đạt' : 'Không đạt', errorCm != null ? `lệch ${errorCm} cm` : null, note || null].filter(Boolean).join(' · ')
    pois = pois.map((p): TechnicalPoi => p.id === id ? { ...p, state: passed ? 'VERIFIED' : 'FAILED', cameraAngle: cameraAngle ?? p.cameraAngle, lastCheck: { passed, errorCm, note: text, at: new Date().toISOString(), by } } : p)
    log(by, 'POI', 'Xác minh POI', `${poi.name} (${poi.mapKey})`, text)
    return mockDelay(null)
  },
  confirm(id: string, note: string, operator: string | null = null) {
    const by = caller()
    const item = confirmations.find((c) => c.id === id)
    if (!item) throw new ApiError(404, 'Không tìm thấy version tuyến.')
    if (!localized(item.mapKey)) throw new ApiError(409, 'Map của version này chưa đạt kiểm tra localization.')
    const open = item.stopIds.map((stop) => pois.find((p) => p.id === stop)).filter((p) => p?.state !== 'VERIFIED')
    if (open.length) throw new ApiError(409, `Còn POI chưa xác minh: ${open.map((p) => p?.name ?? '?').join(', ')}.`)
    const at = new Date().toISOString()
    confirmations = confirmations.map((c): RouteVersionConfirmation => c.id === id
      ? { ...c, state: 'CONFIRMED', stateNote: null, blockingSession: null, confirmedAt: at, confirmedBy: by, testedWith: operator, note, history: [{ at, text: `Xác nhận kỹ thuật${operator ? ` sau khi chạy thử cùng ${operator}` : ''}${note ? `: ${note}` : ''}` }, ...c.history] }
      : c)
    log(by, 'ROUTE', 'Xác nhận kỹ thuật', routeLabel(item), operator ? `Chạy thử cùng ${operator}` : note)
    return mockDelay(null)
  },
  recordFailedTest({ id, operator, note }: RouteTestInput) {
    const by = caller()
    const item = confirmations.find((c) => c.id === id)
    if (!item) throw new ApiError(404, 'Không tìm thấy version tuyến.')
    const at = new Date().toISOString()
    confirmations = confirmations.map((c): RouteVersionConfirmation => c.id === id ? { ...c, history: [{ at, text: `Test không đạt cùng ${operator}${note ? `: ${note}` : ''}` }, ...c.history] } : c)
    log(by, 'ROUTE', 'Test không đạt', routeLabel(item), note)
    return mockDelay(null)
  },
  revoke(id: string, reason: string) {
    const by = caller()
    const item = confirmations.find((c) => c.id === id)
    const at = new Date().toISOString()
    confirmations = confirmations.map((c): RouteVersionConfirmation => c.id === id
      ? { ...c, state: 'UNCONFIRMED', stateNote: `Đã thu hồi: ${reason}`, inheritedFrom: null, confirmedAt: null, confirmedBy: null, testedWith: null, note: null, history: [{ at, text: `Thu hồi xác nhận: ${reason}` }, ...c.history] }
      : c)
    if (item) log(by, 'ROUTE', 'Thu hồi xác nhận', routeLabel(item), reason)
    return mockDelay(null)
  },
}
