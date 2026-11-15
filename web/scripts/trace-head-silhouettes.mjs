#!/usr/bin/env node
// Traces the real robot's outline, to scale, for the POI camera preview (HeadCameraPreview).
// Run from web/ after the CAD model changes:  node scripts/trace-head-silhouettes.mjs
// Reads public/models/robot/campus-amr-explode.glb (metres, y up, front +z, left +x) and writes
// src/features/administration/pois/robot-silhouettes.ts: SVG paths in millimetres per part group, seen from above
// (front up, the robot's left on the left) and from the robot's right side (front to the right).
import fs from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
const MODEL = 'public/models/robot/campus-amr-explode.glb'
const OUTPUT = 'src/features/administration/pois/robot-silhouettes.ts'
const buf = fs.readFileSync(MODEL); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
await MeshoptDecoder.ready
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(ab, '')
const root = gltf.scene; root.updateMatrixWorld(true)

const groupOf = name => {
  if (name.startsWith('quest')) return 'quest'
  if (name.startsWith('head')) return 'head'
  if (name === 'pantilt__05') return 'mount'
  if (name === 'pantilt__01' || name === 'pantilt__02') return 'dome'
  if (name === 'pantilt__03') return 'base'
  if (name.startsWith('pantilt')) return null   // hidden inside the dome
  if (name.startsWith('column')) return 'column'
  return 'body'
}
const tris = {}  // group -> array of [x,y,z]*3 (metres)
root.traverse(o => {
  if (!o.isMesh) return
  const g = groupOf(o.name); if (!g) return
  const pos = o.geometry.attributes.position; const idx = o.geometry.index
  const v = new THREE.Vector3(); const pts = []
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push([v.x, v.y, v.z]) }
  const list = tris[g] ??= []
  const n = idx ? idx.count : pos.count
  for (let i = 0; i < n; i += 3) { const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2; list.push([pts[a], pts[b], pts[c]]) }
})

// Views (mm, SVG y down). top: front up, robot's left on the left. side: seen from the robot's right, front to the right.
const views = { top: p => [-p[0] * 1000, -p[2] * 1000], side: p => [p[2] * 1000, -p[1] * 1000] }
const CELL = 1.5

function silhouette(triangles, project) {
  const t2 = triangles.map(t => t.map(project))
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const t of t2) for (const [x, y] of t) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  minX -= 2 * CELL; minY -= 2 * CELL
  const W = Math.ceil((maxX - minX) / CELL) + 4, H = Math.ceil((maxY - minY) / CELL) + 4
  const grid = new Uint8Array(W * H)
  for (const [[ax, ay], [bx, by], [cx, cy]] of t2) {
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / CELL)), x1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx, cx) - minX) / CELL))
    const y0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - minY) / CELL)), y1 = Math.min(H - 1, Math.ceil((Math.max(ay, by, cy) - minY) / CELL))
    const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(d) < 1e-9) continue
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const px = minX + (i + 0.5) * CELL, py = minY + (j + 0.5) * CELL
      const w1 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / d, w2 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / d, w3 = 1 - w1 - w2
      if (w1 >= -0.02 && w2 >= -0.02 && w3 >= -0.02) grid[j * W + i] = 1
    }
  }
  // close 1-cell gaps
  const filled = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 1
  // components, trace outer boundary of each big one (Moore neighbour)
  const seen = new Uint8Array(W * H); const paths = []
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!filled(i, j) || seen[j * W + i]) continue
    // flood to mark component and count
    const stack = [[i, j]]; seen[j * W + i] = 1; let area = 0
    while (stack.length) { const [x, y] = stack.pop(); area++; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (filled(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; stack.push([nx, ny]) } } }
    if (area * CELL * CELL < 40) continue
    // trace starting at (i,j): topmost-leftmost of this component since scanning row-major
    const dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]
    const start = [i, j]; let cur = start, back = 4 /* came from the left */; const pts = [start]
    for (let guard = 0; guard < 200000; guard++) {
      let found = false
      for (let k = 0; k < 8; k++) { const d = (back + 1 + k) % 8; const nx = cur[0] + dirs[d][0], ny = cur[1] + dirs[d][1]
        if (filled(nx, ny)) { cur = [nx, ny]; back = (d + 4) % 8; found = true; break } }
      if (!found || (cur[0] === start[0] && cur[1] === start[1])) break
      pts.push(cur)
    }
    paths.push(pts.map(([x, y]) => [minX + (x + 0.5) * CELL, minY + (y + 0.5) * CELL]))
  }
  return paths
}

function simplify(points, eps) {
  if (points.length < 3) return points
  const dp = (a, b) => { let max = 0, at = -1; const [ax, ay] = points[a], [bx, by] = points[b]; const L = Math.hypot(bx - ax, by - ay) || 1e-9
    for (let k = a + 1; k < b; k++) { const [px, py] = points[k]; const dist = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / L; if (dist > max) { max = dist; at = k } }
    return max > eps ? [...dp(a, at).slice(0, -1), ...dp(at, b)] : [points[a], points[b]] }
  return dp(0, points.length - 1)
}

const out = {}
for (const [view, project] of Object.entries(views)) {
  out[view] = {}
  for (const [g, list] of Object.entries(tris)) {
    if (view === 'side' && g === 'body') continue
    // From above, the Quest's head strap would hide the whole head: keep only the visor, in front of the face.
    const triangles = view === 'top' && g === 'quest' ? list.filter(t => (t[0][2] + t[1][2] + t[2][2]) / 3 > 0.06) : list
    const paths = silhouette(triangles, project).map(p => simplify(p, 1.2)).filter(p => p.length >= 3)
    out[view][g] = paths.map(p => 'M' + p.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L') + 'Z').join('')
  }
}
const lines = ['// Generated by web/scripts/trace-head-silhouettes.mjs from ' + MODEL + '. Do not edit by hand.',
  '// SVG paths in millimetres. top: seen from above, front up, the robot\'s left on the left (x = -cadX, y = -cadZ).',
  '// side: seen from the robot\'s right, front to the right (x = cadZ, y = -cadY).',
  'export const ROBOT_SILHOUETTES = ' + JSON.stringify(out, null, 2).replace(/"([a-z]+)":/g, '$1:') + ' as const', '']
fs.writeFileSync(OUTPUT, lines.join('\n'))
console.log('wrote ' + OUTPUT)
