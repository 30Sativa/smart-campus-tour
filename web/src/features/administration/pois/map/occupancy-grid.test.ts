import { describe, expect, it } from 'vitest'
import { DEFAULT_POI_MAP, occupancyMapFor } from './catalog'
import { cellAtPose, headingFromPoints, imageToRos, quantizePosition, quantizeYaw, rosToImage, sampleCell, screenToImage } from './occupancy-grid'

describe('occupancy-grid coordinates', () => {
  const map = DEFAULT_POI_MAP

  it('maps the actual raster edges, origin and cell centers to ROS metres', () => {
    expect(imageToRos(map, { u: 0, v: 1949 })).toEqual({ x: -15.3, y: -76.1 })
    expect(imageToRos(map, { u: 0, v: 0 }).y).toBeCloseTo(21.35, 10)
    const origin = imageToRos(map, { u: 306, v: 427 })
    expect(origin.x).toBeCloseTo(0, 10)
    expect(origin.y).toBeCloseTo(0, 10)
    const center = imageToRos(map, { u: 0.5, v: 0.5 })
    expect(center.x).toBeCloseTo(-15.275, 10)
    expect(center.y).toBeCloseTo(21.325, 10)
    expect(cellAtPose(map, center)).toEqual({ column: 0, row: 0 })
  })

  it('round-trips continuous positions with supported origin translations', () => {
    for (const origin of [map.origin, [-10, -20, 0] as const]) {
      const grid = { ...map, origin }
      for (const point of [{ u: 306, v: 427 }, { u: 709.1234, v: 974.5678 }, { u: 0.5, v: 1948.5 }]) {
        const pixel = rosToImage(grid, imageToRos(grid, point))
        expect(pixel.u).toBeCloseTo(point.u, 9)
        expect(pixel.v).toBeCloseTo(point.v, 9)
      }
    }
  })

  it('uses ROS half-open bounds without clamping an out-of-map pose', () => {
    expect(cellAtPose(map, { x: -15.3, y: -76.1 })).toEqual({ column: 0, row: 1948 })
    expect(cellAtPose(map, { x: 55.65, y: 0 })).toBeNull()
    expect(cellAtPose(map, { x: 0, y: 21.35 })).toBeNull()
    expect(cellAtPose(map, { x: -15.3001, y: 0 })).toBeNull()
    expect(cellAtPose(map, { x: Number.NaN, y: 0 })).toBeNull()
  })

  it('uses +X zero, counter-clockwise yaw and API precision', () => {
    const origin = { x: 0, y: 0 }
    expect(headingFromPoints(origin, { x: 1, y: 0 })).toBe(0)
    expect(headingFromPoints(origin, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2)
    expect(headingFromPoints(origin, { x: 0, y: -1 })).toBeCloseTo(-Math.PI / 2)
    expect(Math.abs(headingFromPoints(origin, { x: -1, y: 0 })!)).toBeCloseTo(Math.PI)
    expect(headingFromPoints(origin, origin)).toBeNull()
    expect(quantizePosition({ x: -15.275123, y: 21.325123 })).toEqual({ x: -15.2751, y: 21.3251 })
    expect(quantizeYaw(5 * Math.PI / 2)).toBe(1.570796)
    expect(Math.abs(quantizeYaw(Math.PI))).toBe(3.141593)
  })

  it('inverts screen scaling, rotation and letterbox translation', () => {
    expect(screenToImage({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 }, 712, 904)).toEqual({ u: 306, v: 427 })
    expect(screenToImage({ a: 0, b: 2, c: -2, d: 0, e: 100, f: 50 }, 80, 90)).toEqual({ u: 20, v: 10 })
    expect(screenToImage(null, 0, 0)).toBeNull()
    expect(screenToImage({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }, 0, 0)).toBeNull()
  })

  it('samples exact original cells and handles missing or unrecognized pixels', () => {
    const grid = { width: 2, height: 2, resolution: 1, origin: [0, 0, 0] as const }
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 205, 205, 205, 255])
    expect(sampleCell(grid, rgba, { x: 0.5, y: 1.5 })).toBe('occupied')
    expect(sampleCell(grid, rgba, { x: 1.5, y: 1.5 })).toBe('free')
    expect(sampleCell(grid, rgba, { x: 0.5, y: 0.5 })).toBe('unknown')
    expect(sampleCell(grid, rgba, { x: 1.5, y: 0.5 })).toBe('unavailable')
    expect(sampleCell(grid, null, { x: 0.5, y: 0.5 })).toBe('unavailable')
    expect(sampleCell(grid, rgba, { x: -1, y: 0 })).toBe('outside')
  })

  it('never aliases demo keys or a mismatched frame to the registered raster', () => {
    expect(occupancyMapFor('map2-v1', 'map')).toBe(map)
    expect(occupancyMapFor('demo-poi-baseline-v1', 'map')).toBeNull()
    expect(occupancyMapFor('campus_v1', 'map')).toBeNull()
    expect(occupancyMapFor('map2-v1', 'odom')).toBeNull()
  })
})
