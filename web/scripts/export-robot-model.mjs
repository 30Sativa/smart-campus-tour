// Read-only export of robot/ URDF visuals into a web-owned asset, in metres.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { Box3, BoxGeometry, Color, Euler, Group, Mesh, MeshStandardMaterial } from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = resolve(root, 'robot/ros2_ws/src/robot_description')
const xml = readFileSync(resolve(source, 'urdf/robot_expanded_sim.urdf'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
const attribute = (tag, key) => tag?.match(new RegExp(`${key}="([^"]+)"`))?.[1]
const numbers = (value, fallback) => value ? value.split(/\s+/).map(Number) : fallback
function origin(object, block) {
  const tag = block.match(/<origin\b[^>]*\/>/)?.[0]
  object.position.fromArray(numbers(attribute(tag, 'xyz'), [0, 0, 0]))
  const [r, p, y] = numbers(attribute(tag, 'rpy'), [0, 0, 0])
  object.quaternion.setFromEuler(new Euler(r, p, y, 'ZYX'))
}
const materials = new Map([...xml.matchAll(/<material name="([^"]+)">\s*<color rgba="([^"]+)"\/>\s*<\/material>/g)].map(([, name, rgba]) => {
  const [r, g, b] = numbers(rgba)
  return [name, new MeshStandardMaterial({ color: new Color(r, g, b), roughness: 0.6, metalness: 0.15 })]
}))
const links = new Map([['base_footprint', new Group()]])
for (const [, name, block] of xml.matchAll(/<link name="([^"]+)"\s*>([\s\S]*?)<\/link>/g)) {
  const link = new Group(); link.name = name
  for (const [, visual] of block.matchAll(/<visual>([\s\S]*?)<\/visual>/g)) {
    const meshTag = visual.match(/<mesh\b[^>]*\/>/)?.[0]
    const boxTag = visual.match(/<box\b[^>]*\/>/)?.[0]
    let geometry
    if (meshTag) {
      const filename = attribute(meshTag, 'filename').replace('package://robot_description/', '')
      const bytes = readFileSync(resolve(source, filename))
      geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      geometry.scale(...numbers(attribute(meshTag, 'scale'), [1, 1, 1]))
    } else if (boxTag) geometry = new BoxGeometry(...numbers(attribute(boxTag, 'size')))
    else throw new Error(`Unsupported visual in ${name}`)
    const material = materials.get(attribute(visual.match(/<material\b[^>]*\/>/)?.[0], 'name'))
    if (!material) throw new Error(`Missing material in ${name}`)
    const mesh = new Mesh(geometry, material)
    mesh.name = meshTag ? attribute(meshTag, 'filename').split('/').at(-1) : `${name}_visual`
    origin(mesh, visual); link.add(mesh)
  }
  links.set(name, link)
}
for (const [, block] of xml.matchAll(/<joint\b[^>]*>([\s\S]*?)<\/joint>/g)) {
  if (!block.includes('<parent') && !block.includes('<child')) continue
  const parent = links.get(attribute(block.match(/<parent\b[^>]*\/>/)?.[0], 'link'))
  const child = links.get(attribute(block.match(/<child\b[^>]*\/>/)?.[0], 'link'))
  if (!parent || !child) throw new Error('Unresolved URDF joint')
  origin(child, block); parent.add(child)
}
const scene = new Group(); scene.name = 'CampusTour_URDF_metres'
scene.rotation.x = -Math.PI / 2
scene.add(links.get('base_footprint'))
scene.updateMatrixWorld(true)
const bounds = new Box3().setFromObject(scene)
scene.userData = { source: 'robot/ros2_ws/src/robot_description/urdf/robot_expanded_sim.urdf', units: 'metres', bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } }
// GLTFExporter uses the browser FileReader API for its binary buffer.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.() }) }
}
const output = resolve(root, 'web/public/models/robot/campus-amr.glb')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true })))
console.log(JSON.stringify({ output: 'web/public/models/robot/campus-amr.glb', bounds: scene.userData.bounds }))
