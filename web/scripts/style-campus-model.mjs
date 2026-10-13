import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BoxGeometry, PlaneGeometry } from 'three'
import { deflateSync } from 'node:zlib'
import { subtractBoxes, glazingIntervals } from './campus-geometry.mjs'
import { buildCampusGarden, gardenEntry, gardenGlassRun, gardenWallTop } from './campus-garden.mjs'
import { wallGlazingReturns } from './campus-wall-joints.mjs'
import { buildLampLayout } from './campus-lights.mjs'
import { buildCorridorMask } from './campus-corridor.mjs'

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
  gltf.accessors.push({ bufferView, componentType, count: array.length / (type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1), type, ...bounds })
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
  // Keep the 602 corner column inside: glass wraps its outer side, then
  // rejoins the original prepared door plane beyond the column.
  [[28.4, -86.5], [26, -83.5], [26.30, -81.35], [26.30, -79.82], [28, -79.555555556], [31.5, -78]],
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
// The original shell also contains three separate low rings around the atrium.
// Remove those connected parts entirely, rather than leaving slivers outside
// the traced glass planes. Keep the separate tall 1 m columns intact.
const parents = indices.map((_, i) => i), shared = new Map()
function root(i) { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i] } return i }
for (let i = 0; i < indices.length; i += 3) for (let k = 0; k < 3; k++) {
  const key = positions[indices[i + k]].map(v => v.toFixed(3)).join(',')
  if (shared.has(key)) parents[root(i)] = root(shared.get(key))
  else shared.set(key, i)
}
const parts = new Map()
for (let i = 0; i < indices.length; i += 3) {
  const id = root(i)
  if (!parts.has(id)) parts.set(id, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], triangles: [] })
  const part = parts.get(id)
  part.triangles.push(i)
  for (const index of indices.slice(i, i + 3)) for (let k = 0; k < 3; k++) {
    part.min[k] = Math.min(part.min[k], positions[index][k]); part.max[k] = Math.max(part.max[k], positions[index][k])
  }
}
const lowAtrium = new Set(), columns = new Set()
const columnBounds = []
for (const part of parts.values()) {
  const size = part.max.map((v, k) => v - part.min[k])
  const atriumRing = part.min[0] > 28 && part.max[0] < 55 && part.min[2] > -74 && part.max[2] < -24
    && size[0] > 10 && size[2] > 20 && part.max[1] <= 1.51
  const column = size[0] < 1.01 && size[2] < 1.01 && size[1] > 4.9
  if (column) columnBounds.push({ min: part.min, max: part.max })
  if (atriumRing || column) for (const triangle of part.triangles) (atriumRing ? lowAtrium : columns).add(triangle)
}
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
// The corner frontage stops at its actual partition, not a traced point short
// of that joint. Fit both end and door to the same prepared 602 wall plane.
const cornerDoor = doors.find(d => d.name === '602'), tracedEnd = glazingRuns[1].at(-1)
const partitionPlanes = new Map()
for (let i = 0; i < positions.length; i++) {
  const p = positions[i], n = normals[i]
  if (Math.abs(p[1] - 5) > 0.001 || Math.hypot(p[0] - tracedEnd[0], p[2] - tracedEnd[1]) > 2 || Math.abs(n[0] * cornerDoor.axis[0] + n[2] * cornerDoor.axis[1]) < 0.999) continue
  const offset = (p[0] - cornerDoor.centre[0]) * cornerDoor.axis[0] + (p[2] - cornerDoor.centre[1]) * cornerDoor.axis[1]
  partitionPlanes.set(offset.toFixed(3), offset)
}
if (partitionPlanes.size !== 2) throw new Error('Corner partition faces could not be fitted')
const cornerOffset = [...partitionPlanes.values()].reduce((sum, v) => sum + v, 0) / 2
glazingRuns[1][4] = project(glazingRuns[1][4], cornerDoor)
glazingRuns[1][5] = cornerDoor.centre.map((v, k) => v + cornerOffset * cornerDoor.axis[k])
// Fit marked openings to geometric wall edges rather than rounded shading
// normals. Both wall faces must span the entire new opening away from corners.
const surveyEdges = []
for (let i = 0; i < indices.length; i += 3) {
  const triangle = indices.slice(i, i + 3).map(index => positions[index])
  const top = triangle.filter(point => Math.abs(point[1] - 5) < 0.001)
  if (top.length !== 2) continue
  const [a, b] = top.map(point => [point[0], point[2]]), length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (length > 0.9) surveyEdges.push({ a, b, length, axis: [(b[0] - a[0]) / length, (b[1] - a[1]) / length] })
}
function fittedWallDoor(name, point, roughAxis, width = 1.82) {
  const candidates = surveyEdges.filter(edge => {
    const along = (point[0] - edge.a[0]) * edge.axis[0] + (point[1] - edge.a[1]) * edge.axis[1]
    const distance = Math.abs((point[0] - edge.a[0]) * edge.axis[1] - (point[1] - edge.a[1]) * edge.axis[0])
    return Math.abs(edge.axis[0] * roughAxis[0] + edge.axis[1] * roughAxis[1]) > 0.99
      && distance < 1.2 && along > width / 2 + 0.05 && along < edge.length - width / 2 - 0.05
  })
  let fitted, bestDistance = Infinity
  for (const a of candidates) for (const b of candidates) {
    if (Math.abs(a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1]) < 0.999999) continue
    const sign = Math.sign(a.axis[0] * roughAxis[0] + a.axis[1] * roughAxis[1]), axis = a.axis.map(v => v * sign)
    const normal = [axis[1], -axis[0]], offset = p => p[0] * normal[0] + p[1] * normal[1]
    const faces = [offset(a.a), offset(b.a)], depth = Math.abs(faces[1] - faces[0])
    if (depth < 0.15 || depth > 0.8) continue
    const centreOffset = (faces[0] + faces[1]) / 2, distance = Math.abs(centreOffset - offset(point))
    if (distance >= bestDistance) continue
    const centre = point.map((v, i) => v + normal[i] * (centreOffset - offset(point)))
    const corners = [-1, 1].flatMap(u => [-1, 1].map(v => centre.map((p, i) => p + u * width / 2 * axis[i] + v * depth / 2 * normal[i])))
    fitted = { name, centre, axis, width, depth, corners }; bestDistance = distance
  }
  if (!fitted) throw Error(`Cannot fit both wall faces for marked ${name} door`)
  return fitted
}
const previous614 = { ...doors.find(door => door.name === '614') }
Object.assign(doors.find(door => door.name === '614'), fittedWallDoor('614', [37.25, -13.65], [0.08, 0.997]), { movedFrom: previous614.centre })
const innerDoorAxis = [-0.8034784644968402, 0.5953338198773859]
for (const [name, point, axis, width] of [
  ['615', [44.1467, -28.26], innerDoorAxis],
  ['616', [51.9867, -34.3733], innerDoorAxis],
  ['615 secondary', [42.0933, -22.94], [0.666, 0.746], 1.2],
  ['617', [9.1, -70.2133], [0.991, -0.137]],
]) doors.push({ ...fittedWallDoor(name, point, axis, width), added: true })
// The first four corner segments replace the old bent facade itself. Those
// old facade ends must not be restored as opaque partition returns behind glass.
const wallReturns = wallGlazingReturns(positions, normals, indices, [...glazingRuns, gardenGlassRun], new Set([...lowAtrium, ...columns]))
  .filter(joint => joint.run !== 1 || joint.segment === 5)
  .filter(joint => !glazingRuns.some(run => run.slice(1).some((b, k) => {
    const a = run[k], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const parallel = Math.abs(((b[0] - a[0]) * joint.axis[0] + (b[1] - a[1]) * joint.axis[1]) / length) > 0.999
    return !joint.continuation && parallel && distanceToSegment([joint.join[0], 0, joint.join[1]], a, b) < 0.3
  })))
