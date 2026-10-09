import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BoxGeometry, PlaneGeometry } from 'three'
import { PNG } from 'pngjs'
import { subtractBoxes, glazingIntervals } from './campus-geometry.mjs'

const base = new URL('../public/models/simulator-map/', import.meta.url)
const input = readFileSync(new URL('NVHSV_Tang6_V3.glb', base))
const jsonSize = input.readUInt32LE(12)
const gltf = JSON.parse(input.toString('utf8', 20, 20 + jsonSize))
const originalBin = input.subarray(28 + jsonSize)
const chunks = [originalBin]
let byteLength = originalBin.length

function append(array, type, componentType, bounds) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
  const padding = (4 - byteLength % 4) % 4
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding }
  const bufferView = gltf.bufferViews.length
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length })
  chunks.push(bytes); byteLength += bytes.length
  const accessor = gltf.accessors.length
  gltf.accessors.push({ bufferView, componentType, count: array.length / (type === 'VEC3' ? 3 : 1), type, ...bounds })
  return accessor
}

function readAccessor(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView]
  const count = a.type === 'VEC3' ? 3 : 1
  const size = a.componentType === 5123 ? 2 : 4
  const data = new DataView(originalBin.buffer, originalBin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0))
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: count }, (_, k) => {
    const offset = i * (view.byteStride ?? count * size) + k * size
    return a.componentType === 5126 ? data.getFloat32(offset, true) : size === 2 ? data.getUint16(offset, true) : data.getUint32(offset, true)
  }))
}

