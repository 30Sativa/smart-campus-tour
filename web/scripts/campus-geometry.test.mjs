import { describe, expect, it } from 'vitest'
import { subtractBoxes, glazingIntervals } from './campus-geometry.mjs'

describe('campus architecture clipping', () => {
  it('cuts a wall triangle even when every original vertex is outside the cutout', () => {
    const triangle = [[-3, 0, 0, -3], [3, 0, 0, 3], [0, 3, 0, 3]]
    const result = subtractBoxes(triangle, [{ centre: [0, 1.5, 0], axis: [1, 0], half: [1, 0.5, 0.2] }])
    const area = result.reduce((sum, [a, b, c]) => sum + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2, 0)
    expect(area).toBeCloseTo(7)
    for (const polygon of result) for (const p of polygon) expect(p[3]).toBeCloseTo(p[0] + p[1])
  })
  it('leaves unrelated geometry unchanged and reserves doors instead of glazing over them', () => {
    const triangle = [[10, 0, 0], [12, 0, 0], [11, 2, 0]]
    expect(subtractBoxes(triangle, [{ centre: [0, 1, 0], axis: [1, 0], half: [1, 1, 0.2] }])).toEqual([triangle])
    expect(glazingIntervals(12, [[4, 6], [5, 7], [-1, 1]])).toEqual([[1, 4], [7, 12]])
  })
})
