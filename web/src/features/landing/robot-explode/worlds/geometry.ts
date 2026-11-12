import type { DrivePoint } from '../drive'

/** Distance from `p` to the segment `a`–`b`. */
export function segmentGapTo(p: DrivePoint, a: DrivePoint, b: DrivePoint) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** The point `distance` metres along a polyline (wrapping round when `loop`), with its heading. */
export function alongPath(points: readonly DrivePoint[], loop: boolean, distance: number): DrivePoint & { yaw: number } {
  const segments = loop ? points.length : points.length - 1
  const lengths = Array.from({ length: segments }, (_, i) => {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    return Math.hypot(b.x - a.x, b.y - a.y)
  })
  const total = lengths.reduce((sum, length) => sum + length, 0)
  // Open paths are walked there and back: unfold them into a loop twice as long.
  let d = loop ? ((distance % total) + total) % total : ((distance % (2 * total)) + 2 * total) % (2 * total)
  const back = !loop && d > total
  if (back) d = 2 * total - d
  for (let i = 0; i < segments; i += 1) {
    if (d <= lengths[i] || i === segments - 1) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      const t = lengths[i] ? Math.min(1, d / lengths[i]) : 0
      const yaw = Math.atan2(b.y - a.y, b.x - a.x) + (back ? Math.PI : 0)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, yaw }
    }
    d -= lengths[i]
  }
  return { ...points[0], yaw: 0 }
}

/** Length of a polyline, closed when `loop`. */
export function pathLength(points: readonly DrivePoint[], loop: boolean) {
  let total = 0
  const segments = loop ? points.length : points.length - 1
  for (let i = 0; i < segments; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return total
}

/**
 * The next turn along `route` from the robot at `at`: which way and how far,
 * or null when the rest is (nearly) straight. Turns under 25° do not count.
 * Sides are named as the driver sees them, like the steering keys: `right`
 * turns the heading up, as D does. (The maps are drawn with map y along the
 * scene's z, a mirror image, which is why a turn up reads as a right turn.)
 */
export function nextTurn(at: DrivePoint, route: readonly DrivePoint[]): { side: 'left' | 'right'; distance: number } | null {
  let travelled = 0
  let from = at
  for (let i = 0; i + 1 < route.length; i += 1) {
    const a = route[i]
    const b = route[i + 1]
    travelled += Math.hypot(a.x - from.x, a.y - from.y)
    from = a
    const before = Math.atan2(a.y - (i === 0 ? at.y : route[i - 1].y), a.x - (i === 0 ? at.x : route[i - 1].x))
    const after = Math.atan2(b.y - a.y, b.x - a.x)
    const turn = Math.atan2(Math.sin(after - before), Math.cos(after - before))
    if (i > 0 && Math.abs(turn) > (25 * Math.PI) / 180) return { side: turn > 0 ? 'right' : 'left', distance: travelled }
  }
  return null
}
