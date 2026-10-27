/**
 * Labelled fixtures for the Technical Staff area while `/api/technical/*` does
 * not exist (proposal B7). In-memory only: a reload starts over. Map keys are
 * the real committed map versions; deployment, localization and confirmation
 * records are sample data.
 */
import { ApiError } from '../api/client'
import { mockDelay } from './mock-mode'
import { OCCUPANCY_MAPS } from '../features/administration/pois/map/catalog'
import { useAuthStore } from '../stores/auth-store'
import { isTechnicalRole } from '../auth/roles'
import type { MapVersionStatus, RouteVersionConfirmation } from '../features/technical/types'

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

function seedMaps(): MapVersionStatus[] {
  return OCCUPANCY_MAPS.map((map, index) => index === 0
    ? { mapKey: map.mapKey, deployedAt: hoursAgo(20), deployedBy: 'kythuat01', localization: { passed: true, note: 'Khớp hành lang tầng 6, sai lệch < 5 cm.', at: hoursAgo(19), by: 'kythuat01' } }
    : { mapKey: map.mapKey, deployedAt: hoursAgo(24 * 9), deployedBy: 'kythuat01', localization: { passed: true, note: 'Bản đồ cũ, giữ cho tuyến đã xác nhận.', at: hoursAgo(24 * 9), by: 'kythuat01' } })
}

function seedConfirmations(): RouteVersionConfirmation[] {
  const current = OCCUPANCY_MAPS[0].mapKey
  const legacy = OCCUPANCY_MAPS[1]?.mapKey ?? current
  return [
    { id: 'rv-1', routeName: 'Thư viện – AI Lab', routeVersion: 3, mapKey: current, poiCount: 3, state: 'CONFIRMED', stateNote: null, confirmedAt: hoursAgo(18), confirmedBy: 'kythuat01', note: 'Đã đi từng POI và chạy thử toàn tuyến cùng người vận hành.' },
    { id: 'rv-2', routeName: 'Thư viện – AI Lab', routeVersion: 4, mapKey: current, poiCount: 4, state: 'NEEDS_RECONFIRM', stateNote: 'Version mới thêm POI và đổi thứ tự dừng: ảnh hưởng di chuyển.', confirmedAt: null, confirmedBy: null, note: null },
    { id: 'rv-3', routeName: 'Hành lang tầng 6', routeVersion: 1, mapKey: current, poiCount: 2, state: 'UNCONFIRMED', stateNote: 'Chưa kiểm tra thực tế.', confirmedAt: null, confirmedBy: null, note: null },
    { id: 'rv-4', routeName: 'Thư viện – AI Lab', routeVersion: 2, mapKey: legacy, poiCount: 3, state: 'CONFIRMED', stateNote: null, confirmedAt: hoursAgo(24 * 9), confirmedBy: 'kythuat01', note: 'Version cũ giữ nguyên xác nhận trong cấu hình đã test.' },
  ]
}

let maps = seedMaps()
let confirmations = seedConfirmations()

export function resetTechnicalMock() {
  maps = seedMaps()
  confirmations = seedConfirmations()
}

function caller(): string {
  const user = useAuthStore.getState().user
  if (!isTechnicalRole(user?.role)) throw new ApiError(403, 'Chỉ nhân viên kỹ thuật được ghi xác nhận kỹ thuật.')
  return user?.username ?? 'kythuat'
}

const copy = <T,>(value: T): T => structuredClone(value)

export const mockTechnicalService = {
  maps: () => mockDelay(copy(maps)),
  confirmations: () => mockDelay(copy(confirmations)),
  recordDeployment(mapKey: string) {
    const by = caller()
    maps = maps.map((m) => m.mapKey === mapKey ? { ...m, deployedAt: new Date().toISOString(), deployedBy: by, localization: null } : m)
    return mockDelay(null)
  },
  recordLocalization(mapKey: string, passed: boolean, note: string) {
    const by = caller()
    const map = maps.find((m) => m.mapKey === mapKey)
    if (!map?.deployedAt) throw new ApiError(409, 'Ghi đã deploy map lên robot trước khi kiểm tra localization.')
    maps = maps.map((m) => m.mapKey === mapKey ? { ...m, localization: { passed, note, at: new Date().toISOString(), by } } : m)
    return mockDelay(null)
  },
  confirm(id: string, note: string) {
    const by = caller()
    const item = confirmations.find((c) => c.id === id)
    if (!item) throw new ApiError(404, 'Không tìm thấy version tuyến.')
    const map = maps.find((m) => m.mapKey === item.mapKey)
    if (!map?.localization?.passed) throw new ApiError(409, 'Map của version này chưa đạt kiểm tra localization.')
    confirmations = confirmations.map((c) => c.id === id ? { ...c, state: 'CONFIRMED', stateNote: null, confirmedAt: new Date().toISOString(), confirmedBy: by, note } : c)
    return mockDelay(null)
  },
  revoke(id: string, reason: string) {
    caller()
    confirmations = confirmations.map((c) => c.id === id ? { ...c, state: 'UNCONFIRMED', stateNote: `Đã thu hồi: ${reason}`, confirmedAt: null, confirmedBy: null, note: null } : c)
    return mockDelay(null)
  },
}
