/**
 * The POI camera preset: what the robot's PAN/TILT head (the Quest 3 VR camera) does when a Tour arrives at the
 * POI (FR-49, ADR-0045 addendum 10/11/2026). One string per POI revision, checked and stored in canonical form by
 * the backend (`PoiCameraPresets`):
 *   FRONT | LEFT | RIGHT | NONE | SWEEP | SWEEP:<10..170> | ANGLE:<pan -170..170>,<tilt -18..18>
 * PAN is positive to the left, TILT positive up. This module only builds and reads the string for the form and
 * prints it in Vietnamese; the check here is for the form's message, the server decides.
 */

export type HeadCameraMode = 'FRONT' | 'LEFT' | 'RIGHT' | 'SWEEP' | 'ANGLE' | 'NONE'

export const HEAD_SWEEP_DEFAULT_DEG = 135
export const HEAD_SWEEP_LIMITS = { min: 10, max: 170 }
export const HEAD_PAN_LIMIT_DEG = 170
export const HEAD_TILT_LIMIT_DEG = 18

export const headCameraModeLabel: Record<HeadCameraMode, string> = {
  FRONT: 'Nhìn phía trước',
  LEFT: 'Nhìn bên trái (90°)',
  RIGHT: 'Nhìn bên phải (90°)',
  SWEEP: 'Quét trái rồi phải',
  ANGLE: 'Góc tùy chỉnh',
  NONE: 'Không tự xoay, chỉ điều khiển tay',
}

/** What the head does at arrival, for the hint under the choice. */
export const headCameraModeHint: Record<HeadCameraMode, string> = {
  FRONT: 'Khi robot tới điểm, đầu camera quay về phía trước (0°), không cúi không ngửa.',
  LEFT: 'Khi robot tới điểm, đầu camera quay sang trái 90° so với thân robot.',
  RIGHT: 'Khi robot tới điểm, đầu camera quay sang phải 90° so với thân robot.',
  SWEEP: 'Khi robot tới điểm, đầu camera quay chậm sang trái, rồi sang phải, rồi về chỗ cũ (30° mỗi giây).',
  ANGLE: 'Khi robot tới điểm, đầu camera quay tới đúng góc PAN và TILT bên dưới.',
  NONE: 'Khi robot tới điểm, đầu camera đứng yên; người vận hành tự xoay bằng nút.',
}

export type HeadCameraParts = { mode: HeadCameraMode; sweepDeg: string; panDeg: string; tiltDeg: string }

const MODES: readonly string[] = ['FRONT', 'LEFT', 'RIGHT', 'SWEEP', 'ANGLE', 'NONE']

/** Splits a stored or half-typed preset into the form's parts; null for an older value nobody can pick any more. */
export function splitHeadPreset(value: string): HeadCameraParts | null {
  const text = value.trim().toUpperCase()
  const [head, rest = ''] = text.split(':', 2)
  if (!MODES.includes(head)) return null
  const mode = head as HeadCameraMode
  if (mode === 'SWEEP') return { mode, sweepDeg: text.includes(':') ? rest : String(HEAD_SWEEP_DEFAULT_DEG), panDeg: '', tiltDeg: '' }
  if (mode === 'ANGLE') {
    const [panDeg = '', tiltDeg = ''] = rest.split(',', 2)
    return { mode, sweepDeg: '', panDeg, tiltDeg }
  }
  return text.includes(':') ? null : { mode, sweepDeg: '', panDeg: '', tiltDeg: '' }
}

/** The preset the form sends. A mode switch starts from neutral numbers. */
export function joinHeadPreset(parts: HeadCameraParts): string {
  if (parts.mode === 'SWEEP') return `SWEEP:${parts.sweepDeg.trim()}`
  if (parts.mode === 'ANGLE') return `ANGLE:${parts.panDeg.trim()},${parts.tiltDeg.trim()}`
  return parts.mode
}

export function presetForMode(mode: HeadCameraMode): string {
  if (mode === 'SWEEP') return `SWEEP:${HEAD_SWEEP_DEFAULT_DEG}`
  if (mode === 'ANGLE') return 'ANGLE:0,0'
  return mode
}

const DECIMAL = /^-?\d{1,3}(\.\d)?$/

/** Null when the preset is complete, otherwise what to fix (the same limits the server checks). */
export function headPresetProblem(value: string): string | null {
  const parts = splitHeadPreset(value)
  if (!parts) return 'Hãy chọn lại hoạt động đầu camera.'
  if (parts.mode === 'SWEEP') {
    const deg = Number(parts.sweepDeg)
    return /^\d{1,3}$/.test(parts.sweepDeg.trim()) && deg >= HEAD_SWEEP_LIMITS.min && deg <= HEAD_SWEEP_LIMITS.max
      ? null : `Biên độ quét phải là số nguyên từ ${HEAD_SWEEP_LIMITS.min} đến ${HEAD_SWEEP_LIMITS.max} độ.`
  }
  if (parts.mode === 'ANGLE') {
    const pan = parts.panDeg.trim(), tilt = parts.tiltDeg.trim()
    if (!DECIMAL.test(pan) || Math.abs(Number(pan)) > HEAD_PAN_LIMIT_DEG) return `Góc PAN phải từ -${HEAD_PAN_LIMIT_DEG} đến ${HEAD_PAN_LIMIT_DEG} độ, tối đa một chữ số thập phân.`
    if (!DECIMAL.test(tilt) || Math.abs(Number(tilt)) > HEAD_TILT_LIMIT_DEG) return `Góc TILT phải từ -${HEAD_TILT_LIMIT_DEG} đến ${HEAD_TILT_LIMIT_DEG} độ, tối đa một chữ số thập phân.`
  }
  return null
}

const side = (deg: number, positive: string, negative: string) => deg === 0 ? '0°' : `${Math.abs(deg)}° ${deg > 0 ? positive : negative}`

/** The preset in plain Vietnamese, for lists, checks and history. */
export function headPresetLabel(value: string): string {
  const parts = splitHeadPreset(value)
  if (!parts || headPresetProblem(value)) return `Hướng cũ ${value}`
  if (parts.mode === 'SWEEP') return `Quét trái rồi phải, ${Number(parts.sweepDeg)}° mỗi bên`
  if (parts.mode === 'ANGLE') return `Góc tùy chỉnh: PAN ${side(Number(parts.panDeg), 'trái', 'phải')}, TILT ${side(Number(parts.tiltDeg), 'ngửa', 'cúi')}`
  return headCameraModeLabel[parts.mode]
}
