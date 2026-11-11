import { HEAD_PAN_LIMIT_DEG, HEAD_TILT_LIMIT_DEG, type HeadCameraParts } from '../../technical/head-camera-preset'

/**
 * The motion the preview draws: the robot's button speed (30°/s) for a sweep and its angle speed (60°/s) for a
 * fixed angle, starting from the front. A drawing of the plan, not the robot's live state.
 */

const SWEEP_DPS = 30
const ANGLE_DPS = 60

export type Pose = { pan: number; tilt: number }
export type Leg = { to: Pose; seconds: number }

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
const finite = (text: string) => (Number.isFinite(Number(text)) && text.trim() !== '' ? Number(text) : 0)

/** Where the head ends up, and the legs that take it there from the front. */
export function headPlan(parts: HeadCameraParts): { target: Pose; legs: Leg[]; sweepDeg: number | null } {
  const to = (pan: number, tilt: number, dps: number, from: Pose): Leg =>
    ({ to: { pan, tilt }, seconds: Math.max(Math.abs(pan - from.pan), Math.abs(tilt - from.tilt)) / dps })
  const front: Pose = { pan: 0, tilt: 0 }
  switch (parts.mode) {
    case 'NONE': return { target: front, legs: [], sweepDeg: null }
    case 'SWEEP': {
      const amplitude = clamp(Math.abs(finite(parts.sweepDeg)), HEAD_PAN_LIMIT_DEG)
      const left = to(amplitude, 0, SWEEP_DPS, front)
      const right = to(-amplitude, 0, SWEEP_DPS, left.to)
      return { target: front, legs: [left, right, to(0, 0, SWEEP_DPS, right.to)], sweepDeg: amplitude }
    }
    default: {
      const pan = parts.mode === 'LEFT' ? 90 : parts.mode === 'RIGHT' ? -90 : parts.mode === 'ANGLE' ? clamp(finite(parts.panDeg), HEAD_PAN_LIMIT_DEG) : 0
      const tilt = parts.mode === 'ANGLE' ? clamp(finite(parts.tiltDeg), HEAD_TILT_LIMIT_DEG) : 0
      return { target: { pan, tilt }, legs: [to(pan, tilt, ANGLE_DPS, front)], sweepDeg: null }
    }
  }
}

export function poseAt(legs: Leg[], seconds: number): Pose | null {
  let from: Pose = { pan: 0, tilt: 0 }
  for (const leg of legs) {
    if (seconds <= leg.seconds) {
      const k = leg.seconds === 0 ? 1 : seconds / leg.seconds
      return { pan: from.pan + (leg.to.pan - from.pan) * k, tilt: from.tilt + (leg.to.tilt - from.tilt) * k }
    }
    seconds -= leg.seconds
    from = leg.to
  }
  return null
}
