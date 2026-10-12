/** Subtract oriented boxes from triangles, interpolating all vertex attributes. */
export function subtractBoxes(triangle, boxes) {
  let polygons = [triangle]
  for (const box of boxes) {
    const project = p => [
      (p[0] - box.centre[0]) * box.axis[0] + (p[2] - box.centre[2]) * box.axis[1],
      p[1] - box.centre[1],
      -(p[0] - box.centre[0]) * box.axis[1] + (p[2] - box.centre[2]) * box.axis[0],
    ]
    const next = []
    for (const polygon of polygons) {
      const local = polygon.map(project)
      if ([0, 1, 2].some(k => Math.min(...local.map(p => p[k])) >= box.half[k] || Math.max(...local.map(p => p[k])) <= -box.half[k])) {
        next.push(polygon); continue
      }
      let inside = polygon
      for (let k = 0; k < 3 && inside.length; k++) for (const sign of [-1, 1]) {
        if (!inside.length) break
        const distance = p => sign * project(p)[k] - box.half[k]
        const inner = [], outer = []
        for (let i = 0; i < inside.length; i++) {
          const a = inside[i], b = inside[(i + 1) % inside.length], da = distance(a), db = distance(b)
          if (da <= 0) inner.push(a)
          if (da >= 0) outer.push(a)
          if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            const t = da / (da - db), intersection = a.map((v, n) => v + (b[n] - v) * t)
            inner.push(intersection); outer.push(intersection)
          }
        }
        if (outer.length >= 3) next.push(outer)
        inside = inner
      }
    }
    polygons = next
  }
  return polygons.flatMap(p => p.slice(1, -1).map((_, i) => [p[0], p[i + 1], p[i + 2]]))
}

/** Split a glazing run around door apertures, avoiding duplicate glass over doors. */
export function glazingIntervals(length, openings) {
  const cutouts = openings.map(([a, b]) => [Math.max(0, a), Math.min(length, b)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
  const result = []
  let cursor = 0
  for (const [a, b] of cutouts) {
    if (a > cursor + 0.02) result.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < length - 0.02) result.push([cursor, length])
  return result
}
