import type { DrivePoint } from '../drive'
import { StudioFloor, StudioLights } from './StudioStage'
import type { DriveWorld } from './world'

/** The one place on the stage: the robot stands there, nose along +x. */
export const STUDIO_STOPS = [{ x: 0, y: 0, label: 'Sân khấu' }] as const

/** The robot alone on a stage (the home page's section 04). */
export const studioWorld: DriveWorld = {
  id: 'studio',
  label: 'Sân khấu',
  title: 'CampusTour AMR · mô hình 3D',
  scale: 1,
  floorY: 0,
  toScene: point => [point.x, point.y],
  canMove: () => true,
  stops: STUDIO_STOPS,
  start: { stop: 0, yaw: 0 },
  route: (from: DrivePoint, stop: number) => [{ x: from.x, y: from.y }, STUDIO_STOPS[stop]],
  cameraRoom: (_at, _yaw, reach) => reach,
  chase: { back: 4, height: 2.6, ahead: 1.5 },
  cinema: { distance: 4, height: 1.4 },
  top: 10,
  hasNight: false,
  sky: () => ({ background: '#101b23', fogNear: 14, fogFar: 46 }),
  Map: StudioFloor,
  Lights: StudioLights,
}
