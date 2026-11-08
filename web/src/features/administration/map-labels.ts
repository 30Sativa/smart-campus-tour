import type { MapVersion, MapVersionItem } from '../technical/api/technical'
import { campusShortDate } from './tours/tour-calendar'

/**
 * How Staff tells maps apart, without version numbers: "{area} · {mapKey}", "(mới nhất)" on the newest
 * map of an area that has two or more, and the upload day only where an area has two or more usable maps
 * to choose between. A reason the map cannot be chosen shares the same brackets: "(mới nhất, chưa có POI
 * đạt)". The map key stays, because two areas may share a display name. Technical screens keep `mapVersionLabel`.
 */
export function staffMapLabels(items: MapVersionItem[], usable: (item: MapVersionItem) => boolean = item => item.canUseForPoiPreparation) {
  const newest = new Map<string, number>()
  const count = new Map<string, number>()
  const usableCount = new Map<string, number>()
  for (const item of items) {
    const area = item.map.areaKey
    newest.set(area, Math.max(newest.get(area) ?? 0, item.map.versionNumber))
    count.set(area, (count.get(area) ?? 0) + 1)
    if (usable(item)) usableCount.set(area, (usableCount.get(area) ?? 0) + 1)
  }
  return (map: Pick<MapVersion, 'areaKey' | 'areaName' | 'mapKey' | 'versionNumber' | 'uploadedAt'>, reason?: string | null) => {
    const uploaded = (usableCount.get(map.areaKey) ?? 0) >= 2 ? ` · tải lên ${campusShortDate(map.uploadedAt)}` : ''
    const notes = [(count.get(map.areaKey) ?? 0) >= 2 && newest.get(map.areaKey) === map.versionNumber && 'mới nhất', reason].filter(Boolean)
    return `${map.areaName} · ${map.mapKey}${uploaded}${notes.length ? ` (${notes.join(', ')})` : ''}`
  }
}

/** The area a map belongs to, in Staff's words, found by version id or by the key a robot or legacy route reports. */
export function mapAreaName(items: MapVersionItem[] | undefined, match: { mapVersionId?: string; mapKey?: string }) {
  const found = items?.find(item => match.mapVersionId ? item.map.id === match.mapVersionId : item.map.mapKey === match.mapKey)
  return found?.map.areaName
}
