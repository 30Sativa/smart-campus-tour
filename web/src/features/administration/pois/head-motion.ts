import { HEAD_PAN_LIMIT_DEG, HEAD_TILT_LIMIT_DEG, type HeadCameraParts } from '../../technical/head-camera-preset'

/**
 * The motion the preview plays, as the head firmware moves (`robot/firmware/stm32/motor_controller/Core/Inc/head/
 * head_core.h`): each axis on its own speed ramp, 120°/s² up to 60°/s for an angle and 30°/s for a sweep (the button
 * speed), starting from the front where the robot leaves the head between POIs. A drawing of the plan, not the
 * robot's live state.
 */

const SWEEP_DPS = 30
const ANGLE_DPS = 60
const ACCEL_DPS2 = 120

export type Pose = { pan: number; tilt: number }
export type Leg = { from: Pose; to: Pose; dps: number; seconds: number }
export type HeadPlan = {
  target: Pose
  legs: Leg[]
  sweepDeg: number | null
  /** Played this many times faster than the robot: a sweep takes 12 to 23 s on the robot, an angle 1 to 3 s. */
  speedUp: number
}

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
const finite = (text: string) => (Number.isFinite(Number(text)) && text.trim() !== '' ? Number(text) : 0)

/** Seconds a ramp-up, cruise, ramp-down move of `distance` degrees takes. */
function rampSeconds(distance: number, dps: number) {
  const d = Math.abs(distance)
  return d >= dps * dps / ACCEL_DPS2 ? d / dps + dps / ACCEL_DPS2 : 2 * Math.sqrt(d / ACCEL_DPS2)
}

/** Degrees covered `t` seconds into that move. */
function rampDistance(distance: number, dps: number, t: number) {
  const d = Math.abs(distance)
  const total = rampSeconds(d, dps)
  if (t >= total) return distance
  const peak = Math.min(dps, Math.sqrt(d * ACCEL_DPS2))
  const rise = peak / ACCEL_DPS2
  let covered: number
  if (t <= rise) covered = ACCEL_DPS2 * t * t / 2
  else if (t <= total - rise) covered = peak * rise / 2 + peak * (t - rise)
  else covered = d - ACCEL_DPS2 * (total - t) * (total - t) / 2
  return Math.sign(distance) * covered
}

function leg(from: Pose, to: Pose, dps: number): Leg {
  return { from, to, dps, seconds: Math.max(rampSeconds(to.pan - from.pan, dps), rampSeconds(to.tilt - from.tilt, dps)) }
}

/** Where the head ends up, and the legs that take it there from the front (none when it stays at the front). */
export function headPlan(parts: HeadCameraParts): HeadPlan {
  const front: Pose = { pan: 0, tilt: 0 }
  switch (parts.mode) {
    case 'NONE': return { target: front, legs: [], sweepDeg: null, speedUp: 1 }
    case 'SWEEP': {
      const amplitude = clamp(Math.abs(finite(parts.sweepDeg)), HEAD_PAN_LIMIT_DEG)
      const left = leg(front, { pan: amplitude, tilt: 0 }, SWEEP_DPS)
      const right = leg(left.to, { pan: -amplitude, tilt: 0 }, SWEEP_DPS)
      const back = leg(right.to, front, SWEEP_DPS)
      return { target: front, legs: amplitude > 0 ? [left, right, back] : [], sweepDeg: amplitude, speedUp: 3 }
    }
    default: {
      const pan = parts.mode === 'LEFT' ? 90 : parts.mode === 'RIGHT' ? -90 : parts.mode === 'ANGLE' ? clamp(finite(parts.panDeg), HEAD_PAN_LIMIT_DEG) : 0
      const tilt = parts.mode === 'ANGLE' ? clamp(finite(parts.tiltDeg), HEAD_TILT_LIMIT_DEG) : 0
      const move = leg(front, { pan, tilt }, ANGLE_DPS)
      return { target: { pan, tilt }, legs: move.seconds > 0 ? [move] : [], sweepDeg: null, speedUp: 1 }
    }
  }
}

/** The pose `seconds` into the plan, each axis on its own ramp; null once the last leg has ended. */
export function poseAt(legs: Leg[], seconds: number): Pose | null {
  for (const { from, to, dps, seconds: length } of legs) {
    if (seconds <= length) {
      return {
        pan: from.pan + rampDistance(to.pan - from.pan, dps, seconds),
        tilt: from.tilt + rampDistance(to.tilt - from.tilt, dps, seconds),
      }
    }
    seconds -= length
  }
  return null
}