// Display architecture only, traced against the supplied annotated floor plan.
// These coordinates never change ROS occupancy, navigation or pose calibration.
const glazingRuns = [
  [[49.4, -75.2], [47.7, -70.8], [59.4, -65.6], [61.9, -38.6]],
  [[28.4, -86.5], [26, -83.5], [27, -80], [31.5, -78]],
]
const atriumEdges = gltf.nodes.filter(n => /^Atrium V2 continuous top handrail/.test(n.name)).map(n => {
  const primitive = gltf.meshes[n.mesh].primitives[0]
  const half = gltf.accessors[primitive.attributes.POSITION].max[0]
  const q = n.rotation, cosine = 1 - 2 * q[1] * q[1], sine = -2 * q[1] * q[3]
  return [[n.translation[0] - half * cosine, n.translation[2] - half * sine], [n.translation[0] + half * cosine, n.translation[2] + half * sine]]
})
function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[1]) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(p[0] - a[0] - t * dx, p[2] - a[1] - t * dz)
}
const shell = gltf.nodes.find(n => n.name === 'Original architectural shell')
if (!shell) throw new Error('Architectural shell missing')
const wall = gltf.meshes[shell.mesh].primitives.find(p => gltf.materials[p.material].name === 'Warm ivory walls')
const positions = readAccessor(wall.attributes.POSITION)
const indices = readAccessor(wall.indices).flat()
const normals = readAccessor(wall.attributes.NORMAL)
const uvAccessor = gltf.accessors[wall.attributes.TEXCOORD_0]
const uvView = gltf.bufferViews[uvAccessor.bufferView]
const uvData = new DataView(originalBin.buffer, originalBin.byteOffset + (uvView.byteOffset ?? 0) + (uvAccessor.byteOffset ?? 0))
const uvs = Array.from({ length: uvAccessor.count }, (_, i) => [uvData.getFloat32(i * 8, true), uvData.getFloat32(i * 8 + 4, true)])
const floorCorners = new Set(positions.filter(p => p[1] < 0.05 && p[1] >= -0.005).map(p => `${p[0].toFixed(3)},${p[2].toFixed(3)}`))
const hiddenDoors = new Set()
const doors = gltf.nodes.filter(n => / outer aluminium head$/.test(n.name)).map(head => {
  const q = head.rotation, previousAxis = [1 - 2 * q[1] * q[1], -2 * q[1] * q[3]]
  const origin = [head.translation[0], head.translation[2]]
  const corners = [...new Map(positions.filter(p => Math.abs(p[1] - 3.48) < 0.005 && Math.hypot(p[0] - origin[0], p[2] - origin[1]) < 1.4 && floorCorners.has(`${p[0].toFixed(3)},${p[2].toFixed(3)}`)).map(p => [`${p[0].toFixed(3)},${p[2].toFixed(3)}`, [p[0], p[2]]])).values()]
  if (corners.length < 4) throw new Error(`Prepared door opening missing: ${head.name}`)
  let fit
  for (const a of corners) for (const b of corners) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length < 1.4) continue
    let axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    if (axis[0] * previousAxis[0] + axis[1] * previousAxis[1] < 0) axis = axis.map(v => -v)
    const local = corners.map(p => [p[0] * axis[0] + p[1] * axis[1], -p[0] * axis[1] + p[1] * axis[0]])
    const lo = [0, 1].map(k => Math.min(...local.map(p => p[k]))), hi = [0, 1].map(k => Math.max(...local.map(p => p[k])))
    const width = hi[0] - lo[0], depth = hi[1] - lo[1], area = width * depth
    if (width > 1.4 && width < 2.3 && depth < 0.9 && (!fit || area < fit.area)) fit = { axis, width, depth, area, u: (lo[0] + hi[0]) / 2, v: (lo[1] + hi[1]) / 2 }
  }
  if (!fit) throw new Error(`Cannot fit prepared door: ${head.name}`)
  const { axis, width, depth, u, v } = fit
  const centre = [u * axis[0] - v * axis[1], u * axis[1] + v * axis[0]]
  const name = head.name.replace(' outer aluminium head', '')
  for (const [i, node] of gltf.nodes.entries()) if (node.name.startsWith(`${name} `) && /glass|door leaf|threshold|handle|outer aluminium|lower aluminium|gasket|hinge/.test(node.name)) {
    hiddenDoors.add(i); node.name = `Source ${node.name}`
  }
  return { name, centre, axis, width, depth, corners }
})
// Match the long glazing run to the actual prepared wall planes, rather than
// the approximate traced points. Doors and glass now share one wall plane.
const wallPlanes = ['Empty room 06', '605', '606'].map(name => doors.find(d => d.name === name))
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const intersect = (a, b) => {
  const delta = [b.centre[0] - a.centre[0], b.centre[1] - a.centre[1]]
  const t = cross(delta, b.axis) / cross(a.axis, b.axis)
  return [a.centre[0] + t * a.axis[0], a.centre[1] + t * a.axis[1]]
}
const project = (p, line) => {
  const t = (p[0] - line.centre[0]) * line.axis[0] + (p[1] - line.centre[1]) * line.axis[1]
  return [line.centre[0] + t * line.axis[0], line.centre[1] + t * line.axis[1]]
}
glazingRuns[0] = [project(glazingRuns[0][0], wallPlanes[0]), intersect(wallPlanes[0], wallPlanes[1]), intersect(wallPlanes[1], wallPlanes[2]), project(glazingRuns[0][3], wallPlanes[2])]
const cuts = []
for (const run of [...glazingRuns, ...atriumEdges]) for (let s = 1; s < run.length; s++) {
  const a = run[s - 1], b = run[s], length = Math.hypot(b[0] - a[0], b[1] - a[1])
  cuts.push({ centre: [(a[0] + b[0]) / 2, 2.525, (a[1] + b[1]) / 2], axis: [(b[0] - a[0]) / length, (b[1] - a[1]) / length], half: [length / 2 + (run.length === 2 ? 0.25 : 0.6), 2.575, run.length === 2 ? 0.6 : 0.9] })
}
for (const door of doors) cuts.push({ centre: [door.centre[0], 1.755, door.centre[1]], axis: door.axis, half: [door.width / 2 - 0.025, 1.725, Math.max(0.5, door.depth)] })
const outputPositions = [], outputNormals = [], outputUvs = []
let removed = 0
for (let i = 0; i < indices.length; i += 3) {
  const triangle = indices.slice(i, i + 3).map(k => [...positions[k], ...normals[k], ...uvs[k]])
  const clipped = subtractBoxes(triangle, cuts)
  if (clipped.length !== 1 || clipped[0].some((p, k) => p !== triangle[k])) removed++
  for (const vertices of clipped) for (const p of vertices) {
    const normalLength = Math.hypot(...p.slice(3, 6)) || 1
    outputPositions.push(...p.slice(0, 3)); outputNormals.push(...p.slice(3, 6).map(v => v / normalLength)); outputUvs.push(...p.slice(6, 8))
  }
}
if (!removed) throw new Error('No marked walls were replaced')
wall.attributes.POSITION = append(new Float32Array(outputPositions), 'VEC3', 5126, { min: gltf.accessors[wall.attributes.POSITION].min, max: gltf.accessors[wall.attributes.POSITION].max })
wall.attributes.NORMAL = append(new Float32Array(outputNormals), 'VEC3', 5126)
const uvIndex = append(new Float32Array(outputUvs), 'SCALAR', 5126)
gltf.accessors[uvIndex].type = 'VEC2'; gltf.accessors[uvIndex].count = outputUvs.length / 2
wall.attributes.TEXCOORD_0 = uvIndex
delete wall.indices

