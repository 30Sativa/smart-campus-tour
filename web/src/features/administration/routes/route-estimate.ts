type Point = { x: number; y: number }
export type EstimateStop = Point & { dwellSeconds: number }

/** Positions are stored as decimal(10, 4), so the saved revision is estimated from these values. */
const stored = (value: number) => Math.round(value * 10_000) / 10_000

/**
 * A route draft's expected length in seconds, by the backend rule `TourSchedule.EstimatedDurationSeconds`: every stop's
 * dwell plus the straight-line travel start -> stop 1 -> ... -> last stop -> end at `speedMetersPerSecond`, the travel
 * rounded up to a whole second. `end` is null when the route ends at the last stop (LAST_POI, no final leg).
 * `speedMetersPerSecond` is `estimatedSpeedMetersPerSecond` from `GET .../tours/shifts`, the server's own setting.
 * The fixture of `route-estimate.test.ts` is repeated in backend `TourScheduleTests`, so the two cannot drift apart.
 * Null when anything it needs is not known yet.
 */
export function estimatedRouteSeconds(start: Point | null, stops: readonly EstimateStop[], end: Point | null,
  speedMetersPerSecond: number | null | undefined): number | null {
  if (!start || !stops.length || !speedMetersPerSecond || !(speedMetersPerSecond > 0)) return null
  const points = [start, ...stops, ...(end ? [end] : [])].map(point => ({ x: stored(point.x), y: stored(point.y) }))
  if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  let meters = 0
  for (let index = 1; index < points.length; index++)
    meters += Math.hypot(points[index - 1].x - points[index].x, points[index - 1].y - points[index].y)
  // Math.Round(meters / speed, 6) then Math.Ceiling, as the server does, so 44.0000000001 s stays 44 s.
  const travel = Math.ceil(Math.round(meters / speedMetersPerSecond * 1e6) / 1e6)
  return stops.reduce((sum, stop) => sum + (Number.isFinite(stop.dwellSeconds) ? stop.dwellSeconds : 0), 0) + travel
}
