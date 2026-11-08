import type { ImagePoint } from './occupancy-grid'

export type FittedView = { x: number; y: number; width: number; height: number; unit: number }

/**
 * The part of a map raster that frames a set of points, as an SVG viewBox. The margin grows with the
 * points' spread so unexplored grey does not fill the frame; `zoom` keeps the centre of the fitted view.
 * `unit` is one marker pixel at that view, because uploaded rasters differ in size and markers must not.
 */
export function fitView(map: { width: number; height: number }, points: ImagePoint[], zoom = 1): FittedView {
  const us = points.map(point => point.u), vs = points.map(point => point.v)
  const spread = us.length ? Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs)) : 0
  const pad = Math.max(40, spread * 0.2)
  const x0 = Math.max(0, us.length ? Math.min(...us) - pad : 0), y0 = Math.max(0, vs.length ? Math.min(...vs) - pad : 0)
  const w = Math.max(Math.min(map.width, us.length ? Math.max(...us) + pad : map.width) - x0, Math.min(200, map.width))
  const h = Math.max(Math.min(map.height, vs.length ? Math.max(...vs) + pad : map.height) - y0, Math.min(200, map.height))
  const width = w / zoom, height = h / zoom
  return { x: x0 + (w - width) / 2, y: y0 + (h - height) / 2, width, height, unit: Math.max(width, height) / 560 }
}
