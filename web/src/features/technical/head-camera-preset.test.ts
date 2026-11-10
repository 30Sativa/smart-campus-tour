import { describe, expect, it } from 'vitest'
import { headPresetLabel, headPresetProblem, joinHeadPreset, presetForMode, splitHeadPreset } from './head-camera-preset'

describe('POI camera preset of the VR head', () => {
  it('prints every behaviour in plain Vietnamese', () => {
    expect(headPresetLabel('FRONT')).toBe('Nhìn phía trước')
    expect(headPresetLabel('LEFT')).toBe('Nhìn bên trái (90°)')
    expect(headPresetLabel('NONE')).toBe('Không tự xoay, chỉ điều khiển tay')
    expect(headPresetLabel('SWEEP')).toBe('Quét trái rồi phải, 135° mỗi bên')
    expect(headPresetLabel('SWEEP:90')).toBe('Quét trái rồi phải, 90° mỗi bên')
    expect(headPresetLabel('ANGLE:45,-10')).toBe('Góc tùy chỉnh: PAN 45° trái, TILT 10° cúi')
    expect(headPresetLabel('ANGLE:-30.5,0')).toBe('Góc tùy chỉnh: PAN 30.5° phải, TILT 0°')
    expect(headPresetLabel('HEAD_LEFT')).toBe('Hướng cũ HEAD_LEFT')
  })

  it('keeps half-typed numbers and starts a new mode from neutral values', () => {
    expect(joinHeadPreset({ ...splitHeadPreset('ANGLE:0,0')!, panDeg: '12.' })).toBe('ANGLE:12.,0')
    expect(splitHeadPreset('ANGLE:12.,0')).toMatchObject({ mode: 'ANGLE', panDeg: '12.', tiltDeg: '0' })
    expect(presetForMode('SWEEP')).toBe('SWEEP:135')
    expect(presetForMode('ANGLE')).toBe('ANGLE:0,0')
    expect(splitHeadPreset('FRONT:1')).toBeNull()
  })

  it('refuses what the server refuses, within the firmware soft limits', () => {
    for (const ok of ['FRONT', 'NONE', 'SWEEP', 'SWEEP:10', 'SWEEP:170', 'ANGLE:170,18', 'ANGLE:-0.5,-18']) expect(headPresetProblem(ok), ok).toBeNull()
    for (const bad of ['SWEEP:9', 'SWEEP:171', 'SWEEP:', 'SWEEP:90.5', 'ANGLE:171,0', 'ANGLE:0,18.5', 'ANGLE:1.25,0', 'ANGLE:12.,0', 'ANGLE:,0', 'UP'])
      expect(headPresetProblem(bad), bad).not.toBeNull()
  })
})
