import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { patrolGeometry, segmentDistance, insideTriangle } from './patrol-geometry.mjs'

const model = 'public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb'
const geometry = patrolGeometry(model), cell = 0.75, bucket = 3, clearance = 0.6
function index(items, points) {
  const bins = new Map()
  for (const item of items) {
    const p = points(item)
    for (let x = Math.floor(Math.min(...p.map(v => v[0])) / bucket); x <= Math.floor(Math.max(...p.map(v => v[0])) / bucket); x++) {
      for (let y = Math.floor(Math.min(...p.map(v => v[1])) / bucket); y <= Math.floor(Math.max(...p.map(v => v[1])) / bucket); y++) {
        const key = `${x},${y}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(item)
      }
    }
  }
  return p => bins.get(`${Math.floor(p[0] / bucket)},${Math.floor(p[1] / bucket)}`) ?? []
}
const floors = index(geometry.floors.filter(t => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0])) > 0.001), t => t)
const edgeMap = new Map(geometry.edges.map(e => [[...e.a, ...e.b].map(v => v.toFixed(3)).join(','), e]))
const obstacles = index([...edgeMap.values()], e => [
  [Math.min(e.a[0], e.b[0]) - clearance, Math.min(e.a[1], e.b[1]) - clearance],
  [Math.max(e.a[0], e.b[0]) + clearance, Math.max(e.a[1], e.b[1]) + clearance],
])
const atrium = [[29.39, -67.68], [35.29, -72.37], [51.25, -65.35], [53.58, -40.25], [36.2, -26.52], [34.05, -26.16]]
const inAtrium = p => atrium.slice(1, -1).some((_, i) => insideTriangle(p, [atrium[0], atrium[i + 1], atrium[i + 2]]))
const free = p => !inAtrium(p) && floors(p).some(t => insideTriangle(p, t)) && obstacles(p).every(e => segmentDistance(p, e.a, e.b) >= clearance + 0.02)
const all = [], lookup = new Map()
for (let ix = -4; ix <= 100; ix++) for (let iy = -131; iy <= 3; iy++) {
  const p = [ix * cell, iy * cell]
  if (free(p)) { lookup.set(`${ix},${iy}`, all.length); all.push({ p, ix, iy, edges: [] }) }
}
for (const n of all) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
  const j = lookup.get(`${n.ix + dx},${n.iy + dy}`)
  if (j === undefined) continue
  const b = all[j].p
  // Every edge and its entire footprint sweep must have floor and wall clearance.
  if (Array.from({ length: 12 }, (_, k) => n.p.map((v, i) => v + (b[i] - v) * k / 11)).every(free)) n.edges.push(j)
}
const nearest = (p, nodes) => nodes.reduce((best, n) => Math.hypot(n.p[0] - p[0], n.p[1] - p[1]) < Math.hypot(best.p[0] - p[0], best.p[1] - p[1]) ? n : best)
const seen = new Set(), queue = [all.indexOf(nearest([24, -74], all))]
while (queue.length) { const i = queue.pop(); if (seen.has(i)) continue; seen.add(i); all[i].edges.forEach(j => queue.push(j)) }
const remap = new Map([...seen].sort((a, b) => a - b).map((old, i) => [old, i]))
const nodes = [...remap.keys()].map(i => ({ p: all[i].p, edges: all[i].edges.filter(j => remap.has(j)).map(j => remap.get(j)) }))
const marks = [[24, -74], [29.1, -43], [58, -29], [58, -58], [33, -76], [22, -79], [17, -69], [1, -65], [3, -31], [34, -19]]
const pois = marks.map((p, i) => { const n = nearest(p, nodes); return { poi: i + 1, node: nodes.indexOf(n), x: n.p[0], y: n.p[1], annotated: p } })
const data = { cell, clearance, modelSha256: createHash('sha256').update(readFileSync(model)).digest('hex'), nodes, pois }
writeFileSync('src/features/digital-twin/patrol-nav.json', JSON.stringify(data))
console.log(JSON.stringify({ nodes: nodes.length, allNodes: all.length, pois }, null, 2))
