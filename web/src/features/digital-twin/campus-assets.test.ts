import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3, BoxGeometry, Group, Mesh } from 'three'
import { prepareCampusModel } from './campus-model'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'

describe('simulator map assets', () => {
  it('ships modern glazing while keeping the atrium open and retaining room furniture', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    expect(bytes.readUInt32LE(8)).toBe(bytes.length)
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    const visible: { name: string; children?: number[] }[] = []
    const visit = (i: number) => {
      const node = json.nodes[i]
      visible.push(node)
      node.children?.forEach(visit)
    }
    json.scenes[json.scene ?? 0].nodes.forEach(visit)
    expect(visible.filter((n: { name: string }) => /^Atrium V2 /.test(n.name)).every((n: { name: string }) => /^Atrium V2 glass panel /.test(n.name))).toBe(true)
    expect(visible.filter((n: { name: string }) => /^Atrium V2 glass panel /.test(n.name))).toHaveLength(59)
    expect(visible.filter((n: { name: string }) => /^Modern glazing \d-\d$/.test(n.name))).toHaveLength(6)
    expect(visible.some((n: { name: string }) => n.name === '601 floor finish')).toBe(true)
    expect(visible.some((n: { name: string }) => n.name === 'Original architectural shell')).toBe(true)
    expect(json.asset.extras.replacedWallTriangles).toBeGreaterThan(0)
    expect(json.asset.extras.alignedDoors).toBe(18)
    expect(json.asset.extras.campusStyle).toBe('modern-glass-v2')
    expect(json.asset.extras.doorOpenings).toHaveLength(18)
    expect(visible.some(n => /^Source .* (clear upper glass|outer aluminium head)$/.test(n.name))).toBe(false)
    const run = json.asset.extras.glazingRuns[0]
    const start = run[2], end = run[3], length = Math.hypot(end[0] - start[0], end[1] - start[1])
    for (const name of ['606', '607', '608']) {
      const opening = json.asset.extras.doorOpenings.find((d: { name: string }) => d.name === name)
      const distance = Math.abs((opening.centre[0] - start[0]) * (end[1] - start[1]) - (opening.centre[1] - start[1]) * (end[0] - start[0])) / length
      expect(distance).toBeLessThan(0.02)
    }
    for (const head of visible.filter(n => / outer aluminium head$/.test(n.name))) {
      const prefix = head.name.replace(' outer aluminium head', '')
      const door = json.nodes.find((n: { name: string }) => n.name === `${prefix} clear upper glass`)
      const frame = json.nodes.find((n: { name: string }) => n.name === head.name)
      expect(door.translation[0]).toBeCloseTo(frame.translation[0])
      expect(door.translation[2]).toBeCloseTo(frame.translation[2])
      expect(door.rotation).toEqual(frame.rotation)
      const opening = json.asset.extras.doorOpenings.find((d: { name: string }) => d.name === prefix)
      expect(door.translation[0]).toBeCloseTo(opening.centre[0])
      expect(door.translation[2]).toBeCloseTo(opening.centre[1])
      expect(door.scale[0]).toBeLessThan(opening.width)
      const angle = 2 * Math.atan2(door.rotation[1], door.rotation[3])
      expect(Math.cos(angle)).toBeCloseTo(opening.axis[0])
      expect(-Math.sin(angle)).toBeCloseTo(opening.axis[1])
      const pane = json.meshes[door.mesh].primitives[0]
      expect(json.accessors[pane.attributes.POSITION].min[2]).toBe(0)
      expect(json.accessors[pane.attributes.POSITION].max[2]).toBe(0)
    }
    const glass = json.materials.find((m: { name: string }) => m.name === 'Modern pale aqua architectural glass')
    expect(glass.alphaMode).toBe('BLEND')
    expect(glass.pbrMetallicRoughness.baseColorFactor[3]).toBeLessThan(0.4)
    for (const node of visible.filter(n => /^Modern glass pane /.test(n.name))) {
      const mesh = json.meshes[json.nodes.find((n: { name: string }) => n.name === node.name).mesh]
      const bounds = json.accessors[mesh.primitives[0].attributes.POSITION]
      expect(bounds.min[2]).toBe(bounds.max[2])
    }
    for (const image of json.images) expect(image.uri).toBeUndefined()
  })
  it('ships a self-contained GLB with embedded textures and geometry', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3.glb')
    expect(bytes.toString('ascii', 0, 4)).toBe('glTF')
    expect(bytes.readUInt32LE(4)).toBe(2)
    expect(bytes.readUInt32LE(8)).toBe(bytes.length)
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    expect(json.asset.version).toBe('2.0')
    expect(json.meshes.length).toBeGreaterThan(0)
    expect(json.scenes[json.scene ?? 0].nodes.length).toBeGreaterThan(0)
    for (const buffer of json.buffers) expect(buffer.uri).toBeUndefined()
    for (const image of json.images) {
      expect(image.uri).toBeUndefined()
      expect(json.bufferViews[image.bufferView].byteLength).toBeGreaterThan(0)
    }
  })
  it('fits imported root transforms into a centered 20-unit scene without modifying the source', () => {
    const object = new Group()
    object.add(new Mesh(new BoxGeometry(40, 8, 20)))
    object.position.set(10, 20, -15)
    object.scale.setScalar(2)
    const model = prepareCampusModel(object)
    const bounds = new Box3().setFromObject(model)
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(20)
    expect(bounds.min.x + bounds.max.x).toBeCloseTo(0)
    expect(bounds.min.z + bounds.max.z).toBeCloseTo(0)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(object.position.toArray()).toEqual([10, 20, -15])
    expect(object.scale.toArray()).toEqual([2, 2, 2])
    expect(() => prepareCampusModel(new Group())).toThrow(/bounds/)
  })
  it('loads the shipped OBJ with every referenced material and finite geometry', () => {
    const obj = readFileSync('public/models/simulator-map/map.obj', 'utf8')
    const mtl = readFileSync('public/models/simulator-map/map.mtl', 'utf8')
    const materials = new MTLLoader().parse(mtl, '')
    const usedMaterials = [...obj.matchAll(/^usemtl (.+)$/gm)].map((match) => match[1].trim())
    expect(usedMaterials.length).toBeGreaterThan(0)
    for (const name of usedMaterials) expect(Object.keys(materials.materialsInfo)).toContain(name)
    const model = new OBJLoader().setMaterials(materials).parse(obj)
    const bounds = new Box3().setFromObject(model)
    expect(bounds.isEmpty()).toBe(false)
    expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true)
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(0)
    // This asset is self-contained; missing texture files must not silently ship.
    expect(mtl).not.toMatch(/^\s*(map_\w+|bump|disp|decal)\s/im)
  })
})
