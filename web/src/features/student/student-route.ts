import type { PoiDetail, StudentTourSnapshot } from './student-types'

export type PoiProgress = 'done' | 'now' | 'later'

/** Where a stop sits relative to the robot: already seen, being shown, or still ahead. */
export function poiProgress(poi: PoiDetail, snapshot: Pick<StudentTourSnapshot, 'step' | 'currentPoi' | 'nextPoi'>): PoiProgress {
  if (snapshot.step === 'returning') return 'done'
  // ADR-0065: a voting Tour visits POIs in the order voted, so the server's progress decides, not the StopOrder.
  if (poi.progress) {
    if (poi.progress === 'VISITED' || poi.progress === 'SKIPPED') return 'done'
    return poi.progress === 'CURRENT' && snapshot.currentPoi?.id === poi.id ? 'now' : 'later'
  }
  const current = snapshot.currentPoi?.order
  if (current !== undefined) return poi.order < current ? 'done' : poi.order === current ? 'now' : 'later'
  const next = snapshot.nextPoi?.order
  if (next !== undefined) return poi.order < next ? 'done' : 'later'
  return 'later'
}

/** Rough dwell time in whole minutes, when the POI declares one. */
export function poiMinutes(poi: PoiDetail): number | undefined {
  return poi.dwellSeconds ? Math.max(1, Math.round(poi.dwellSeconds / 60)) : undefined
}

/** The stop's place in words; a voting Tour adds skipped, locked and the decided next POI. `short` drops the reason. */
export function poiStatusText(poi: PoiDetail, state: PoiProgress, short = false): string {
  if (poi.progress === 'SKIPPED') return 'Đã bỏ qua'
  if (poi.lockReason && state !== 'done') return short ? 'Tạm khóa' : `Tạm khóa: ${poi.lockReason}`
  if (poi.progress === 'NEXT') return 'Điểm tiếp theo'
  return POI_PROGRESS_LABEL[state]
}

/** "Điểm 2 / 4": on a voting Tour the count of POIs already passed plus one, since the order is not the StopOrder. */
export function stopPosition(at: PoiDetail, pois: PoiDetail[]): number {
  if (!pois.some((poi) => poi.progress)) return at.order
  return pois.filter((poi) => poi.progress === 'VISITED' || poi.progress === 'SKIPPED').length + 1
}

export const POI_PROGRESS_LABEL: Record<PoiProgress, string> = {
  done: 'Đã xem',
  now: 'Đang xem',
  later: 'Sắp tới',
}
