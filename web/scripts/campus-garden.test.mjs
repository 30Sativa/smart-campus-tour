import { readFileSync } from 'node:fs'
import { Box3, Matrix4, Quaternion, Triangle, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { gardenEntry, gardenFrame, gardenGlassRun, gardenPaths, gardenPoint, gardenSeats, gardenWallTop, pathDistance } from './campus-garden.mjs'

const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
const jsonSize = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonSize)), bin = bytes.subarray(28 + jsonSize)
const visible = []
function visit(i) { visible.push(gltf.nodes[i]); gltf.nodes[i].children?.forEach(visit) }
gltf.scenes[gltf.scene ?? 0].nodes.forEach(visit)
function wallTriangles(json, buffer, material = 'Warm ivory walls', region = () => true) {
  const shell = json.nodes.find(n => n.name === 'Original architectural shell')
  const wall = json.meshes[shell.mesh].primitives.find(p => json.materials[p.material].name === material)
  const accessor = json.accessors[wall.attributes.POSITION], view = json.bufferViews[accessor.bufferView]
  const vertex = i => {
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? 12)
    return [buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8)]
  }
  let indices = Array.from({ length: accessor.count }, (_, i) => i)
  if (wall.indices !== undefined) {
    const index = json.accessors[wall.indices], indexView = json.bufferViews[index.bufferView], size = index.componentType === 5123 ? 2 : 4
    indices = Array.from({ length: index.count }, (_, i) => buffer[size === 2 ? 'readUInt16LE' : 'readUInt32LE']((indexView.byteOffset ?? 0) + (index.byteOffset ?? 0) + i * size))
  }
  const triangles = []
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertex(indices[i]), b = vertex(indices[i + 1]), c = vertex(indices[i + 2])
    const centre = { x: (a[0] + b[0] + c[0]) / 3, y: (a[1] + b[1] + c[1]) / 3, z: (a[2] + b[2] + c[2]) / 3 }
    if (region(centre)) triangles.push(new Triangle(new Vector3(...a), new Vector3(...b), new Vector3(...c)))
  }
  return triangles
}