const cuts = []
for (const run of [...glazingRuns, ...atriumEdges]) for (let s = 1; s < run.length; s++) {
  const a = run[s - 1], b = run[s], length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const atrium = atriumEdges.includes(run)
  cuts.push({ centre: [(a[0] + b[0]) / 2, atrium ? 2 : 2.525, (a[1] + b[1]) / 2], axis: [(b[0] - a[0]) / length, (b[1] - a[1]) / length], half: [length / 2 + (atrium ? 0.35 : 0.6), atrium ? 3.1 : 2.575, 0.9] })
}
// Only the three marked garden sides are replaced. The outside railing and
// all other room partitions retain their original opaque construction.
for (let s = 1; s < gardenGlassRun.length; s++) {
  const a = gardenGlassRun[s - 1], b = gardenGlassRun[s], length = Math.hypot(b[0] - a[0], b[1] - a[1])
  cuts.push({ centre: [(a[0] + b[0]) / 2, (gardenWallTop + 5.1) / 2, (a[1] + b[1]) / 2], axis: [(b[0] - a[0]) / length, (b[1] - a[1]) / length], half: [length / 2 + 0.12, (5.1 - gardenWallTop) / 2, 0.65] })
}
for (const door of doors) cuts.push({ centre: [door.centre[0], 1.755, door.centre[1]], axis: door.axis, half: [door.width / 2 - 0.025, 1.725, Math.max(0.5, door.depth)] })
cuts.push({ centre: [gardenEntry.centre[0], (gardenEntry.sill + gardenEntry.head) / 2, gardenEntry.centre[1]], axis: gardenEntry.axis, half: [gardenEntry.width / 2, (gardenEntry.head - gardenEntry.sill) / 2 + 0.005, 0.7] })
const outputPositions = [], outputNormals = [], outputUvs = []
const columnPositions = [], columnNormals = []
let removed = 0
for (let i = 0; i < indices.length; i += 3) {
  if (lowAtrium.has(i)) { removed++; continue }
  if (columns.has(i)) {
    for (const index of indices.slice(i, i + 3)) { columnPositions.push(...positions[index]); columnNormals.push(...normals[index]) }
    continue
  }
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
const columnMaterial = gltf.materials.length
gltf.materials.push({ name: 'Retained blue-grey corridor columns', pbrMetallicRoughness: { baseColorFactor: [0.22, 0.30, 0.36, 1], metallicFactor: 0, roughnessFactor: 0.8 } })
gltf.meshes[shell.mesh].primitives.push({ attributes: {
  POSITION: append(new Float32Array(columnPositions), 'VEC3', 5126, { min: gltf.accessors[wall.attributes.POSITION].min, max: gltf.accessors[wall.attributes.POSITION].max }),
  NORMAL: append(new Float32Array(columnNormals), 'VEC3', 5126),
}, material: columnMaterial })

// One graphite stone finish covers circulation and classroom floors.
const tile = { data: Buffer.alloc(128 * 128 * 4) }
for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
  const i = (y * 128 + x) * 4, grout = x < 2 || y < 2
  const grain = ((x * 17 + y * 31) % 7) - 3
  tile.data[i] = (grout ? 57 : 77) + grain
  tile.data[i + 1] = (grout ? 70 : 92) + grain
  tile.data[i + 2] = (grout ? 80 : 102) + grain
  tile.data[i + 3] = 255
}
// Write the small embedded RGBA PNG using Node's built-in zlib, so regenerating
// the asset does not depend on an undeclared image package.
function pngChunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data])
  let crc = 0xffffffff
  for (const byte of payload) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0)
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4)
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, payload, checksum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(128); ihdr.writeUInt32BE(128, 4); ihdr[8] = 8; ihdr[9] = 6
const scanlines = Buffer.alloc(128 * (1 + 128 * 4))
for (let y = 0; y < 128; y++) tile.data.copy(scanlines, y * 513 + 1, y * 512, (y + 1) * 512)
const textureBytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))])
const imageAccessor = append(textureBytes, 'SCALAR', 5121)
const image = gltf.images.length
gltf.images.push({ name: 'Modern graphite stone tile', bufferView: gltf.accessors[imageAccessor].bufferView, mimeType: 'image/png' })
const texture = gltf.textures.length
gltf.textures.push({ source: image, sampler: gltf.textures[0].sampler })

