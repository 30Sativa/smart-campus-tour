import { describe, expect, it } from 'vitest'
import type { TourDetails } from '../../administration/tours/types'
import { tourTwinRoute } from './fleet-twin'

const stop = (id: string, stopOrder: number, x: number) => ({ id, stopOrder, name: id, x, y: 0, yaw: 0, dwellSeconds: 40, poiRevisionId: `poi-${id}` })
const detail = (patch: Partial<TourDetails>, step: string, current: string | null, voting = true): TourDetails => ({
  routeRevision: { revisionId: 'rev', mapKey: 'map2-v2', viewerChoosesNextStop: voting, endMode: 'POSE', endX: 0, endY: 0, startX: 0, startY: 0,
    stops: [stop('a', 1, 1), stop('b', 2, 2), stop('c', 3, 3)] },
  execution: { currentStep: step, currentRevisionStopId: current },
  ...patch,
} as unknown as TourDetails)

describe('tourTwinRoute on a voting Tour (ADR-0065)', () => {
  it('marks the stops and draws the legs driven and the next leg from the server, not the StopOrder', () => {
    const route = tourTwinRoute(detail({
      stopProgress: [{ stopId: 'a', progress: 'VISITED', order: 1 }, { stopId: 'c', progress: 'CURRENT' }, { stopId: 'b', progress: 'REMAINING' }],
      nextTarget: { kind: 'POI', stopId: 'b', name: 'b' },
    }, 'OBSERVING', 'c'))!
    expect(route.stops.map(item => `${item.id}:${item.status}`)).toEqual(['a:Completed', 'b:Upcoming', 'c:Current'])
    // start -> a -> c driven, then c -> b next: never a -> b -> c.
    expect(route.legs!.map(leg => `${leg.kind}:${leg.from.x}->${leg.to.x}`)).toEqual(['visited:0->1', 'visited:1->3', 'next:3->2'])
  })

  it('draws the return to the start once the server says the end is next', () => {
    const route = tourTwinRoute(detail({
      stopProgress: [{ stopId: 'a', progress: 'VISITED', order: 1 }, { stopId: 'c', progress: 'VISITED', order: 2 }, { stopId: 'b', progress: 'VISITED', order: 3 }],
    }, 'RETURNING_TO_END', null))!
    expect(route.legs!.at(-1)).toMatchObject({ kind: 'next', from: { x: 2 }, to: { x: 0, y: 0 } })
    expect(route.heading).toBe('end')
  })

  it('draws nothing it cannot know: without a visit order, only the next leg from the POI the robot stands at', () => {
    const route = tourTwinRoute(detail({
      stopProgress: [{ stopId: 'a', progress: 'VISITED' }, { stopId: 'c', progress: 'CURRENT' }, { stopId: 'b', progress: 'REMAINING' }],
      nextTarget: { kind: 'POI', stopId: 'b', name: 'b' },
    }, 'OBSERVING', 'c'))!
    expect(route.legs!.map(leg => `${leg.kind}:${leg.from.x}->${leg.to.x}`)).toEqual(['next:3->2'])
    expect(tourTwinRoute(detail({ stopProgress: [{ stopId: 'a', progress: 'VISITED' }] }, 'NAVIGATING', 'c'))!.legs).toEqual([])
  })

  it('draws no leg on a fixed-order Tour', () => {
    expect(tourTwinRoute(detail({}, 'OBSERVING', 'b', false))!.legs).toBeUndefined()
  })
})
