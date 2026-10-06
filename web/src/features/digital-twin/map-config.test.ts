import { describe, expect, it } from 'vitest'
import { IDENTITY, applyAffine, fitAffine, mapToScenePose, mapToStudentPose, type MapConfig } from './map-config'

const config = (student: MapConfig['student2d']): MapConfig => ({
  mapKey: 'test',
  scene: { transform: IDENTITY, calibrated: true },
  student2d: student,
})

describe('map-config', () => {
  it('keeps the old map-to-scene convention with the identity transform', () => {
    const scene = mapToScenePose({ x: 3, y: 4, yaw: 0.5 })
    expect(scene.position).toEqual([3, 0, -4])
    expect(scene.rotation).toBeCloseTo(0.5)
  })

  it('rotates position and heading together', () => {
    const quarter: typeof IDENTITY = { a: 0, b: -1, c: 1, d: 0, tx: 10, ty: 0 }
    const scene = mapToScenePose({ x: 1, y: 0, yaw: 0 }, quarter)
    expect(scene.position[0]).toBeCloseTo(10)
    expect(scene.position[2]).toBeCloseTo(-1)
    expect(scene.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('does not place a robot on an uncalibrated drawing', () => {
    expect(mapToStudentPose(config({ transform: IDENTITY, calibrated: false }), { x: 1, y: 1, yaw: 0 })).toBeNull()
    expect(mapToStudentPose(null, { x: 1, y: 1, yaw: 0 })).toBeNull()
  })

  it('gives the student map a clockwise heading with 0 pointing up', () => {
    // Metres -> percent with y flipped (north is up on the drawing).
    const cfg = config({ transform: { a: 1, b: 0, c: 0, d: -1, tx: 50, ty: 50 }, calibrated: true })
    const east = mapToStudentPose(cfg, { x: 0, y: 0, yaw: 0 }, 1)!
    expect(east).toMatchObject({ x: 50, y: 50 })
    expect(east.heading).toBeCloseTo(90)
    expect(mapToStudentPose(cfg, { x: 0, y: 0, yaw: Math.PI / 2 }, 1)!.heading).toBeCloseTo(0)
  })

  it('fits an affine transform from three landmarks and reproduces them', () => {
    const truth = { a: 0.8, b: -0.2, c: 0.3, d: -0.9, tx: 12, ty: 40 }
    const from = [{ x: 0, y: 0 }, { x: 30, y: 5 }, { x: 4, y: -25 }]
    const fitted = fitAffine(from.map((p) => ({ from: p, to: applyAffine(truth, p.x, p.y) })))
    for (const key of Object.keys(truth) as Array<keyof typeof truth>) expect(fitted[key]).toBeCloseTo(truth[key], 6)
    expect(() => fitAffine([{ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }, { from: { x: 1, y: 1 }, to: { x: 1, y: 1 } }, { from: { x: 2, y: 2 }, to: { x: 2, y: 2 } }])).toThrow(/collinear/)
  })
})