for (const material of gltf.materials) {
  const pbr = material.pbrMetallicRoughness
  if (material.name === 'Warm ivory walls') pbr.baseColorFactor = [0.22, 0.30, 0.36, 1]
  if (material.name === 'Dark warm grey terrazzo' || /warm stone$/.test(material.name)) {
    pbr.baseColorFactor = [1, 1, 1, 1]
    pbr.baseColorTexture = { index: texture }
    pbr.roughnessFactor = 0.85
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
const boxUv = append(geometry.attributes.uv.array, 'VEC2', 5126)
const index = append(geometry.index.array, 'SCALAR', 5123)
const sheet = new PlaneGeometry(1, 1)
const sheetPosition = append(sheet.attributes.position.array, 'VEC3', 5126, { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] })
const sheetNormal = append(sheet.attributes.normal.array, 'VEC3', 5126)
const sheetIndex = append(sheet.index.array, 'SCALAR', 5123)
function box(name, centre, scale, rotation, material) {
  const mesh = gltf.meshes.length
  gltf.meshes.push({ name, primitives: [{ attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: boxUv }, indices: index, material }] })
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
const geometryCache = new Map()
function sculpt(name, shape, centre, scale, rotation, material) {
  const key = `${shape.id}:${material}`
  let mesh = geometryCache.get(key)
  if (mesh === undefined) {
    shape.computeBoundingBox()
    const attributes = {
      POSITION: append(shape.attributes.position.array, 'VEC3', 5126, { min: shape.boundingBox.min.toArray(), max: shape.boundingBox.max.toArray() }),
      NORMAL: append(shape.attributes.normal.array, 'VEC3', 5126),
    }
    if (name.startsWith('Garden paving') || name === 'Garden raised ground') {
      const uv = []
      for (let i = 0; i < shape.attributes.position.count; i++) uv.push(shape.attributes.position.getX(i) / 2, shape.attributes.position.getZ(i) / 2)
      attributes.TEXCOORD_0 = append(new Float32Array(uv), 'VEC2', 5126)
    }
    const primitive = { attributes, material }
    if (shape.index) primitive.indices = append(shape.index.array, 'SCALAR', shape.index.array instanceof Uint32Array ? 5125 : 5123)
    mesh = gltf.meshes.length
    gltf.meshes.push({ name, primitives: [primitive] }); geometryCache.set(key, mesh)
  }
  const node = gltf.nodes.length
  gltf.nodes.push({ name, mesh, translation: centre, scale, rotation: [0, Math.sin(rotation / 2), 0, Math.cos(rotation / 2)] })
  gltf.scenes[gltf.scene ?? 0].nodes.push(node)
  return node
}
function gardenMaterial(name, color, roughness = 0.85) {
  const material = gltf.materials.length
  gltf.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: 0, roughnessFactor: roughness } })
  if (name === 'Garden graphite floor' || name === 'Garden inset paving') gltf.materials[material].pbrMetallicRoughness.baseColorTexture = { index: texture }
  return material
}
const doorAluminium = gardenMaterial('Satin aluminium door frames', [0.62, 0.70, 0.75], 0.3)
gltf.materials[doorAluminium].pbrMetallicRoughness.metallicFactor = 0.75
for (const joint of wallReturns) box(joint.name, joint.centre, joint.size, joint.angle, wall.material)
for (let s = 1; s < gardenGlassRun.length; s++) {
  const a = gardenGlassRun[s - 1], b = gardenGlassRun[s]
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx)
  const direction = [dx / length, dz / length], children = []
  const at = (u, y, v = 0) => [a[0] + u * direction[0] - v * direction[1], y, a[1] + u * direction[1] + v * direction[0]]
  const entry = s === gardenEntry.segment ? gardenEntry : null
  const intervals = glazingIntervals(length, entry ? [[entry.offset - entry.width / 2, entry.offset + entry.width / 2]] : [])
  const glassBottom = gardenWallTop + 0.025, glassTop = 4.975, glassCentre = (glassBottom + glassTop) / 2
  let panel = 0
  for (const [start, end] of intervals) {
    children.push(box(`Garden solid wall ${s}-${start}`, at((start + end) / 2, (1 + gardenWallTop) / 2), [end - start, gardenWallTop - 1, 0.45], angle, columnMaterial))
    const bays = Math.ceil((end - start) / 2.5)
    for (let n = 0; n < bays; n++) {
      const mid = start + (end - start) * (n + 0.5) / bays, lo = start + (end - start) * n / bays
      children.push(glassSheet(`Garden glass pane ${s}-${panel++}`, at(mid, glassCentre), (end - start) / bays - 0.035, glassTop - glassBottom, angle))
      children.push(box(`Garden glazing mullion ${s}-${start}-${n}`, at(lo, (gardenWallTop + 5) / 2), [0.045, 5 - gardenWallTop, 0.06], angle, aluminium))
    }
    children.push(box(`Garden glazing rail ${s}-bottom-${start}`, at((start + end) / 2, gardenWallTop + 0.015), [end - start, 0.045, 0.07], angle, aluminium))
  }
  children.push(box(`Garden glazing rail ${s}-top`, at(length / 2, 4.995), [length, 0.045, 0.07], angle, aluminium))
  if (entry) {
    const height = entry.head - entry.sill, y = (entry.head + entry.sill) / 2
    const width = entry.width - 0.1
    children.push(glassSheet('Garden main entry glass', at(entry.offset, y), width - 0.08, height - 0.09, angle))
    for (const side of [-1, 1]) children.push(box(`Garden main entry jamb ${side}`, at(entry.offset + side * (entry.width / 2 - 0.025), (entry.sill + 5) / 2), [0.05, 5 - entry.sill, 0.07], angle, doorAluminium))
    children.push(box('Garden main entry head', at(entry.offset, entry.head), [entry.width, 0.05, 0.07], angle, doorAluminium))
    for (const side of [-1, 0, 1]) children.push(box(`Garden main entry stile ${side}`, at(entry.offset + side * width / 2, y), [0.045, height - 0.05, 0.04], angle, doorAluminium))
    for (const railY of [entry.sill + 0.025, entry.sill + 1.1, entry.head - 0.025]) children.push(box(`Garden main entry rail ${railY}`, at(entry.offset, railY), [width, 0.035, 0.04], angle, doorAluminium))
    for (const side of [-1, 1]) children.push(box(`Garden main entry handle ${side}`, at(entry.offset + side * 0.11, entry.sill + 1.4, 0.055), [0.12, 0.035, 0.035], angle, doorAluminium))
    children.push(glassSheet('Garden main entry transom', at(entry.offset, (entry.head + glassTop) / 2), entry.width - 0.06, glassTop - entry.head - 0.05, angle))
  }
  const scene = gltf.scenes[gltf.scene ?? 0], group = gltf.nodes.length
  gltf.nodes.push({ name: `Garden glazing ${s}`, children })
  scene.nodes = scene.nodes.filter(i => !children.includes(i)); scene.nodes.push(group)
}
const garden = buildCampusGarden({ box, sculpt, material: gardenMaterial })
const lamp = gltf.materials.length
gltf.materials.push({ name: 'Warm white lamp diffuser', emissiveFactor: [1, 0.78, 0.48], pbrMetallicRoughness: { baseColorFactor: [1, 0.92, 0.78, 1], metallicFactor: 0, roughnessFactor: 0.4 } })
function floorTriangles(primitive, upwardOnly = true) {
  const points = readAccessor(primitive.attributes.POSITION)
  const normal = readAccessor(primitive.attributes.NORMAL)
  const indices = primitive.indices === undefined ? points.map((_, i) => i) : readAccessor(primitive.indices).flat()
  const triangles = []
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3)
    if (triangle.every(j => Math.abs(points[j][1]) < 0.08 && (!upwardOnly || normal[j][1] > 0.9))) triangles.push(triangle.map(j => [points[j][0], points[j][2]]))
  }
  return triangles
}
const furnishedRooms = new Set(gltf.nodes.flatMap(n => n.name.match(/^(\d{3}) (?:desk|chair) /)?.slice(1) ?? []))
const roomFloors = gltf.nodes.filter(n => /^\d{3} floor finish$/.test(n.name)).map(n => ({ name: n.name,
  furnished: furnishedRooms.has(n.name.slice(0, 3)), triangles: floorTriangles(gltf.meshes[n.mesh].primitives[0], false) }))
