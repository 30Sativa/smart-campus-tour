import { describe, expect, it } from 'vitest'
import { buildLampLayout as createLampLayout } from './campus-lights.mjs'

function buildLampLayout(options) {
  const fixtures = createLampLayout(options)
  const roomZones = new Set(fixtures.filter(fixture => fixture.zone.startsWith('room:')).map(fixture => fixture.zone))
  for (const zone of roomZones) {
    const lamps = fixtures.filter(fixture => fixture.zone === zone), first = lamps[0]
    const transverse = point => point[0] * Math.sin(first.angle) + point[1] * Math.cos(first.angle)
    for (const lamp of lamps.slice(1)) expect(transverse(lamp.point), `${zone} lamps must share one straight row`).toBeCloseTo(transverse(first.point), 5)
  }
  return fixtures
}

const rectangle = (left, bottom, right, top) => [[[left, bottom], [right, bottom], [right, top]], [[left, bottom], [right, top], [left, top]]]
const rotate = (point, angle) => [point[0] * Math.cos(angle) - point[1] * Math.sin(angle), point[0] * Math.sin(angle) + point[1] * Math.cos(angle)]
const footprint = fixture => [[-0.9, -0.14], [-0.9, 0.14], [0.9, -0.14], [0.9, 0.14]].map(p => {
  const offset = rotate(p, -fixture.angle)
  return offset.map((v, i) => v + fixture.point[i])
})

