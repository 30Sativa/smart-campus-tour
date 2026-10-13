/** Close partition ends intersected by the wall-to-glass replacement cut.
 * Infer the original thickness from paired planar faces; ignore columns and
 * curved edges, and only restore an end which actually meets the new facade.
 */
export function wallGlazingReturns(positions, normals, indices, runs, excluded = new Set()) {
  const planes = new Map()
  for (let i = 0; i < indices.length; i += 3) {
    if (excluded.has(i)) continue
    const points = indices.slice(i, i + 3).map(k => positions[k]), normal = normals[indices[i]]
    if (Math.abs(normal[1]) > 0.001) continue
    const sign = normal[0] < -0.001 || Math.abs(normal[0]) < 0.001 && normal[2] < 0 ? -1 : 1
    const n = [normal[0] * sign, normal[2] * sign], axis = [-n[1], n[0]]
    const offsets = points.map(p => p[0] * axis[0] + p[2] * axis[1])
    const plane = points[0][0] * n[0] + points[0][2] * n[1]
    const key = [...n, plane].map(v => v.toFixed(3)).join(',')
    if (!planes.has(key)) planes.set(key, { n, axis, plane, lo: Infinity, hi: -Infinity, bottom: Infinity, top: -Infinity })
    const face = planes.get(key)
    face.lo = Math.min(face.lo, ...offsets); face.hi = Math.max(face.hi, ...offsets)
    face.bottom = Math.min(face.bottom, ...points.map(p => p[1])); face.top = Math.max(face.top, ...points.map(p => p[1]))
  }
  // A door splits a wall face into short upper/lower triangles. Qualify the
  // combined plane, not individual triangles, so its end is still restored.
  const result = [], seen = [], faces = [...planes.values()].filter(face => face.top - face.bottom >= 4.8 && face.hi - face.lo >= 2)
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i], b = faces[j], width = Math.abs(a.plane - b.plane)
    if (Math.hypot(a.n[0] - b.n[0], a.n[1] - b.n[1]) > 0.001 || width < 0.18 || width > 0.5) continue
    const lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi), plane = (a.plane + b.plane) / 2
    if (hi - lo < 2) continue
    for (const [r, run] of runs.entries()) for (let s = 1; s < run.length; s++) {
      const start = run[s - 1], end = run[s], length = Math.hypot(end[0] - start[0], end[1] - start[1])
      const direction = [(end[0] - start[0]) / length, (end[1] - start[1]) / length]
      const dot = direction[0] * a.n[0] + direction[1] * a.n[1]
      if (Math.abs(dot) < 0.35) {
        // The facade cut also overruns its endpoint by 0.6 m. Restore the
        // original wall continuing beyond it, rather than its glazed portion.
        if (Math.abs(direction[0] * a.axis[0] + direction[1] * a.axis[1]) < 0.995) continue
        const sign = direction[0] * a.axis[0] + direction[1] * a.axis[1] > 0 ? 1 : -1
        for (const [endpoint, side] of [[end, sign]]) {
          if (s !== run.length - 1) continue
          const t = endpoint[0] * a.axis[0] + endpoint[1] * a.axis[1]
          const distance = endpoint[0] * a.n[0] + endpoint[1] * a.n[1] - plane
          if (Math.abs(distance) > 0.3 || t < lo || t > hi || (side > 0 ? hi - t : t - lo) < 0.7) continue
          const join = [endpoint[0] - distance * a.n[0], endpoint[1] - distance * a.n[1]]
          if (seen.some(j => j.side === side && Math.hypot(j.join[0] - join[0], j.join[1] - join[1]) < 0.015)) continue
          seen.push({ join, axis: a.axis, side })
          result.push({ name: `Partition continuation ${r}-${s}-${result.length}`, join, axis: a.axis, centre: [join[0] + side * 0.35 * a.axis[0], (a.bottom + a.top) / 2, join[1] + side * 0.35 * a.axis[1]], size: [0.76, a.top - a.bottom, width], angle: -Math.atan2(a.axis[1], a.axis[0]), run: r, segment: s, continuation: true })
        }
        continue
      }
      const offset = (plane - start[0] * a.n[0] - start[1] * a.n[1]) / dot
      if (offset < -0.15 || offset > length + 0.15) continue
      const join = [start[0] + offset * direction[0], start[1] + offset * direction[1]]
      const t = join[0] * a.axis[0] + join[1] * a.axis[1]
      if (t < lo - 0.4 || t > hi + 0.4 || Math.min(Math.abs(t - lo), Math.abs(t - hi)) > 0.5) continue
      const side = Math.abs(t - lo) < Math.abs(t - hi) ? 1 : -1
      const reach = 0.9 / Math.abs(dot) + 0.08
      const centre = [join[0] + side * (reach - 0.03) / 2 * a.axis[0], (a.bottom + a.top) / 2, join[1] + side * (reach - 0.03) / 2 * a.axis[1]]
      // A corner can have two different walls meeting at the same point.
      // Deduplicate repeated faces, not the other wall or opposite return.
      if (seen.some(j => j.side === side && Math.hypot(j.join[0] - join[0], j.join[1] - join[1]) < 0.015 && Math.hypot(j.axis[0] - a.axis[0], j.axis[1] - a.axis[1]) < 0.003)) continue
      seen.push({ join, axis: a.axis, side })
      result.push({ name: `Partition glazing return ${r}-${s}-${result.length}`, join, axis: a.axis, centre, size: [reach + 0.03, a.top - a.bottom, width], angle: -Math.atan2(a.axis[1], a.axis[0]), run: r, segment: s })
    }
  }
  return result
}
