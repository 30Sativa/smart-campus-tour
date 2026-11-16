import { describe, expect, it } from 'vitest'
import { roundedDurationSeconds } from '../../../components/ui/date-time'
import { estimatedRouteSeconds } from './route-estimate'
import { shortestShiftTooShort } from './shift-length'

// The same fixture as backend/tests/SmartCampus.UnitTests/TourScheduleTests.cs (Estimate_MatchesTheWebDraftEstimateFixture):
// start (0,0) -> stop 1 (3,4) -> stop 2 (3,10), dwell 30 + 45 s. Change one, change both.
const start = { x: 0, y: 0 }
const twoStops = [{ x: 3, y: 4, dwellSeconds: 30 }, { x: 3, y: 10, dwellSeconds: 45 }]

describe('estimatedRouteSeconds', () => {
  it.each([
    ['ending at the last stop', null, 0.25, 119],
    ['returning to the start', { x: 0, y: 0 }, 0.25, 161],
    ['ending at a pose', { x: 3, y: 14 }, 0.25, 135],
    ['at the configured speed', null, 1, 86],
  ] as const)('matches the backend estimate %s', (_, end, speed, expected) => {
    expect(estimatedRouteSeconds(start, twoStops, end, speed)).toBe(expected)
  })

  it('makes 29 minutes of dwell and 145 m of travel 39 minutes, too long for a one-hour shift', () => {
    // Backend: Estimate_Of29MinutesDwellAnd145MetresOfTravel_Is39MinutesAndTooLongForALunchShift.
    const stops = Array.from({ length: 29 }, (_, index) => ({ x: 5 * (index + 1), y: 0, dwellSeconds: 60 }))
    const estimate = estimatedRouteSeconds(start, stops, null, 0.25)!
    expect(estimate).toBe(2320)
    expect(roundedDurationSeconds(estimate) / 60).toBe(39)
    expect(shortestShiftTooShort([{ name: 'Ca trưa', maxDurationSeconds: 1800 }], estimate)?.name).toBe('Ca trưa')
  })

  it('is unknown without a start, a stop or the server speed', () => {
    expect(estimatedRouteSeconds(null, twoStops, null, 0.25)).toBeNull()
    expect(estimatedRouteSeconds(start, [], null, 0.25)).toBeNull()
    expect(estimatedRouteSeconds(start, twoStops, null, undefined)).toBeNull()
  })
})
