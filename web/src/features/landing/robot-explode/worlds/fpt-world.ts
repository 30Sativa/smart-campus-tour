import type { DriveState } from '../drive'
import { CAMPUS_STOPS, campusCanMove, campusFree, campusRoute } from './fpt-campus'
import { campusCrowd, senseCrowd } from './fpt-crowd'
import { FptCampusLights, FptCampusMap } from './FptCampusMap'
import type { DriveWorld } from './world'

/** Outdoor: the FPT University campus demo map, with people and traffic, by day or night. */
export const fptWorld: DriveWorld = {
  id: 'fpt',
  label: 'Khuôn viên FPT',
  title: 'Đại học FPT TP.HCM · Khu Công nghệ cao (minh họa)',
  scale: 1,
  floorY: 0.04,
  toScene: point => [point.x, point.y],
  canMove: campusCanMove,
  stops: CAMPUS_STOPS,
  start: { stop: 0, yaw: Math.PI / 2 },
  route: campusRoute,
  cameraRoom: (at, yaw, reach) => {
    let room = 0
    for (let d = 0.5; d <= reach + 1e-9; d += 0.5) {
      if (!campusFree({ x: at.x - Math.cos(yaw) * d, y: at.y - Math.sin(yaw) * d })) break
      room = d
    }
    // Trees and lamp posts behind are fine for a camera high above them; only buildings count.
    return Math.max(room, reach * 0.6)
  },
  chase: { back: 7, height: 6.5, ahead: 2.5 },
  cinema: { distance: 7.5, height: 1.8 },
  top: 26,
  hasNight: true,
  sky: night => (night ? { background: '#0b1622', fogNear: 80, fogFar: 300 } : { background: '#d3e3ee', fogNear: 140, fogFar: 460 }),
  Map: FptCampusMap,
  Lights: FptCampusLights,
  sense: (pose: DriveState) => senseCrowd(campusCrowd, pose),
}
