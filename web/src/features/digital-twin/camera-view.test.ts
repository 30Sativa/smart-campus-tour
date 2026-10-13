import { describe, expect, it } from 'vitest'
import { fleetCameraView, pointCameraPerception } from './camera-view'
import { createPatrol, injectScenario, PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_POIS, PATROL_TRANSFORM } from './patrol-demo'
import { mapToScenePose } from './map-config'

describe('fixed cameras at POIs', () => {
  it('mounts all ten cameras at their POI and keeps the view fixed when robots move', () => {
    const state = createPatrol(), moved = structuredClone(state)
    moved.robots[0].pose.x += 5; moved.robots[0].pose.yaw += 1
    for (let point = 0; point < 10; point++) {
      const view = fleetCameraView(state, 1, 'point', point)
      const position = mapToScenePose({ ...PATROL_POIS[point], yaw: 0 }, PATROL_TRANSFORM).position
      expect(view.position).toEqual([position[0], PATROL_FLOOR_Y + 2.4 * PATROL_MODEL_SCALE, position[2]])
      expect(fleetCameraView(moved, 6, 'point', point)).toEqual(view)
    }
    expect(fleetCameraView(state, 1, 'robot', 0)).not.toEqual(fleetCameraView(moved, 1, 'robot', 0))
    expect(fleetCameraView(state, 1, 'point', 0)).not.toEqual(fleetCameraView(state, 1, 'point', 1))
  })
  it('reports nearby scene robots from the fixed camera and respects an outage', () => {
    const state = createPatrol()
    state.robots = state.robots.slice(0, 1)
    state.robots[0].pose = { ...PATROL_POIS[0], yaw: 0 }
    expect(pointCameraPerception(state, 0).obstacles.map(r => r.number)).toEqual([1])
    expect(pointCameraPerception(injectScenario(state, 'camera-outage'), 0)).toEqual({ status: 'OFFLINE', obstacles: [] })
  })
})
