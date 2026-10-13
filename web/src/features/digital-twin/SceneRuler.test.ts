import { expect, it } from 'vitest'
import { modelHorizontalDistance } from './scene-ruler'
import { PATROL_MODEL_SCALE } from './patrol-demo'

it('measures model metres on the floor plane without including ceiling or furniture height', () => {
  expect(modelHorizontalDistance([0, 0, 0], [3 * PATROL_MODEL_SCALE, 5, 4 * PATROL_MODEL_SCALE])).toBeCloseTo(5)
  expect(modelHorizontalDistance([1, 0, 2], [1, 4, 2])).toBe(0)
})