describe('ceiling lamp distribution', () => {
  it('fits exactly two balanced lamps along the long axis of a furnished rotated classroom', () => {
    const angle = Math.PI / 6
    const triangles = rectangle(-7, -5, 7, 5).map(triangle => triangle.map(p => rotate(p, angle)))
    const fixtures = buildLampLayout({ rooms: [{ name: '601', triangles, furnished: true }] })
    expect(fixtures).toHaveLength(2)
    const local = fixtures.map(fixture => rotate(fixture.point, -angle))
    expect(new Set(local.map(p => Math.round(p[0] * 1000))).size).toBe(2)
    expect(new Set(local.map(p => Math.round(p[1] * 1000))).size).toBe(1)
    expect(local.reduce((sum, p) => sum + p[0], 0)).toBeCloseTo(0, 8)
    expect(local.reduce((sum, p) => sum + p[1], 0)).toBeCloseTo(0, 8)
    for (const fixture of fixtures) {
      expect(fixture.zone).toBe('room:601')
      expect(Math.abs(Math.cos(fixture.angle + angle))).toBeCloseTo(1, 8)
      for (const corner of footprint(fixture).map(p => rotate(p, -angle))) {
        expect(Math.abs(corner[0])).toBeLessThan(6.8)
        expect(Math.abs(corner[1])).toBeLessThan(4.8)
      }
    }
  })

  it('keeps corridor fixtures out of rooms, the atrium and prepared wall clearances', () => {
    const atrium = [[9, 8], [17, 8], [17, 18], [9, 18]]
    const fixtures = buildLampLayout({ rooms: [{ name: '602', triangles: rectangle(0, 0, 8, 8) }], corridorFloors: rectangle(0, 0, 26, 26),
      walls: [{ a: [21, 0], b: [21, 26] }], atrium })
    const corridors = fixtures.filter(fixture => fixture.zone === 'corridor')
    expect(corridors.length).toBeGreaterThan(4)
    expect(corridors.length).toBeLessThan(13)
    expect(fixtures.filter(fixture => fixture.zone === 'room:602')).toHaveLength(2)
    for (const fixture of corridors) {
      const [x, z] = fixture.point
      expect(x > 8 || z > 8).toBe(true)
      expect(x < 9 || x > 17 || z < 8 || z > 18).toBe(true)
      expect(Math.abs(x - 21)).toBeGreaterThanOrEqual(1.1)
      for (const [cx, cz] of footprint(fixture)) {
        expect(cx).toBeGreaterThanOrEqual(0.2)
        expect(cx).toBeLessThanOrEqual(25.8)
        expect(cz).toBeGreaterThanOrEqual(0.2)
        expect(cz).toBeLessThanOrEqual(25.8)
        expect(Math.abs(cx - 21)).toBeGreaterThanOrEqual(0.2)
        expect(cx < 9 || cx > 17 || cz < 8 || cz > 18).toBe(true)
      }
    }
    for (let i = 0; i < corridors.length; i++) for (const other of corridors.slice(i + 1)) {
      expect(Math.hypot(...corridors[i].point.map((value, k) => value - other.point[k]))).toBeGreaterThanOrEqual(7)
    }
  })

  it('respects a concave room footprint and does not treat floor diagonals as walls', () => {
    const triangles = [...rectangle(0, 0, 12, 5), ...rectangle(0, 5, 5, 12)]
    const fixtures = buildLampLayout({ rooms: [{ name: '603', triangles }] })
    expect(fixtures).toHaveLength(2)
    for (const fixture of fixtures) for (const [x, z] of footprint(fixture)) {
      expect(x < 5 || z < 5).toBe(true)
      expect(x).toBeGreaterThan(0)
      expect(z).toBeGreaterThan(0)
      expect(x).toBeLessThan(12)
      expect(z).toBeLessThan(12)
    }
    expect(buildLampLayout({ rooms: [{ name: '604', triangles: rectangle(0, 0, 14, 10) }] })).toHaveLength(2)
  })

  it('fits both lamps safely into a wedge-shaped room instead of retaining one centred lamp', () => {
    // The floor shape reproduces the angled 613 footprint, translated to zero.
    const polygon = [[4.48, -4.293], [9.613, 1.867], [0.373, 7.84], [0, 0]]
    const triangles = [[polygon[0], polygon[1], polygon[2]], [polygon[0], polygon[2], polygon[3]]]
    const fixtures = buildLampLayout({ rooms: [{ name: '613', triangles }] })
    expect(fixtures).toHaveLength(2)
    const edgeDistance = (p, a, b) => {
      const delta = b.map((v, i) => v - a[i]), lengthSquared = delta[0] ** 2 + delta[1] ** 2
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * delta[0] + (p[1] - a[1]) * delta[1]) / lengthSquared))
      return Math.hypot(...p.map((v, i) => v - a[i] - t * delta[i]))
    }
    for (const fixture of fixtures) for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length]
      expect(edgeDistance(fixture.point, a, b)).toBeGreaterThanOrEqual(1.1)
      for (const corner of footprint(fixture)) {
        expect(edgeDistance(corner, a, b)).toBeGreaterThanOrEqual(0.2)
        expect((b[0] - a[0]) * (corner[1] - a[1]) - (b[1] - a[1]) * (corner[0] - a[0])).toBeGreaterThan(0)
      }
    }
    for (const fixture of fixtures) for (const other of fixtures) if (fixture !== other) {
      expect(Math.hypot(...fixture.point.map((v, i) => v - other.point[i]))).toBeGreaterThanOrEqual(2.2 - 1e-6)
    }
  })

  it('keeps the two lamps in the concave 609 footprint on one safe straight row', () => {
    const polygon = [[62.53333282470703, -38.106666564941406], [72.98666381835938, -39.22666549682617],
      [74.19999694824219, -25.786666870117188], [69.53333282470703, -31.386667251586914],
      [67.01333618164062, -35.400001525878906], [63.6533317565918, -34.84000015258789]]
    const triangles = [[5, 0, 1], [1, 2, 3], [4, 5, 1], [1, 3, 4]].map(indices => indices.map(index => polygon[index]))
    const fixtures = buildLampLayout({ rooms: [{ name: '609', triangles, furnished: true }] })
    expect(fixtures).toHaveLength(2)
    const edgeDistance = (p, a, b) => {
      const delta = b.map((v, i) => v - a[i]), lengthSquared = delta[0] ** 2 + delta[1] ** 2
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * delta[0] + (p[1] - a[1]) * delta[1]) / lengthSquared))
      return Math.hypot(...p.map((v, i) => v - a[i] - t * delta[i]))
    }
    const insideTriangle = (point, triangle) => {
      const sides = triangle.map((a, i) => {
        const b = triangle[(i + 1) % 3]
        return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])
      })
      return sides.every(value => value >= 0) || sides.every(value => value <= 0)
    }
    for (const fixture of fixtures) for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length]
      expect(edgeDistance(fixture.point, a, b)).toBeGreaterThanOrEqual(1.1)
      for (const corner of footprint(fixture)) {
        expect(edgeDistance(corner, a, b)).toBeGreaterThanOrEqual(0.2)
        expect(triangles.some(triangle => insideTriangle(corner, triangle))).toBe(true)
      }
    }
  })

  it('never invents fixtures for empty geometry or a room narrower than the fixture', () => {
    expect(buildLampLayout({})).toEqual([])
    expect(buildLampLayout({ rooms: [{ name: 'service', triangles: rectangle(0, 0, 1, 6) }] })).toEqual([])
  })

  it('leaves empty rooms unlit and excludes their floors from corridor lighting', () => {
    const rooms = [{ name: 'empty', furnished: false, triangles: rectangle(0, 0, 10, 10) },
      { name: 'storage', lightCount: 0, triangles: rectangle(10, 0, 20, 10) },
      { name: 'classroom', furnished: true, triangles: rectangle(0, 10, 10, 20) }]
    const fixtures = buildLampLayout({ rooms, corridorFloors: rectangle(0, 0, 30, 30) })
    expect(fixtures.filter(fixture => fixture.zone.startsWith('room:')).map(fixture => fixture.zone)).toEqual(['room:classroom', 'room:classroom'])
    for (const fixture of fixtures.filter(fixture => fixture.zone === 'corridor')) for (const [x, z] of footprint(fixture)) {
      expect(x > 20 || z > 10).toBe(true)
      expect(x > 10 || z < 10 || z > 20).toBe(true)
    }
  })

  it('preserves exposed boundaries when the imported floor repeats faces', () => {
    const triangles = rectangle(0, 0, 20, 5)
    const once = buildLampLayout({ corridorFloors: triangles })
    const repeated = buildLampLayout({ corridorFloors: [...triangles, ...triangles] })
    expect(repeated).toEqual(once)
    expect(once.length).toBeGreaterThanOrEqual(2)
    expect(once.length).toBeLessThanOrEqual(3)
    for (const fixture of repeated) expect(fixture.point[1]).toBeGreaterThanOrEqual(1.1)
  })

  it('illuminates a narrow diagonal corridor while keeping the housing aligned along it', () => {
    const angle = Math.PI / 5
    const corridorFloors = rectangle(-18, -1.8, 18, 1.8).map(triangle => triangle.map(point => rotate(point, angle)))
    const walls = [-1.8, 1.8].map(z => ({ a: rotate([-18, z], angle), b: rotate([18, z], angle) }))
    const fixtures = buildLampLayout({ corridorFloors, walls })
    expect(fixtures.length).toBeGreaterThanOrEqual(4)
    expect(fixtures.length).toBeLessThanOrEqual(5)
    const local = fixtures.map(fixture => rotate(fixture.point, -angle))
    expect(Math.min(...local.map(p => p[0]))).toBeLessThan(-13)
    expect(Math.max(...local.map(p => p[0]))).toBeGreaterThan(13)
    for (const fixture of fixtures) {
      expect(Math.abs(Math.cos(fixture.angle + angle))).toBeCloseTo(1, 8)
      for (const corner of footprint(fixture).map(p => rotate(p, -angle))) expect(Math.abs(corner[1])).toBeLessThanOrEqual(1.6)
      for (const other of fixtures) if (other !== fixture) expect(Math.hypot(...fixture.point.map((v, i) => v - other.point[i]))).toBeGreaterThanOrEqual(7)
    }
  })

  it('places a rotated corridor run on one centred straight row with a 7 m rhythm', () => {
    const angle = Math.PI / 5
    const corridorFloors = rectangle(-18, -2.2, 18, 2.2).map(triangle => triangle.map(point => rotate(point, angle)))
    const fixtures = buildLampLayout({ corridorFloors,
      corridorRuns: [{ id: 'diagonal', a: rotate([-18, 0], angle), b: rotate([18, 0], angle) }] })
    expect(fixtures).toHaveLength(5)
    const local = fixtures.map(fixture => rotate(fixture.point, -angle)).sort((a, b) => a[0] - b[0])
    expect(local.reduce((sum, point) => sum + point[0], 0)).toBeCloseTo(0, 5)
    for (const [index, point] of local.entries()) {
      expect(point[1]).toBeCloseTo(0, 5)
      if (index) expect(point[0] - local[index - 1][0]).toBeCloseTo(7, 5)
    }
    for (const fixture of fixtures) {
      expect(fixture.row).toBe('diagonal')
      expect(fixture.zone).toBe('corridor')
      expect(Math.abs(Math.cos(fixture.angle + angle))).toBeCloseTo(1, 5)
      for (const [x, z] of footprint(fixture).map(point => rotate(point, -angle))) {
        expect(Math.abs(x)).toBeLessThan(17.8)
        expect(Math.abs(z)).toBeLessThan(2)
      }
    }
  })

  it('shifts the whole corridor row past a central column while preserving its straight 7 m rhythm', () => {
    const angle = Math.PI / 8
    const corridorFloors = rectangle(-18, -2.2, 18, 2.2).map(triangle => triangle.map(point => rotate(point, angle)))
    const corridorRuns = [{ id: 'column-row', a: rotate([-18, 0], angle), b: rotate([18, 0], angle) }]
    const column = [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]]
    const walls = column.map((point, index) => ({ a: rotate(point, angle), b: rotate(column[(index + 1) % column.length], angle) }))
    const baseline = buildLampLayout({ corridorFloors, corridorRuns }).map(fixture => rotate(fixture.point, -angle)).sort((a, b) => a[0] - b[0])
    const fixtures = buildLampLayout({ corridorFloors, corridorRuns, walls })
    expect(fixtures).toHaveLength(baseline.length)
    const local = fixtures.map(fixture => rotate(fixture.point, -angle)).sort((a, b) => a[0] - b[0])
    const rowShift = local[0][0] - baseline[0][0]
    expect(Math.abs(rowShift)).toBeGreaterThan(1)
    for (const [index, point] of local.entries()) {
      expect(point[1]).toBeCloseTo(0, 5)
      expect(point[0] - baseline[index][0]).toBeCloseTo(rowShift, 5)
      expect(Math.abs(point[0])).toBeGreaterThanOrEqual(1.45 - 1e-6)
      if (index) expect(point[0] - local[index - 1][0]).toBeCloseTo(7, 5)
    }
    for (const fixture of fixtures) for (const [x, z] of footprint(fixture).map(point => rotate(point, -angle))) {
      expect(Math.hypot(Math.max(0, Math.abs(x) - 0.35), Math.max(0, Math.abs(z) - 0.35))).toBeGreaterThanOrEqual(0.2)
      expect(Math.abs(x)).toBeLessThan(17.8)
      expect(Math.abs(z)).toBeLessThan(2)
    }
  })

  it('keeps the 7 m spacing between adjacent rows at a corridor corner', () => {
    const corridorFloors = [...rectangle(-2.2, -2.2, 30.2, 2.2), ...rectangle(25.8, -2.2, 30.2, 30.2)]
    const fixtures = buildLampLayout({ corridorFloors,
      corridorRuns: [{ id: 'horizontal', a: [0, 0], b: [28, 0] }, { id: 'vertical', a: [28, 0], b: [28, 28] }] })
    const horizontal = fixtures.filter(fixture => fixture.row === 'horizontal').sort((a, b) => a.point[0] - b.point[0])
    const vertical = fixtures.filter(fixture => fixture.row === 'vertical').sort((a, b) => a.point[1] - b.point[1])
    expect(horizontal.length).toBeGreaterThanOrEqual(3)
    expect(vertical.length).toBeGreaterThanOrEqual(3)
    for (const [index, fixture] of horizontal.entries()) {
      expect(fixture.point[1]).toBeCloseTo(0, 5)
      if (index) expect(fixture.point[0] - horizontal[index - 1].point[0]).toBeCloseTo(7, 5)
    }
    for (const [index, fixture] of vertical.entries()) {
      expect(fixture.point[0]).toBeCloseTo(28, 5)
      if (index) expect(fixture.point[1] - vertical[index - 1].point[1]).toBeCloseTo(7, 5)
    }
    for (const [index, fixture] of fixtures.entries()) for (const other of fixtures.slice(index + 1)) {
      expect(Math.hypot(...fixture.point.map((value, k) => value - other.point[k]))).toBeGreaterThanOrEqual(7 - 1e-6)
    }
  })
})
