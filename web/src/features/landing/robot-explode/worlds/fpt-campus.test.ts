import { describe, expect, it } from 'vitest'
import { CAMPUS_STOPS, POND, ROUTE_EDGES, ROUTE_NODES, STOP_NODES, STREET, TREES, WALK_PATHS, WING_PIECES, campusCanMove, campusFree, campusRoute } from './fpt-campus'
import { alongPath, nextTurn, pathLength } from './geometry'

describe('FPT campus demo map', () => {
  it('lets the robot stand on every stop and drive every route edge', () => {
    for (const stop of CAMPUS_STOPS) expect(campusFree(stop), stop.label).toBe(true)
    for (const [a, b] of ROUTE_EDGES) expect(campusCanMove(ROUTE_NODES[a], ROUTE_NODES[b]), `${a}-${b}`).toBe(true)
    expect(STOP_NODES.map(node => ROUTE_NODES[node])).toEqual(CAMPUS_STOPS.map(({ x, y }) => ({ x, y })))
  })

  it('keeps the robot out of the building, the fence, the pond and the trees', () => {
    expect(campusFree({ x: 30, y: -32 })).toBe(false)
    expect(campusFree({ x: 0, y: 30 })).toBe(false)
    expect(campusFree({ x: 30, y: STREET.fence })).toBe(false)
    expect(campusFree({ x: 0, y: STREET.fence })).toBe(true)
    expect(campusFree({ x: (POND.minX + POND.maxX) / 2, y: (POND.minY + POND.maxY) / 2 })).toBe(false)
    const tree = TREES[0]
    expect(campusFree(tree)).toBe(false)
    // The courtyard is closed by the back wing.
    expect(campusCanMove({ x: 0, y: -45 }, { x: 0, y: 45 })).toBe(false)
  })

  it('gives every wing piece 3 to 7 floors, higher at the corners than mid-side', () => {
    for (const piece of WING_PIECES) {
      expect(piece.floors).toBeGreaterThanOrEqual(3)
      expect(piece.floors).toBeLessThanOrEqual(7)
    }
    const corner = WING_PIECES.reduce((best, piece) => (Math.abs(piece.x) + Math.abs(piece.y) > Math.abs(best.x) + Math.abs(best.y) ? piece : best))
    const middle = WING_PIECES.find(piece => piece.along === 'x' && piece.out === 1 && Math.abs(piece.x) < 5)!
    expect(corner.floors).toBeGreaterThan(middle.floors)
  })

  it('finds a route from the gate to every stop along the paths', () => {
    for (let stop = 0; stop < CAMPUS_STOPS.length; stop += 1) {
      const route = campusRoute(CAMPUS_STOPS[0], stop)
      expect(route.at(-1)).toEqual({ x: CAMPUS_STOPS[stop].x, y: CAMPUS_STOPS[stop].y })
      for (let i = 1; i < route.length; i += 1) expect(campusCanMove(route[i - 1], route[i])).toBe(true)
    }
    // The courtyard is reached through the entrance, not through the building.
    expect(campusRoute(CAMPUS_STOPS[0], 2).map(p => p.y)).toEqual([-58, -58, -50, -32, -6])
  })

  it('announces the next turn and its side', () => {
    // Heading north to the ring road, then east along it: the heading goes down, which the driver sees as a left turn, after 7 m.
    expect(nextTurn({ x: 0, y: -51 }, [{ x: 0, y: -51 }, { x: 0, y: -44 }, { x: 44, y: -44 }])).toEqual({ side: 'left', distance: 7 })
    expect(nextTurn({ x: 0, y: -51 }, [{ x: 0, y: -51 }, { x: 0, y: -44 }, { x: -44, y: -44 }])).toEqual({ side: 'right', distance: 7 })
    expect(nextTurn({ x: 0, y: -51 }, [{ x: 0, y: -51 }, { x: 0, y: -44 }, { x: 0, y: -27 }])).toBeNull()
  })

  it('walks people along their paths, back and forth on open ones', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    expect(pathLength(line, false)).toBe(10)
    expect(alongPath(line, false, 4)).toMatchObject({ x: 4, y: 0, yaw: 0 })
    expect(alongPath(line, false, 14)).toMatchObject({ x: 6, y: 0 })
    expect(Math.abs(alongPath(line, false, 14).yaw)).toBeCloseTo(Math.PI)
    for (const path of WALK_PATHS) expect(pathLength(path.points, path.loop)).toBeGreaterThan(10)
  })
})
