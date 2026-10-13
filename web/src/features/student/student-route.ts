import type { PoiDetail, StudentTourSnapshot } from './student-types'

export type PoiProgress = 'done' | 'now' | 'later'

/** Where a stop sits relative to the robot: already seen, being shown, or still ahead. */
export function poiProgress(poi: PoiDetail, snapshot: Pick<StudentTourSnapshot, 'step' | 'currentPoi' | 'nextPoi'>): PoiProgress {
  if (snapshot.step === 'returning') return 'done'
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

export const POI_PROGRESS_LABEL: Record<PoiProgress, string> = {
  done: 'Đã xem',
  now: 'Đang xem',
  later: 'Sắp tới',
}