// A self-contained pale stone tile replaces the dark corridor texture.
const tile = new PNG({ width: 128, height: 128 })
for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
  const i = (y * 128 + x) * 4, grout = x < 2 || y < 2
  const grain = ((x * 17 + y * 31) % 7) - 3
  tile.data[i] = (grout ? 181 : 220) + grain
  tile.data[i + 1] = (grout ? 193 : 228) + grain
  tile.data[i + 2] = (grout ? 201 : 233) + grain
  tile.data[i + 3] = 255
}
const textureBytes = PNG.sync.write(tile)
const imageAccessor = append(textureBytes, 'SCALAR', 5121)
const image = gltf.images.length
gltf.images.push({ name: 'Modern pale stone tile', bufferView: gltf.accessors[imageAccessor].bufferView, mimeType: 'image/png' })
const texture = gltf.textures.length
gltf.textures.push({ source: image, sampler: gltf.textures[0].sampler })

for (const material of gltf.materials) {
  const pbr = material.pbrMetallicRoughness
  if (material.name === 'Warm ivory walls') pbr.baseColorFactor = [0.9, 0.92, 0.94, 1]
  if (material.name === 'Dark warm grey terrazzo') {
    pbr.baseColorFactor = [0.95, 0.97, 1, 1]
    pbr.baseColorTexture = { index: texture }
    pbr.roughnessFactor = 0.68
  }
  if (/glass/i.test(material.name) && !/edge/i.test(material.name)) {
    material.alphaMode = 'BLEND'
    material.doubleSided = true
    pbr.baseColorFactor = [0.45, 0.78, 0.86, 0.24]
    pbr.metallicFactor = 0.12
    pbr.roughnessFactor = 0.12
  }
}
const glass = gltf.materials.length
gltf.materials.push({ name: 'Modern pale aqua architectural glass', alphaMode: 'BLEND', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.45, 0.78, 0.86, 0.26], metallicFactor: 0.15, roughnessFactor: 0.14 } })
const aluminium = gltf.materials.length
gltf.materials.push({ name: 'Modern graphite aluminium', pbrMetallicRoughness: { baseColorFactor: [0.11, 0.17, 0.2, 1], metallicFactor: 0.65, roughnessFactor: 0.3 } })
const geometry = new BoxGeometry(1, 1, 1)
const position = append(geometry.attributes.position.array, 'VEC3', 5126, { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] })
const normal = append(geometry.attributes.normal.array, 'VEC3', 5126)
const index = append(geometry.index.array, 'SCALAR', 5123)
const sheet = new PlaneGeometry(1, 1)
const sheetPosition = append(sheet.attributes.position.array, 'VEC3', 5126, { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] })
const sheetNormal = append(sheet.attributes.normal.array, 'VEC3', 5126)
const sheetIndex = append(sheet.index.array, 'SCALAR', 5123)
function box(name, centre, scale, rotation, material) {
  const mesh = gltf.meshes.length
  gltf.meshes.push({ name, primitives: [{ attributes: { POSITION: position, NORMAL: normal }, indices: index, material }] })
  const node = gltf.nodes.length
  gltf.nodes.push({ name, mesh, translation: centre, scale, rotation: [0, Math.sin(rotation / 2), 0, Math.cos(rotation / 2)] })
  gltf.scenes[gltf.scene ?? 0].nodes.push(node)
  return node
}
function glassSheet(name, centre, width, height, rotation) {
  const mesh = gltf.meshes.length
  gltf.meshes.push({ name, primitives: [{ attributes: { POSITION: sheetPosition, NORMAL: sheetNormal }, indices: sheetIndex, material: glass }] })
  const node = gltf.nodes.length
  gltf.nodes.push({ name, mesh, translation: centre, scale: [width, height, 1], rotation: [0, Math.sin(rotation / 2), 0, Math.cos(rotation / 2)] })
  gltf.scenes[gltf.scene ?? 0].nodes.push(node)
  return node
}
for (const door of doors) {
  const angle = -Math.atan2(door.axis[1], door.axis[0])
  const at = (u, y, v = 0) => [door.centre[0] + u * door.axis[0] - v * door.axis[1], y, door.centre[1] + u * door.axis[1] + v * door.axis[0]]
  const width = door.width - 0.1
  glassSheet(`${door.name} clear upper glass`, at(0, 1.755), width - 0.08, 3.32, angle)
  for (const side of [-1, 1]) box(`${door.name} outer aluminium jamb ${side}`, at(side * (door.width / 2 - 0.025), 1.755), [0.04, 3.44, 0.065], angle, aluminium)
  box(`${door.name} outer aluminium head`, at(0, 3.46), [door.width - 0.02, 0.035, 0.065], angle, aluminium)
  for (const side of [-1, 1]) box(`${door.name} door leaf stile ${side}`, at(side * width / 2, 1.755), [0.035, 3.36, 0.035], angle, aluminium)
  for (const y of [0.075, 3.435]) box(`${door.name} door leaf rail ${y}`, at(0, y), [width, 0.035, 0.035], angle, aluminium)
  box(`${door.name} lever handle`, at(width * 0.35, 1.5, 0.055), [0.18, 0.035, 0.035], angle, aluminium)
}
for (const [r, run] of glazingRuns.entries()) {
  for (let s = 1; s < run.length; s++) {
    const a = run[s - 1], b = run[s]
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx)
    const centre = [(a[0] + b[0]) / 2, 1.9, (a[1] + b[1]) / 2]
    const children = []
    const direction = [dx / length, dz / length]
    const openings = doors.filter(d => distanceToSegment([d.centre[0], 0, d.centre[1]], a, b) < 0.7).map(d => {
      const offset = (d.centre[0] - a[0]) * direction[0] + (d.centre[1] - a[1]) * direction[1]
      return [offset - d.width / 2 - 0.02, offset + d.width / 2 + 0.02]
    })
    let panel = 0
    for (const [start, end] of glazingIntervals(length, openings)) {
      const bays = Math.ceil((end - start) / 2.1)
      for (let n = 0; n < bays; n++) {
        const lo = start + (end - start) * n / bays, hi = start + (end - start) * (n + 1) / bays, mid = (lo + hi) / 2
        children.push(glassSheet(`Modern glass pane ${r}-${s}-${panel++}`, [a[0] + mid * direction[0], 1.9, a[1] + mid * direction[1]], hi - lo - 0.015, 3.5, angle))
        if (n > 0) children.push(box(`Modern glazing mullion ${r}-${s}-${n}-${start}`, [a[0] + lo * direction[0], 1.9, a[1] + lo * direction[1]], [0.04, 3.6, 0.06], angle, aluminium))
      }
    }
    box(`Modern glazing rail ${r}-${s}-top`, [centre[0], 3.68, centre[2]], [length, 0.07, 0.1], angle, aluminium)
    for (const [start, end] of glazingIntervals(length, openings)) {
      const mid = (start + end) / 2
      box(`Modern glazing rail ${r}-${s}-bottom-${start}`, [a[0] + mid * direction[0], 0.14, a[1] + mid * direction[1]], [end - start, 0.07, 0.1], angle, aluminium)
    }
    const group = gltf.nodes.length
    gltf.nodes.push({ name: `Modern glazing ${r}-${s}`, children })
    const scene = gltf.scenes[gltf.scene ?? 0]
    scene.nodes = scene.nodes.filter(i => !children.includes(i)); scene.nodes.push(group)
  }
}
// Atrium stays open: retain only the existing glass sheets, without railing furniture.
const removedAtrium = new Set(gltf.nodes.map((n, i) => /^Atrium V2 /.test(n.name) && !/^Atrium V2 glass panel /.test(n.name) ? i : -1))
for (const scene of gltf.scenes) scene.nodes = scene.nodes.filter(i => !removedAtrium.has(i))
for (const node of gltf.nodes) if (node.children) node.children = node.children.filter(i => !hiddenDoors.has(i))
for (const scene of gltf.scenes) scene.nodes = scene.nodes.filter(i => !hiddenDoors.has(i))
gltf.asset.extras = { ...(gltf.asset.extras ?? {}), campusStyle: 'modern-glass-v2', glazingRuns, replacedWallTriangles: removed, alignedDoors: doors.length, doorOpenings: doors }
gltf.buffers[0].byteLength = byteLength
const json = Buffer.from(JSON.stringify(gltf))
const jsonPadding = Buffer.alloc((4 - json.length % 4) % 4, 0x20)
const bin = Buffer.concat(chunks)
const binPadding = Buffer.alloc((4 - bin.length % 4) % 4)
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8)
header.write('glTF'); header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + json.length + jsonPadding.length + bin.length + binPadding.length, 8)
header.writeUInt32LE(json.length + jsonPadding.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
binHeader.writeUInt32LE(bin.length + binPadding.length); binHeader.writeUInt32LE(0x004e4942, 4)
const output = new URL('NVHSV_Tang6_V3_modern_v2.glb', base)
writeFileSync(output, Buffer.concat([header, json, jsonPadding, binHeader, bin, binPadding]))
console.log(`Styled model: ${fileURLToPath(output)}; replaced ${removed} wall triangles.`)
