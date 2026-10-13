import { describe, expect, it } from 'vitest'
import { buildCorridorMask } from './campus-corridor.mjs'

const rectangle = (left, bottom, right, top) => [[[left, bottom], [right, bottom], [right, top]], [[left, bottom], [right, top], [left, top]]]
const edge = (a, b) => ({ a, b })

describe('connected corridor lighting mask', () => {
  it('excludes an empty room behind a prepared closed door even when it shares the corridor floor mesh', () => {
    const triangles = rectangle(0, 0, 24, 16)
    const walls = [edge([14, 4], [22, 4]), edge([22, 4], [22, 12]), edge([22, 12], [14, 12]),
      edge([14, 4], [14, 7]), edge([14, 9], [14, 12])]
    const contains = buildCorridorMask({ triangles, walls, closedDoorEdges: [edge([14, 6.9], [14, 9.1])], seed: [4, 8] })
    expect(contains([4, 8])).toBe(true)
    expect(contains([12, 8])).toBe(true)
    expect(contains([23, 8])).toBe(true)
    expect(contains([18, 8])).toBe(false)
    expect(contains([14, 8])).toBe(false)
    const open = buildCorridorMask({ triangles, walls, seed: [4, 8] })
    expect(open([18, 8])).toBe(true)
  })

  it('excludes the atrium and disconnected floor while retaining the surrounding circulation', () => {
    const contains = buildCorridorMask({ triangles: [...rectangle(0, 0, 16, 16), ...rectangle(20, 0, 24, 4)],
      atrium: [[5, 5], [11, 5], [11, 11], [5, 11]], seed: [2, 8] })
    expect(contains([8, 8])).toBe(false)
    expect(contains([14, 8])).toBe(true)
    expect(contains([22, 2])).toBe(false)
    expect(contains([-0.1, 8])).toBe(false)
  })

  it('keeps a diagonal corridor connected and cannot jump a thin partition', () => {
    const angle = Math.PI / 5
    const rotate = point => [point[0] * Math.cos(angle) - point[1] * Math.sin(angle), point[0] * Math.sin(angle) + point[1] * Math.cos(angle)]
    const triangles = rectangle(-12, -2, 12, 2).map(triangle => triangle.map(rotate))
    const walls = [edge(rotate([0, -2]), rotate([0, 2]))]
    const contains = buildCorridorMask({ triangles, walls, seed: rotate([-8, 0]) })
    for (const distance of [-10, -8, -4, -1]) expect(contains(rotate([distance, 0]))).toBe(true)
    for (const distance of [1, 4, 8, 10]) expect(contains(rotate([distance, 0]))).toBe(false)
  })

  it('fails visibly for an invalid seed or a clearance that could cross a wall', () => {
    const triangles = rectangle(0, 0, 8, 8)
    expect(() => buildCorridorMask({ triangles, seed: [20, 20] })).toThrow(/seed/)
    expect(() => buildCorridorMask({ triangles, seed: [2, 2], clearance: 0.2 })).toThrow(/clearance/)
    expect(buildCorridorMask({ triangles: [] })([0, 0])).toBe(false)
  })
})
