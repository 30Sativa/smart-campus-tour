import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
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
    expect(visible.filter((n: { name: string }) => /^Modern glazing \d-\d$/.test(n.name))).toHaveLength(8)
    expect(visible.some((n: { name: string }) => n.name === '601 floor finish')).toBe(true)
    expect(visible.some((n: { name: string }) => n.name === 'Original architectural shell')).toBe(true)
    expect(json.asset.extras.replacedWallTriangles).toBeGreaterThan(0)
    expect(json.asset.extras.alignedDoors).toBe(22)
    expect(json.asset.extras.campusStyle).toBe('modern-glass-v2')
    expect(json.asset.extras.doorOpenings).toHaveLength(22)
    expect(json.asset.extras.doorOpenings.filter((d: { added?: boolean }) => d.added).map((d: { name: string }) => d.name)).toEqual(['615', '616', '615 secondary', '617'])
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
  it('uses full glass aluminium double leaves in all prepared and added door openings', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    const visible: { name: string; mesh?: number; translation?: number[] }[] = []
    const visit = (i: number) => { visible.push(json.nodes[i]); json.nodes[i].children?.forEach(visit) }
    json.scenes[json.scene ?? 0].nodes.forEach(visit)
    expect(visible.filter(n => / door leaf stile 0$/.test(n.name))).toHaveLength(22)
    expect(visible.filter(n => / lever handle [-1]+$/.test(n.name))).toHaveLength(44)
    expect(visible.some(n => /solid lower aluminium infill/.test(n.name))).toBe(false)
    for (const node of visible.filter(n => / (outer aluminium|door leaf)/.test(n.name))) {
      expect(json.materials[json.meshes[node.mesh!].primitives[0].material].name).toBe('Satin aluminium door frames')
    }
  })
  it('removes the low atrium rings, retains tall columns and lights all room floors', () => {
    const bytes = readFileSync('public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb')
    const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8', 20, 20 + size)), bin = bytes.subarray(28 + size)
    const shell = json.nodes.find((n: { name: string }) => n.name === 'Original architectural shell')
    const wall = json.meshes[shell.mesh].primitives.find((p: { material: number }) => json.materials[p.material].name === 'Warm ivory walls')
    const accessor = json.accessors[wall.attributes.POSITION], view = json.bufferViews[accessor.bufferView]
    for (let i = 0; i < accessor.count; i++) {
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * 12
      const x = bin.readFloatLE(offset), y = bin.readFloatLE(offset + 4), z = bin.readFloatLE(offset + 8)
      expect(Math.abs(y - 1.5) < 1e-5 && x > 28 && x < 55 && z > -74 && z < -24).toBe(false)
    }
    expect(json.asset.extras.removedAtriumTriangles).toBe(260)
    const columns = json.meshes[shell.mesh].primitives.find((p: { material: number }) => json.materials[p.material].name === 'Retained blue-grey corridor columns')
    expect(json.accessors[columns.attributes.POSITION].count).toBe(json.asset.extras.retainedColumnTriangles * 3)
    expect(json.asset.extras.retainedColumnTriangles).toBeGreaterThan(700)
    expect(json.materials[columns.material].pbrMetallicRoughness.baseColorFactor).toEqual(json.materials[wall.material].pbrMetallicRoughness.baseColorFactor)
    // No global thin-wall conversion: only separately authored glazing runs.
    expect(json.meshes[shell.mesh].primitives.some((p: { material: number }) => json.materials[p.material].alphaMode === 'BLEND')).toBe(false)
    const corner = { x: 27.018651962280273, z: -80.57843780517578 }
    const run = json.asset.extras.glazingRuns[1]
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i], dx = b[0] - a[0], dz = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((corner.x - a[0]) * dx + (corner.z - a[1]) * dz) / (dx * dx + dz * dz)))
      expect(Math.hypot(corner.x - a[0] - t * dx, corner.z - a[1] - t * dz)).toBeGreaterThan(0.7)
    }
    const floorMaterials = json.materials.filter((m: { name: string }) => /warm stone$/.test(m.name) || m.name === 'Dark warm grey terrazzo')
    expect(floorMaterials).toHaveLength(18)
    expect(new Set(floorMaterials.map((m: { pbrMetallicRoughness: { baseColorTexture: { index: number } } }) => m.pbrMetallicRoughness.baseColorTexture.index)).size).toBe(1)
    const sceneNames = json.scenes[json.scene ?? 0].nodes.map((i: number) => json.nodes[i].name)
    const lamps = json.nodes.filter((n: { name: string }) => /^Campus lamp \d+ diffuser$/.test(n.name))
    const roomLamps = lamps.filter((n: { extras: { lightingZone: string } }) => n.extras.lightingZone.startsWith('room:'))
    expect(roomLamps).toHaveLength(34)
    for (const room of json.nodes.filter((n: { name: string }) => /^\d{3} floor finish$/.test(n.name))) {
      expect(roomLamps.filter((n: { extras: { lightingZone: string } }) => n.extras.lightingZone === `room:${room.name}`)).toHaveLength(2)
    }
    expect(lamps.length - roomLamps.length).toBeLessThanOrEqual(29)
    expect(sceneNames.filter((name: string) => /^Campus lamp \d+ diffuser$/.test(name))).toHaveLength(json.asset.extras.lighting.length)
    for (const fixture of json.asset.extras.lighting) {
      expect(lamps.some((n: { translation: number[]; extras: { lightingZone: string } }) =>
        n.translation[0] === fixture.point[0] && n.translation[2] === fixture.point[1] && n.extras.lightingZone === fixture.zone)).toBe(true)
    }
    const light = json.materials.find((m: { name: string }) => m.name === 'Warm white lamp diffuser')
    expect(light.emissiveFactor[0]).toBeGreaterThan(0)
    expect(sceneNames.some((name: string) => /top glow$/.test(name))).toBe(false)
    const color = json.materials[wall.material].pbrMetallicRoughness.baseColorFactor
    expect(color[2]).toBeGreaterThan(color[0])
    expect(color[0]).toBeLessThan(0.3)
  })
  it('casts structural shadows while glass remains transparent to the shadow map', () => {
    const source = new Group()
    for (const name of ['Warm ivory walls', 'Retained blue-grey corridor columns', 'Garden bench stone', 'Garden pergola steel', 'Glass', 'Chair']) {
      const material = new MeshStandardMaterial({ name, transparent: name === 'Glass' })
      const mesh = new Mesh(new BoxGeometry(2, 2, 2), material)
      mesh.name = name; source.add(mesh)
    }
    const fitted = prepareCampusModel(source)
    expect(fitted.children.map(child => (child as Mesh).castShadow)).toEqual([true, true, true, true, false, false])
    expect(fitted.children.every(child => (child as Mesh).receiveShadow)).toBe(true)
    expect(source.children.every(child => !(child as Mesh).castShadow)).toBe(true)
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