describe('NVH sixth-floor rooftop garden', () => {
  it('replaces only the three annotated edges, leaving the fourth outside railing intact', () => {
    expect(gltf.asset.extras.gardenGlassRun).toEqual(gardenGlassRun)
    expect(visible.filter(n => /^Garden glazing \d$/.test(n.name))).toHaveLength(3)
    const panels = visible.filter(n => /^Garden glass pane /.test(n.name))
    expect(panels.length).toBeGreaterThan(30)
    const covered = new Map()
    for (const panel of panels) {
      const segment = Number(panel.name.split(' ').at(-1).split('-')[0])
      const a = gardenGlassRun[segment - 1], b = gardenGlassRun[segment]
      expect(pathDistance([panel.translation[0], panel.translation[2]], { a, b })).toBeLessThan(1e-6)
      expect(panel.translation[1] - panel.scale[1] / 2).toBeGreaterThan(gardenWallTop)
      const material = gltf.materials[gltf.meshes[panel.mesh].primitives[0].material]
      expect(material.alphaMode).toBe('BLEND')
      covered.set(segment, (covered.get(segment) ?? 0) + panel.scale[0] + 0.035)
    }
    for (let s = 1; s < gardenGlassRun.length; s++) expect(covered.get(s) + (s === gardenEntry.segment ? gardenEntry.width : 0)).toBeCloseTo(Math.hypot(gardenGlassRun[s][0] - gardenGlassRun[s - 1][0], gardenGlassRun[s][1] - gardenGlassRun[s - 1][1]), 6)
    const solidWalls = visible.filter(n => /^Garden solid wall /.test(n.name))
    expect(solidWalls).toHaveLength(4)
    for (const wall of solidWalls) {
      expect(wall.translation[1] + wall.scale[1] / 2).toBeCloseTo(gardenWallTop, 10)
      expect(wall.scale[2]).toBe(0.45)
      expect(gltf.materials[gltf.meshes[wall.mesh].primitives[0].material].alphaMode ?? 'OPAQUE').toBe('OPAQUE')
    }
    const sourceBytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3.glb')
    const source = JSON.parse(sourceBytes.toString('utf8', 20, 20 + sourceBytes.readUInt32LE(12)))
    // The outside railing is embedded in the original shell, rather than a
    // separate named node. Its mid-edge surface must remain opaque and present.
    const outside = { a: gardenGlassRun[0], b: gardenGlassRun.at(-1) }
    const key = triangle => [triangle.a, triangle.b, triangle.c].map(p => p.toArray().map(v => v.toFixed(4)).join(',')).sort().join(';')
    const preserved = wallTriangles(gltf, bin, 'Warm ivory walls', p => p.z > -66 && p.z < -28 && pathDistance([p.x, p.z], outside) < 1)
      .map(triangle => ({ triangle, bounds: new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]) }))
    const exactSurfaces = new Set(preserved.map(({ triangle }) => key(triangle)))
    const samples = wallTriangles(source, sourceBytes.subarray(28 + sourceBytes.readUInt32LE(12)), 'Warm ivory walls', p => p.y > 0 && p.z > -60 && p.z < -34 && pathDistance([p.x, p.z], outside) < 0.7)
    expect(samples.length).toBeGreaterThan(0)
    const closest = new Vector3()
    const missing = samples.filter(sample => {
      if (exactSurfaces.has(key(sample))) return false
      const point = sample.getMidpoint(new Vector3())
      return !preserved.some(({ triangle, bounds }) => bounds.distanceToPoint(point) < 0.001 && triangle.closestPointToPoint(point, closest).distanceTo(point) < 0.001)
    })
    expect(missing).toHaveLength(0)
  })

  it('traces the angular paving plan and keeps seating and steel posts clear of the main walkway', () => {
    expect(visible.filter(n => /^Garden bench (triangle|rectangle)/.test(n.name))).toHaveLength(3)
    expect(visible.filter(n => /^Garden pergola post /.test(n.name))).toHaveLength(12)
    expect(visible.filter(n => /^Garden pergola lintel /.test(n.name))).toHaveLength(6)
    const islands = visible.filter(n => /^Garden paving island /.test(n.name))
    expect(islands).toHaveLength(4)
    for (const seat of gardenSeats) for (const point of seat.polygon) for (const path of gardenPaths) expect(pathDistance(point, path)).toBeGreaterThan(path.width / 2 + 0.3)
    // The entrance lane is cut out of the traced paving rather than crossing
    // a raised island. Check the actual exported horizontal surface geometry.
    for (const island of islands) {
      const primitive = gltf.meshes[island.mesh].primitives[0], accessor = gltf.accessors[primitive.attributes.POSITION], view = gltf.bufferViews[accessor.bufferView]
      const vertex = i => new Vector3(...[0, 1, 2].map(k => bin.readFloatLE((view.byteOffset ?? 0) + i * 12 + k * 4)))
      for (let i = 0; i < accessor.count; i += 3) {
        const triangle = new Triangle(vertex(i), vertex(i + 1), vertex(i + 2))
        const centre = triangle.getMidpoint(new Vector3())
        if (triangle.getNormal(new Vector3()).y > 0.9) for (const path of gardenPaths) expect(pathDistance([centre.x, centre.z], path)).toBeGreaterThanOrEqual(path.width / 2 - 1e-5)
      }
    }
    for (const portal of gltf.asset.extras.garden.portals) {
      expect(portal.span / 2 - 0.085).toBeCloseTo(gardenPaths[portal.path].width / 2, 6)
      expect(pathDistance(portal.centre, gardenPaths[0])).toBeLessThan(1e-6)
    }
    const floor = visible.find(n => n.name === 'Garden stone base')
    const centre = gardenPoint(gardenFrame.width / 2, 0, gardenFrame.depth / 2)
    const slabHeights = wallTriangles(gltf, bin, 'Dark warm grey terrazzo').filter(t => Math.abs(t.a.y - t.b.y) < 1e-5 && Math.abs(t.a.y - t.c.y) < 1e-5 && new Triangle(...[t.a, t.b, t.c].map(p => new Vector3(p.x, 0, p.z))).containsPoint(new Vector3(centre[0], 0, centre[2]))).map(t => t.a.y)
    expect(Math.max(...slabHeights)).toBe(gardenFrame.floorY)
    expect(floor.translation[1] - floor.scale[1] / 2).toBeGreaterThan(Math.max(...slabHeights))
    for (const island of islands) expect(island.translation[1]).toBeGreaterThan(floor.translation[1] + floor.scale[1] / 2)
    const raised = visible.find(n => n.name === 'Garden raised ground')
    expect(raised.translation[1] + 0.04 - floor.translation[1] - floor.scale[1] / 2).toBeCloseTo(0.04, 6)
    const roomFloor = gltf.materials.find(m => m.name === 'Dark warm grey terrazzo').pbrMetallicRoughness
    for (const name of ['Garden graphite floor', 'Garden inset paving']) {
      const surface = gltf.materials.find(m => m.name === name).pbrMetallicRoughness
      expect(surface.baseColorFactor).toEqual(roomFloor.baseColorFactor)
      expect(surface.baseColorTexture).toEqual(roomFloor.baseColorTexture)
    }
    expect(gardenPaths.every(path => path.width === 2)).toBe(true)
    for (const node of [floor, raised, ...islands]) {
      const primitive = gltf.meshes[node.mesh].primitives[0], uv = gltf.accessors[primitive.attributes.TEXCOORD_0]
      expect(uv.count).toBe(gltf.accessors[primitive.attributes.POSITION].count)
      expect(uv.count * 8).toBeLessThanOrEqual(gltf.bufferViews[uv.bufferView].byteLength)
    }
    expect(visible.some(n => /^Garden (tree|shrub|flower|lawn|bed)/.test(n.name))).toBe(false)
    expect(gltf.materials.some(m => /^Garden .*?(soil|foliage|lawn|flowers|bark)/.test(m.name))).toBe(false)
  })

  it('fits every garden decoration inside the surveyed garden footprint', () => {
    const inverse = new Matrix4().makeRotationY(gardenFrame.angle).setPosition(...gardenPoint(0, 0, 0)).invert()
    const decorations = visible.filter(n => /^Garden /.test(n.name) && !/^Garden (gla|solid wall|main entry)/.test(n.name))
    expect(decorations.length).toBeGreaterThan(40)
    for (const node of decorations) {
      const primitive = gltf.meshes[node.mesh].primitives[0], accessor = gltf.accessors[primitive.attributes.POSITION]
      const world = new Matrix4().compose(new Vector3(...node.translation), new Quaternion(...node.rotation), new Vector3(...node.scale))
      const bounds = new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(inverse.clone().multiply(world))
      expect(bounds.min.x, node.name).toBeGreaterThan(0.45)
      expect(bounds.max.x, node.name).toBeLessThan(gardenFrame.width - 0.45)
      expect(bounds.min.z, node.name).toBeGreaterThan(0.45)
      expect(bounds.max.z, node.name).toBeLessThan(gardenFrame.depth - 0.45)
      expect(bounds.max.y, node.name).toBeLessThan(5)
    }
  })

  it('puts the main aluminium glass entrance on the marked atrial edge and connects its walkway', () => {
    const pane = visible.find(n => n.name === 'Garden main entry glass')
    expect(pane.translation[0]).toBeCloseTo(gardenEntry.centre[0])
    expect(pane.translation[2]).toBeCloseTo(gardenEntry.centre[1])
    expect(pane.translation[1] - pane.scale[1] / 2).toBeCloseTo(gardenEntry.sill + 0.045)
    expect(visible.filter(n => /^Garden main entry handle /.test(n.name))).toHaveLength(2)
    expect(visible.some(n => n.name === 'Garden main entry stile 0')).toBe(true)
    expect(visible.some(n => n.name === 'Garden main entry transom')).toBe(true)
    for (const node of visible.filter(n => /^Garden main entry (jamb|stile|head|rail|handle)/.test(n.name))) expect(gltf.materials[gltf.meshes[node.mesh].primitives[0].material].name).toBe('Satin aluminium door frames')
    for (const wall of visible.filter(n => /^Garden solid wall 2-/.test(n.name))) {
      const offset = (wall.translation[0] - gardenGlassRun[1][0]) * gardenEntry.axis[0] + (wall.translation[2] - gardenGlassRun[1][1]) * gardenEntry.axis[1]
      expect(Math.abs(offset - gardenEntry.offset) - wall.scale[0] / 2).toBeGreaterThanOrEqual(gardenEntry.width / 2 - 1e-6)
    }
    expect(gardenPaths[1].b).toEqual(gardenEntry.local)
    expect(gardenPaths[1].a).toEqual(gardenPaths[0].a)
    const threshold = visible.find(n => n.name === 'Garden main entry threshold')
    expect(threshold.translation[1] + threshold.scale[1] / 2).toBeCloseTo(gardenEntry.sill, 2)
    // In the whole-floor reference, drawing top faces the atrium. Both
    // triangles are on the left; the rectangle is at the outside right.
    expect(Math.max(...gardenSeats[0].polygon.map(p => p[0]))).toBeGreaterThan(20)
    expect(Math.max(...gardenSeats[1].polygon.map(p => p[0]))).toBeLessThan(7)
    expect(Math.min(...gardenSeats[2].polygon.map(p => p[1]))).toBeGreaterThan(25)
    expect(Math.max(...gardenSeats[2].polygon.map(p => p[0]))).toBeLessThan(10)
  })

  it('preserves opaque unmarked walls outside the garden', () => {
    const shell = visible.find(n => n.name === 'Original architectural shell')
    const walls = gltf.meshes[shell.mesh].primitives.find(p => gltf.materials[p.material].name === 'Warm ivory walls')
    const position = gltf.accessors[walls.attributes.POSITION], view = gltf.bufferViews[position.bufferView]
    let unmarkedVertices = 0
    for (let i = 0; i < position.count; i++) {
      const offset = (view.byteOffset ?? 0) + i * 12
      if (bin.readFloatLE(offset) > 35 && bin.readFloatLE(offset + 4) > 2 && bin.readFloatLE(offset + 8) < -85) unmarkedVertices++
    }
    // The untouched far classroom perimeter contributes these 24 triangles.
    expect(unmarkedVertices).toBe(72)
    expect(gltf.materials[walls.material].alphaMode ?? 'OPAQUE').toBe('OPAQUE')
  })
})
