import { PATROL_MODEL_SCALE } from './patrol-demo'

export type ScenePosition = [number, number, number]
export const modelHorizontalDistance = (a: ScenePosition, b: ScenePosition) => Math.hypot(b[0] - a[0], b[2] - a[2]) / PATROL_MODEL_SCALE
