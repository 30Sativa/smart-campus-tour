import type { ImagePoint } from './occupancy-grid'

export type FittedView = { x: number; y: number; width: number; height: number; unit: number }

type MapSize = { width: number; height: number }

const markerUnit = (width: number, height: number) => Math.max(width, height) / 560

/**
 * The part of a map raster that frames a set of points, as an SVG viewBox. The margin grows with the
 * points' spread so unexplored grey does not fill the frame.
 * `unit` is one marker pixel at that view, because uploaded rasters differ in size and markers must not.
 */
export function fitView(map: MapSize, points: ImagePoint[]): FittedView {
  const us = points.map(point => point.u), vs = points.map(point => point.v)
  const spread = us.length ? Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs)) : 0
  const pad = Math.max(40, spread * 0.2)
  const x = Math.max(0, us.length ? Math.min(...us) - pad : 0), y = Math.max(0, vs.length ? Math.min(...vs) - pad : 0)
  const width = Math.max(Math.min(map.width, us.length ? Math.max(...us) + pad : map.width) - x, Math.min(200, map.width))
  const height = Math.max(Math.min(map.height, vs.length ? Math.max(...vs) + pad : map.height) - y, Math.min(200, map.height))
  return { x, y, width, height, unit: markerUnit(width, height) }
}

/** On one axis: a view larger than the map centres it, a smaller one stays over it, so a drag can never lose the map. */
const keepOverMap = (start: number, size: number, mapSize: number) =>
  size >= mapSize ? (mapSize - size) / 2 : Math.min(mapSize - size, Math.max(0, start))

/** Move a view, keeping it over the map. */
export function placeView(map: MapSize, view: Omit<FittedView, 'unit'>): FittedView {
  return { x: keepOverMap(view.x, view.width, map.width), y: keepOverMap(view.y, view.height, map.height), width: view.width, height: view.height, unit: markerUnit(view.width, view.height) }
}

/**
 * Zoom by `factor` around the view centre, or keep `focus` fixed under the cursor. The frame's shape never
 * changes, so nothing jumps on the first step; zooming out stops once the whole map is inside the frame.
 */
export function zoomView(map: MapSize, view: FittedView, factor: number, focus?: ImagePoint): FittedView {
  const aspect = view.width / view.height
  const height = Math.min(Math.max(map.height, map.width / aspect), Math.max(map.height / 32, view.height / factor))
  const width = height * aspect
  const scale = height / view.height
  const anchor = focus ?? { u: view.x + view.width / 2, v: view.y + view.height / 2 }
  return placeView(map, { x: anchor.u - (anchor.u - view.x) * scale, y: anchor.v - (anchor.v - view.y) * scale, width, height })
}
