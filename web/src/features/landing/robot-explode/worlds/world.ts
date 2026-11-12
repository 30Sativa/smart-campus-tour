import type { ComponentType, MutableRefObject } from 'react'
import type { CanMove, DrivePoint, DriveState } from '../drive'
import type { Tracked } from './fpt-crowd'

export type WorldId = 'fpt' | 'nvh' | 'studio'
export type MapProps = {
  night: boolean
  driveRef: MutableRefObject<DriveState>
  /** In the scroll story's close-ups, people within this many metres of the robot are left out of the picture (0: none). */
  clearRef?: MutableRefObject<number>
  /** The lighter look ("Mượt"): simple trees and people, no shadows, nothing extra to download. */
  lite?: boolean
}
export type Sensing = { tracked: Tracked[]; ahead: number | null }

/**
 * One map the robot can drive in section 04. Positions are the map's own
 * metres (x, y); `toScene` puts them in the 3D scene (x, z), `scale` turns
 * metres into scene units and the floor is at `floorY`. A heading `yaw` in
 * the map is a turn of -yaw about the scene's up axis, on every map.
 */
export type DriveWorld = {
  id: WorldId
  /** Name on the map switch. */
  label: string
  /** Line over the map, top left. */
  title: string
  scale: number
  floorY: number
  toScene: (point: DrivePoint) => [number, number]
  canMove: CanMove
  stops: readonly (DrivePoint & { label: string })[]
  start: { stop: number; yaw: number }
  /** Path the robot drives itself from `from` to stop `stop`, starting at `from`. */
  route: (from: DrivePoint, stop: number) => DrivePoint[]
  /** Free floor behind the robot for the following camera, m (up to `reach`). */
  cameraRoom: (at: DrivePoint, yaw: number, reach: number) => number
  /** Cameras, in metres: high behind ("Chase"), circling ("Điện ảnh"), straight down ("Trên cao"). */
  chase: { back: number; height: number; ahead: number }
  cinema: { distance: number; height: number }
  top: number
  /** Whether the map has a day and a night. */
  hasNight: boolean
  /** Background colour and the far haze (scene units) by day or night. */
  sky: (night: boolean) => { background: string; fogNear: number; fogFar: number }
  /** The map itself (hidden while the robot is inspected) and its lights (kept). */
  Map: ComponentType<MapProps>
  Lights: ComponentType<MapProps>
  /** People and cars the robot's sensors see, when the map has any. */
  sense?: (pose: DriveState) => Sensing
}
