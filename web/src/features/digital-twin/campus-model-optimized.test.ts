/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Box3, BoxGeometry, Group, Matrix4, Mesh, Vector3, type InstancedMesh } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { NVH_V3_FIT, prepareCampusModel } from './campus-model'
import { mapConfigFor } from './map-config'

/** Vertex bounds of a GLB as three.js draws it, GPU instances included (as scripts/optimize-twin-model.mjs checks). */
async function drawnBounds(path: string) {
  const bytes = readFileSync(path)
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  loader.register(() => ({ name: 'skip-images', loadTexture: () => Promise.resolve(null) }) as never)
  // A fresh ArrayBuffer: GLTFLoader tells binary from JSON with instanceof, and Node's Buffer comes from another realm under jsdom.
  const data = new ArrayBuffer(bytes.length)
  new Uint8Array(data).set(bytes)
  const gltf = await loader.parseAsync(data, '')
  gltf.scene.updateMatrixWorld(true)
  const box = new Box3(), matrix = new Matrix4(), point = new Vector3()
  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh)) return
    const instanced = (object as InstancedMesh).isInstancedMesh ? object as InstancedMesh : null
    const position = object.geometry.attributes.position
    for (let copy = 0; copy < (instanced ? instanced.count : 1); copy++) {
      if (instanced) instanced.getMatrixAt(copy, matrix).premultiply(object.matrixWorld)
      else matrix.copy(object.matrixWorld)
      for (let i = 0; i < position.count; i++) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix))
    }
  })
  return box
}

/** The glTF JSON chunk of a GLB. */
function gltfJson(path: string) {
  const bytes = readFileSync(path)
  expect(bytes.readUInt32LE(8)).toBe(bytes.length)
  return { size: bytes.length, json: JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))) }
}
type Material = { name: string; alphaMode?: string; pbrMetallicRoughness?: { baseColorFactor?: number[] }; extensions?: Record<string, unknown> }
type Primitive = { material?: number }
type Node = { mesh?: number; children?: number[] }

/** Names of the materials the scene draws (meshes no node reaches are never drawn). */
function drawnMaterials(json: { scenes: { nodes: number[] }[]; scene?: number; nodes: Node[]; meshes: { primitives: Primitive[] }[]; materials: Material[] }) {
  const names = new Set<string>()
  const visit = (index: number) => {
    const node = json.nodes[index]
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) if (primitive.material !== undefined) names.add(json.materials[primitive.material].name)
    node.children?.forEach(visit)
  }
  json.scenes[json.scene ?? 0].nodes.forEach(visit)
  return [...names].sort()
}

const SOURCE = 'public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb'
const OPTIMISED = 'public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.opt.glb'

describe('optimised campus model (scripts/optimize-twin-model.mjs)', () => {
  const source = gltfJson(SOURCE)
  const optimised = gltfJson(OPTIMISED)

  it('stays under the 4 MB budget, compressed and instanced', () => {
    expect(optimised.size).toBeLessThan(4_000_000)
    expect(optimised.json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_mesh_gpu_instancing']))
    expect(optimised.json.extensionsRequired).toContain('EXT_meshopt_compression')
    // Under 300 draw calls a frame needs far fewer drawable primitives than the source's 724.
    const primitives = optimised.json.meshes.reduce((total: number, mesh: { primitives: unknown[] }) => total + mesh.primitives.length, 0)
    expect(primitives).toBeLessThan(150)
  })

  it('keeps every drawn material name, which prepareCampusModel picks shadow casters by', () => {
    expect(drawnMaterials(optimised.json)).toEqual(drawnMaterials(source.json))
    for (const caster of ['Warm ivory walls', 'Retained blue-grey corridor columns', 'Garden bench stone', 'Garden pergola steel']) {
      expect(drawnMaterials(optimised.json)).toContain(caster)
    }
  })

  it('is fitted with the bounds measured on the source, the same numbers map-config places robots with', async () => {
    for (const box of [await drawnBounds(SOURCE), await drawnBounds(OPTIMISED)]) {
      expect(box.max.x - box.min.x).toBeLessThan(NVH_V3_FIT.width)
      expect(box.max.z - box.min.z).toBeCloseTo(NVH_V3_FIT.width, 1)
      expect((box.min.x + box.max.x) / 2).toBeCloseTo(NVH_V3_FIT.centerX, 1)
      expect((box.min.z + box.max.z) / 2).toBeCloseTo(NVH_V3_FIT.centerZ, 1)
      expect(box.min.y).toBeCloseTo(NVH_V3_FIT.floorY, 2)
    }
    const box = await drawnBounds(SOURCE)
    expect(box.max.z - box.min.z).toBeCloseTo(NVH_V3_FIT.width, 3)
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(NVH_V3_FIT.centerX, 3)
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(NVH_V3_FIT.centerZ, 3)
    expect(box.min.y).toBeCloseTo(NVH_V3_FIT.floorY, 3)
    expect(mapConfigFor('map2-v2')!.scene.robotScale).toBeCloseTo(20 / NVH_V3_FIT.width)
    // A fit given explicitly is used as is: rotated instances cannot grow it.
    const unit = new Group()
    unit.add(new Mesh(new BoxGeometry(1, 1, 1)))
    const fitted = prepareCampusModel(unit, undefined, NVH_V3_FIT)
    expect(fitted.scale.x).toBeCloseTo(20 / NVH_V3_FIT.width)
    expect(fitted.position.x).toBeCloseTo(-NVH_V3_FIT.centerX * 20 / NVH_V3_FIT.width)
    expect(fitted.position.y).toBeCloseTo(-NVH_V3_FIT.floorY * 20 / NVH_V3_FIT.width)
  })

  it('turns transmission glass into plain blended glass of the same colour, and drops clearcoat', () => {
    expect(optimised.json.extensionsUsed ?? []).not.toContain('KHR_materials_clearcoat')
    expect(optimised.json.extensionsUsed ?? []).not.toContain('KHR_materials_transmission')
    // "Clear upper door glass" sits only on meshes no scene node reaches, so it is neither drawn nor shipped.
    expect(drawnMaterials(source.json)).not.toContain('Clear upper door glass')
    for (const name of ['Atrium clear blue green laminated glass']) {
      const before = (source.json.materials as Material[]).find(material => material.name === name)!
      const after = (optimised.json.materials as Material[]).find(material => material.name === name)!
      expect(after.alphaMode).toBe('BLEND')
      expect(after.extensions ?? {}).toEqual({})
      const [r, g, b, a] = after.pbrMetallicRoughness!.baseColorFactor!
      expect([r, g, b]).toEqual(before.pbrMetallicRoughness!.baseColorFactor!.slice(0, 3))
      expect(a).toBeGreaterThanOrEqual(0.25)
      expect(a).toBeLessThanOrEqual(0.35)
    }
  })
})
