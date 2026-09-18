import { Box3, Matrix4, Vector3 } from 'three'
import type { CampusModelConfig } from '../campus-model'

/** One transform for both the imported geometry and all surveyed anchors. */
export function campusModelMatrix(config: CampusModelConfig): Matrix4 {
  return new Matrix4().makeRotationY(config.rotationDegrees * Math.PI / 180)
    .multiply(new Matrix4().makeRotationX(config.upAxis === 'Z' ? -Math.PI / 2 : 0))
    .multiply(new Matrix4().makeScale(config.scale, config.scale, config.scale))
}

export function campusCameraFrame(bounds: Box3, aspect: number, fovDegrees: number, top: boolean) {
  const center = bounds.getCenter(new Vector3())
  const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.5)
  const verticalHalfFov = fovDegrees * Math.PI / 360
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(aspect, 0.1))
  const distance = radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * 1.15
  // A tiny Z offset avoids the singularity of looking exactly along camera.up.
  const direction = new Vector3(...(top ? [0, 1, 0.001] : [1, 0.9, 1]) as [number, number, number]).normalize()
  return { center, position: center.clone().addScaledVector(direction, distance), radius, distance }
}