const corridorFloor = gltf.meshes[shell.mesh].primitives.find(p => gltf.materials[p.material].name === 'Dark warm grey terrazzo')
// Slice above furniture and the removed low atrium rings, retaining tall walls and columns.
const lampWalls = []
for (let i = 0; i < indices.length; i += 3) {
  const triangle = indices.slice(i, i + 3).map(j => positions[j]), hits = []
  for (let j = 0; j < 3; j++) {
    const a = triangle[j], b = triangle[(j + 1) % 3]
    if ((a[1] < 2.7) !== (b[1] < 2.7)) {
      const t = (2.7 - a[1]) / (b[1] - a[1])
      hits.push([a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t])
    }
  }
  if (hits.length === 2) lampWalls.push({ a: hits[0], b: hits[1] })
}
const atrium = [[29.39, -67.68], [35.29, -72.37], [51.25, -65.35], [53.58, -40.25], [36.2, -26.52], [34.05, -26.16]]
const corridorFloors = floorTriangles(corridorFloor)
// The shell floor also covers empty rooms. Close the prepared door planes for
// the lighting mask so only the connected public corridor receives fixtures.
const closedDoorEdges = doors.map(door => ({
  a: door.centre.map((v, i) => v - door.axis[i] * (door.width / 2 + 0.2)),
  b: door.centre.map((v, i) => v + door.axis[i] * (door.width / 2 + 0.2)),
}))
const corridorContains = buildCorridorMask({ triangles: corridorFloors, walls: lampWalls, closedDoorEdges, atrium, seed: [33, -75.75] })
function offsetLampRun(id, [a, b], offset) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const normal = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length]
  return { id, a: a.map((v, i) => v + normal[i] * offset), b: b.map((v, i) => v + normal[i] * offset) }
}
const gardenSouthDoor = doors.find(door => door.name === 'Empty room 08')
if (!gardenSouthDoor) throw Error('Missing prepared south garden door for the ceiling lamp row')
// Fixed architectural lanes keep whole rows parallel to the corridor. Wider
// outer lanes clear the column rows; short corners do not need their own lamp.
const corridorRuns = [
  offsetLampRun('atrium-north-west', atriumEdges[0], 6),
  offsetLampRun('atrium-north', atriumEdges[1], 2.25),
  offsetLampRun('atrium-east', atriumEdges[2], 5.5),
  // This narrow leg follows the 615/616 wall plane, slightly off the atrium edge.
  { id: 'atrium-south', a: [55.02108089441106, -38.556166744775744], b: [37.344554675480566, -25.458822707473256] },
  offsetLampRun('atrium-west', atriumEdges[5], 4),
  offsetLampRun('garden-north', gardenGlassRun.slice(0, 2), 1.5),
  offsetLampRun('garden-south', [-4, 22].map(distance => gardenSouthDoor.centre.map((v, i) => v + distance * gardenSouthDoor.axis[i])), 1.75),
  offsetLampRun('outer-south', atriumEdges[3], 12),
  { id: 'north-spine', a: [23, -87], b: [24.974, -71.124] },
  { id: 'south-connector', a: [30.894, -23.789], b: [39.392, -19.54] },
]
const lighting = buildLampLayout({ rooms: roomFloors, corridorFloors, walls: lampWalls, atrium, corridorContains, corridorRuns })
box('614 former doorway infill', [previous614.centre[0], 1.74, previous614.centre[1]],
  [previous614.width + 0.03, 3.48, previous614.depth + 0.025], -Math.atan2(previous614.axis[1], previous614.axis[0]), wall.material)
