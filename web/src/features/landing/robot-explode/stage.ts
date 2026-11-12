import { Fog, PerspectiveCamera, Vector3, type Camera, type Color, type Scene } from 'three'
import { startDrive, type DrivePoint, type DriveState } from './drive'
import type { RobotParts } from './robot-rig'
import type { DriveWorld } from './worlds/world'

/* What the two robot stages share: the test drive (RobotDriveViewer) and the
   parts on the home page (RobotPartsViewer). */

export const ACCENT = '#8fcf4a'
/** Below this stage width the panel becomes a sheet along the bottom. */
export const WIDE = 900

/** Where the robot sits in the frame: shift of the picture as a share of the stage's width and height. */
export type Framing = { x: number; y: number }

/** How the robot stands this frame, shared by the robot, the camera and the callouts. */
export type RigState = { model: RobotParts; apart: number; open: number }

/** Scene position of a map point on `world`'s floor, `lift` metres up. */
export function onFloor(world: DriveWorld, point: DrivePoint, lift = 0) {
  const [x, z] = world.toScene(point)
  return new Vector3(x, world.floorY + lift * world.scale, z)
}

/** The robot on `world`'s first stop, facing its start heading, still. */
export function freshDrive(world: DriveWorld): DriveState {
  return startDrive(world.stops[world.start.stop], world.start.yaw)
}

/**
 * Slides the picture towards `goal` (so the robot sits beside the text and
 * panel, not under them); `shift` keeps where it is now.
 */
export function slideFraming(camera: Camera, width: number, height: number, shift: Framing, goal: Framing, delta: number) {
  const glide = Math.min(1, delta * 4)
  shift.x += (goal.x - shift.x) * glide
  shift.y += (goal.y - shift.y) * glide
  if (camera instanceof PerspectiveCamera && width > 0) camera.setViewOffset(width, height, shift.x * width, shift.y * height, width, height)
}

/** Puts `fog` on the scene; the returned function takes it off again. */
export function attachFog(scene: Scene, fog: Fog) {
  scene.fog = fog
  return () => { scene.fog = null }
}

export function setFog(fog: Fog, color: Color | string, near: number, far: number) {
  fog.color.set(color)
  fog.near = near
  fog.far = far
}

/** Whether a key went to a text field (keys there are typing, not driving). */
export const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
