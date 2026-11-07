import type { MapVersion, MapVersionItem } from '../technical/api/technical'
import { campusShortDate } from './tours/tour-calendar'

/**
 * How Staff tells maps apart, without version numbers: "{area} · {mapKey}", "(mới nhất)" on an
 * area's newest map, and the upload day only where an area has two or more usable maps to choose
 * between. Technical screens keep `mapVersionLabel`.
 */
export function staffMapLabels(items: MapVersionItem[], usable: (item: MapVersionItem) => boolean = item => item.canUseForPoiPreparation) {
  const newest = new Map<string, number>()
  const usableCount = new Map<string, number>()
  for (const item of items) {
    const area = item.map.areaKey
    newest.set(area, Math.max(newest.get(area) ?? 0, item.map.versionNumber))
    if (usable(item)) usableCount.set(area, (usableCount.get(area) ?? 0) + 1)
  }
  return (map: Pick<MapVersion, 'areaKey' | 'areaName' | 'mapKey' | 'versionNumber' | 'uploadedAt'>) => {
    const uploaded = (usableCount.get(map.areaKey) ?? 0) >= 2 ? ` · tải lên ${campusShortDate(map.uploadedAt)}` : ''
    return `${map.areaName} · ${map.mapKey}${uploaded}${newest.get(map.areaKey) === map.versionNumber ? ' (mới nhất)' : ''}`
  }
}
