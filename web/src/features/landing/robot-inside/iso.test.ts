import { describe, expect, it } from 'vitest'
import { COLUMN_FROM, COLUMN_SCALE, SCALE, boxFaces, drawnHeight, nearness, project, routeLength, wirePath } from './iso'

describe('robot drawing projection', () => {
  it('puts the floor under the robot at the origin, up as up, the front nearer the viewer', () => {
    const [x, y] = project([0, 0, 0])
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
    expect(project([0, 0.2, 0])[1]).toBeCloseTo(-0.2 * SCALE)
    expect(nearness([0, 0, 0.3])).toBeGreaterThan(nearness([0, 0, -0.3]))
  })

  it('draws the column shorter than it is, and the body at its true height', () => {
    expect(drawnHeight(0.4)).toBe(0.4)
    expect(drawnHeight(COLUMN_FROM + 0.2)).toBeCloseTo(COLUMN_FROM + 0.2 * COLUMN_SCALE)
  })

  it('gives each visible face of a box four corners', () => {
    const faces = boxFaces({ min: [0, 0, 0], max: [0.1, 0.1, 0.1] })
    for (const face of Object.values(faces)) expect(face.split(' ')).toHaveLength(4)
  })

  it('rounds a cable\'s corners and measures it on the drawing', () => {
    const route = [[0, 0, 0], [0.1, 0, 0], [0.1, 0.1, 0]] as const
    const d = wirePath(route)
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d).toContain('Q')
    expect(routeLength(route)).toBeCloseTo(0.1 * SCALE * (Math.hypot(Math.cos(0.74), Math.sin(0.74) * 0.46) + 1), 3)
  })
})
