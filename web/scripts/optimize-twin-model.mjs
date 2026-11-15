#!/usr/bin/env node
// Builds the Digital Twin's runtime campus model from its authored source, ahead
// of time (nothing here runs in the browser):
//
//   node web/scripts/optimize-twin-model.mjs            (from the repo root)
//   npm --prefix web run model:optimize
//
// Input  web/public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.glb (the styled
//        source that the asset and patrol tests read; it stays unchanged)
// Output web/public/models/simulator-map/NVHSV_Tang6_V3_modern_v2.opt.glb (what
//        CampusModel loads)
//
// Steps: dedup -> instance (EXT_mesh_gpu_instancing) -> flatten -> join by
// material -> weld -> quantize + meshopt compression (EXT_meshopt_compression),
// then prune. Transmission glass becomes ordinary alpha-blended glass (same
// colour, opacity 0.30) and clearcoat is dropped: transmission costs three.js a
// whole extra render pass per frame. Material names are kept (dedup keeps
// distinct names), because `prepareCampusModel` picks the shadow casters by name.
//
// Before writing, the output is loaded with three.js's GLTFLoader (the loader
// the page uses) and its vertex bounds are compared with the source's:
// `map-config.ts` places robots with constants measured on the source, so the
// optimised model must not move.
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, instance, join, meshopt, prune, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { Box3, Matrix4, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder as ThreeMeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const base = new URL('../public/models/simulator-map/', import.meta.url)
const input = new URL(process.argv[2] ?? 'NVHSV_Tang6_V3_modern_v2.glb', base)
const output = new URL(process.argv[3] ?? 'NVHSV_Tang6_V3_modern_v2.opt.glb', base)
const GLASS_OPACITY = 0.3
const MAX_BOUNDS_DRIFT_M = 0.01
const DROPPED_EXTENSIONS = ['KHR_materials_transmission', 'KHR_materials_ior', 'KHR_materials_clearcoat']

/** What three.js draws from these bytes: vertex bounds (instances included), meshes, and material names. */
async function threeView(bytes) {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(ThreeMeshoptDecoder)
  // Textures need a browser image decoder; geometry and materials do not.
  loader.register(() => ({ name: 'skip-images', loadTexture: () => Promise.resolve(null) }))
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  gltf.scene.updateMatrixWorld(true)
  const bounds = new Box3(), matrix = new Matrix4(), point = new Vector3(), materials = new Set()
  let meshes = 0
  gltf.scene.traverse(object => {
    if (!object.isMesh) return
    meshes++
    for (const material of [object.material].flat()) materials.add(material.name)
    const position = object.geometry.attributes.position
    for (let copy = 0; copy < (object.isInstancedMesh ? object.count : 1); copy++) {
      if (object.isInstancedMesh) object.getMatrixAt(copy, matrix).premultiply(object.matrixWorld)
      else matrix.copy(object.matrixWorld)
      for (let i = 0; i < position.count; i++) bounds.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(matrix))
    }
  })
  return { bounds, meshes, materials: [...materials].sort() }
}

globalThis.self ??= globalThis
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const source = readFileSync(input)
const doc = await io.readBinary(new Uint8Array(source))
const root = doc.getRoot()

for (const material of root.listMaterials()) {
  if (material.getExtension('KHR_materials_transmission')) {
    const [r, g, b] = material.getBaseColorFactor()
    material.setAlphaMode('BLEND')
    material.setBaseColorFactor([r, g, b, GLASS_OPACITY])
  }
  for (const name of DROPPED_EXTENSIONS) material.setExtension(name, null)
}
for (const extension of root.listExtensionsUsed()) if (DROPPED_EXTENSIONS.includes(extension.extensionName)) extension.dispose()

await doc.transform(
  dedup({ keepUniqueNames: true }),
  instance({ min: 2 }),
  flatten(),
  join({ keepNamed: false }),
  weld(),
  // meshopt() quantizes the vertex attributes, reorders them and applies EXT_meshopt_compression.
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  prune(),
)
const optimised = Buffer.from(await io.writeBinary(doc))

const before = await threeView(source)
const after = await threeView(optimised)
const drift = Math.max(...['x', 'y', 'z'].flatMap(k => [Math.abs(after.bounds.min[k] - before.bounds.min[k]), Math.abs(after.bounds.max[k] - before.bounds.max[k])]))
if (drift > MAX_BOUNDS_DRIFT_M) throw new Error(`Scene bounds moved by ${drift.toFixed(4)} m; robots would be drawn in the wrong place.`)
const lost = before.materials.filter(name => !after.materials.includes(name))
if (lost.length) throw new Error(`Material names lost: ${lost.join(', ')}`)

writeFileSync(output, optimised)
const mb = bytes => (bytes / 1e6).toFixed(2)
console.log(`source    ${mb(source.length)} MB, ${before.meshes} meshes drawn`)
console.log(`optimised ${mb(statSync(output).size)} MB, ${after.meshes} meshes drawn, bounds drift ${(drift * 1000).toFixed(1)} mm, ${after.materials.length} materials kept`)
