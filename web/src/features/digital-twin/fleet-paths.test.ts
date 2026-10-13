import { describe, expect, it } from 'vitest'
import { FLEET_ROUTE_COLOR, mergeFleetRoutes, straightRuns, type FleetPath } from './fleet-paths'
const route = (id: string, points: FleetPath['points']): FleetPath => ({ id, points, active: true, color: '#ef4444' })
describe('fleet route lines', () => {
  it('removes collinear grid vertices while keeping genuine turns and reversals', () => {
    expect(straightRuns([{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1},{x:2,y:2}])).toEqual([{x:0,y:0},{x:2,y:0},{x:2,y:2}])
    expect(straightRuns([{x:0,y:0},{x:2,y:0},{x:1,y:0}])).toHaveLength(3)
  })
  it('draws a partial overlap once as solid, regardless of direction or grid vertex placement', () => {
    const lines = mergeFleetRoutes([route('R1',[{x:0,y:0},{x:1,y:0},{x:4,y:0}]), route('R2',[{x:6,y:0},{x:2,y:0}])])
    expect(lines.map(l => ({ points: l.points, dashed: l.dashed }))).toEqual([
      {points:[{x:0,y:0},{x:2,y:0}],dashed:true},
      {points:[{x:2,y:0},{x:4,y:0}],dashed:false},
      {points:[{x:6,y:0},{x:4,y:0}],dashed:true},
    ])
    expect(lines.every(l => l.color === FLEET_ROUTE_COLOR)).toBe(true)
  })
  it('keeps crossings and a single robot retracing its own path dashed', () => {
    const lines = mergeFleetRoutes([route('R1',[{x:0,y:0},{x:4,y:0},{x:0,y:0}]),route('R2',[{x:2,y:-2},{x:2,y:2}])])
    expect(lines).toHaveLength(2)
    expect(lines.every(l=>l.dashed)).toBe(true)
  })
  it('merges diagonal shared paths without shifting their map position', () => {
    const lines = mergeFleetRoutes([route('R1',[{x:1,y:2},{x:5,y:6}]),route('R2',[{x:4,y:5},{x:2,y:3}])])
    const solid = lines.find(l=>!l.dashed)!
    expect(solid.points[0].x).toBeCloseTo(2)
    expect(solid.points[0].y).toBeCloseTo(3)
    expect(solid.points[1].x).toBeCloseTo(4)
    expect(solid.points[1].y).toBeCloseTo(5)
  })
})