// The cutaway shell's upper wall plane is the ceiling datum. Mount the
// housing flush underneath it and retain the diffuser below the housing.
const ceilingY = positions.reduce((top, point) => Math.max(top, point[1]), -Infinity)
for (const [i, { point: [x, z], angle, zone, row }] of lighting.entries()) {
  box(`Campus lamp ${i + 1} housing`, [x, ceilingY - 0.06, z], [1.8, 0.12, 0.28], angle, aluminium)
  const diffuser = box(`Campus lamp ${i + 1} diffuser`, [x, ceilingY - 0.128, z], [1.65, 0.025, 0.22], angle, lamp)
  gltf.nodes[diffuser].extras = { lightingZone: zone, lightingRow: row }
}
for (const door of doors) {
  const angle = -Math.atan2(door.axis[1], door.axis[0])
  const at = (u, y, v = 0) => [door.centre[0] + u * door.axis[0] - v * door.axis[1], y, door.centre[1] + u * door.axis[1] + v * door.axis[0]]
  const width = door.width - 0.1
  glassSheet(`${door.name} clear upper glass`, at(0, 1.755), width - 0.08, 3.32, angle)
  for (const side of [-1, 1]) box(`${door.name} outer aluminium jamb ${side}`, at(side * (door.width / 2 - 0.025), 1.755), [0.05, 3.44, 0.065], angle, doorAluminium)
  box(`${door.name} outer aluminium head`, at(0, 3.46), [door.width - 0.02, 0.05, 0.065], angle, doorAluminium)
  for (const side of [-1, 0, 1]) box(`${door.name} door leaf stile ${side}`, at(side * width / 2, 1.755), [0.045, 3.36, 0.04], angle, doorAluminium)
  for (const y of [0.075, 1.18, 3.435]) box(`${door.name} door leaf rail ${y}`, at(0, y), [width, 0.035, 0.04], angle, doorAluminium)
  for (const side of [-1, 1]) box(`${door.name} lever handle ${side}`, at(side * 0.11, 1.5, 0.055), [0.12, 0.035, 0.035], angle, doorAluminium)
}
for (const [r, run] of glazingRuns.entries()) {
  for (let s = 1; s < run.length; s++) {
    const a = run[s - 1], b = run[s]
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), angle = -Math.atan2(dz, dx)
    const centre = [(a[0] + b[0]) / 2, 1.9, (a[1] + b[1]) / 2]
    const bottom = 0.15, top = r === 1 ? 4.975 : 3.65, paneY = (bottom + top) / 2
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
        children.push(glassSheet(`Modern glass pane ${r}-${s}-${panel++}`, [a[0] + mid * direction[0], paneY, a[1] + mid * direction[1]], hi - lo - 0.015, top - bottom, angle))
        if (n > 0) children.push(box(`Modern glazing mullion ${r}-${s}-${n}-${start}`, [a[0] + lo * direction[0], paneY, a[1] + lo * direction[1]], [0.04, top - bottom + 0.1, 0.06], angle, aluminium))
      }
    }
    if (r === 1) for (const door of doors.filter(d => distanceToSegment([d.centre[0], 0, d.centre[1]], a, b) < 0.05)) children.push(glassSheet(`Corner door transom ${door.name}`, [door.centre[0], (3.5 + top) / 2, door.centre[1]], door.width - 0.05, top - 3.5, angle))
    box(`Modern glazing rail ${r}-${s}-top`, [centre[0], top + 0.03, centre[2]], [length, 0.07, 0.1], angle, aluminium)
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
gltf.asset.extras = { ...(gltf.asset.extras ?? {}), campusStyle: 'modern-glass-v2', appearance: 'blue-grey-garden-v5', gardenGlassRun, gardenWallTop, garden, lighting, ceilingY, lampRows: corridorRuns, wallReturns, columnBounds, removedAtriumTriangles: lowAtrium.size, retainedColumnTriangles: columns.size, atriumEdges, glazingRuns, replacedWallTriangles: removed, alignedDoors: doors.length, doorOpenings: doors }
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
