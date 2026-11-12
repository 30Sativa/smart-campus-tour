import { Component, useMemo, type MutableRefObject, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { AnimationMixer, BufferAttribute, CanvasTexture, Frustum, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Sphere, Vector3, type AnimationAction, type AnimationClip, type BufferGeometry, type Camera, type Material, type Object3D } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { DriveState } from '../drive'
import { TREES, seeded } from './fpt-campus'
import { campusCrowd } from './fpt-crowd'
import { ANIMATIONS_URL, AVATARS, SPECIES_HEIGHT, TREE_FAR, TREE_SPECIES, avatarUrl, castPerson, treeSpecies, treeUrl, type Avatar } from './fpt-assets'

/* The campus's real-looking trees and people, loaded from GLB files. While
   they load (or if they cannot), the map shows its simple ones instead. */


/** Shows `fallback` instead of its children if loading them fails. */
export class AssetBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

/* ---------- Trees ---------- */

type Part = { geometry: BufferGeometry; material: Material; leaves: boolean }
type Species = { near: InstancedMesh[]; far: InstancedMesh[]; trees: Matrix4[]; at: Vector3[]; radius: number[] }
type Forest = { group: Group; species: Species[] }

/**
 * The bark and leaves of a loaded tree. The files store each mesh compressed
 * to its own small box with the node scaling it back; the instances replace
 * the node, so that scaling is baked into a plain copy of the geometry here.
 */
function partsOf(scene: Object3D) {
  const parts: Part[] = []
  scene.updateMatrixWorld(true)
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return
    const material = object.material as Material & { alphaTest: number }
    const geometry = object.geometry.clone()
    const position = geometry.getAttribute('position')
    const plain = new Float32Array(position.count * 3)
    for (let i = 0; i < position.count; i += 1) plain.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3)
    geometry.setAttribute('position', new BufferAttribute(plain, 3))
    geometry.applyMatrix4(object.matrixWorld)
    parts.push({ geometry, material, leaves: material.alphaTest > 0 })
  })
  return parts
}

function batch(part: Part, count: number, near: boolean) {
  const mesh = new InstancedMesh(part.geometry, part.material, Math.max(1, count))
  mesh.castShadow = near
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.count = 0
  return mesh
}

const spin = new Quaternion()
const UP = new Vector3(0, 1, 0)

/** One batch per species, part and distance, with where each tree of the plan stands. */
function buildForest(near: { scene: Object3D }[], far: { scene: Object3D }[], roofTrees: readonly { x: number; y: number; h: number }[]): Forest {
  const random = seeded(91)
  const group = new Group()
  const plan = [
    ...TREES.filter(tree => tree.kind !== 'palm').map((tree, i) => ({ x: tree.x, y: tree.y, ground: 0, height: tree.height, species: treeSpecies(tree, i) })),
    ...roofTrees.map(tree => ({ x: tree.x, y: tree.y, ground: tree.h, height: 3 + random() * 1.5, species: random() < 0.5 ? 3 : 1 })),
  ]
  const species = TREE_SPECIES.map((_, s) => {
    const mine = plan.filter(tree => tree.species === s)
    const trees = mine.map(tree => new Matrix4().compose(new Vector3(tree.x, tree.ground, tree.y), spin.setFromAxisAngle(UP, random() * Math.PI * 2).clone(), new Vector3().setScalar(tree.height * SPECIES_HEIGHT[s] * (0.9 + random() * 0.2))))
    const at = mine.map(tree => new Vector3(tree.x, tree.ground + tree.height * SPECIES_HEIGHT[s] / 2, tree.y))
    const radius = mine.map(tree => tree.height * SPECIES_HEIGHT[s] * 0.75)
    const entry: Species = { near: partsOf(near[s].scene).map(part => batch(part, mine.length, true)), far: partsOf(far[s].scene).map(part => batch(part, mine.length, false)), trees, at, radius }
    for (const mesh of [...entry.near, ...entry.far]) group.add(mesh)
    return entry
  })
  return { group, species }
}

const view = new Frustum()
const viewMatrix = new Matrix4()
const bounds = new Sphere()
/**
 * Room kept round the picture, m: trees just out of shot still cast their
 * shadows into it (near ones), and the camera turns faster than a frame.
 */
const SHADOW_MARGIN = 14
const EDGE_MARGIN = 3

/**
 * Every frame, only the trees in (or just outside) the picture are drawn:
 * near ones from their full model, far ones from the light twin.
 */
function placeForest(forest: Forest, camera: Camera) {
  viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  view.setFromProjectionMatrix(viewMatrix)
  for (const entry of forest.species) {
    let near = 0
    let far = 0
    entry.trees.forEach((matrix, i) => {
      const close = entry.at[i].distanceTo(camera.position) < TREE_FAR
      if (!view.intersectsSphere(bounds.set(entry.at[i], entry.radius[i] + (close ? SHADOW_MARGIN : EDGE_MARGIN)))) return
      for (const mesh of close ? entry.near : entry.far) mesh.setMatrixAt(close ? near : far, matrix)
      if (close) near += 1
      else far += 1
    })
    for (const mesh of entry.near) { mesh.count = near; mesh.instanceMatrix.needsUpdate = true }
    for (const mesh of entry.far) { mesh.count = far; mesh.instanceMatrix.needsUpdate = true }
  }
}

/** The campus's shade and flowering trees (the palms stay as drawn by the map). */
export function RealTrees({ roofTrees }: { roofTrees: readonly { x: number; y: number; h: number }[] }) {
  const near = useGLTF(TREE_SPECIES.map(name => treeUrl(name, false)), false, true)
  const far = useGLTF(TREE_SPECIES.map(name => treeUrl(name, true)), false, true)
  const forest = useMemo(() => buildForest(near, far, roofTrees), [near, far, roofTrees])
  useFrame(({ camera }) => placeForest(forest, camera))
  return <primitive object={forest.group} />
}

/* ---------- People ---------- */

type Person = { object: Object3D; mixer: AnimationMixer; action: AnimationAction; pace: number; last: Vector3; speed: number; skip: number }
type Cast = { group: Group; people: Person[]; shadows: InstancedMesh }

/** Beyond this distance from the camera, m, people are too small to make out and are not drawn. */
const PEOPLE_FAR = 70
/** Beyond this, m, their animation runs at a quarter of the frame rate. */
const PEOPLE_SLOW = 40

/** A soft dark spot, the shadow under a person (cheaper than a real one for a hundred animated people). */
function shadowSpot() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)')
    gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const material = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  return { geometry, material }
}

/** Everyone in the crowd as a person: a copy of their avatar with its own animation, starting at a random point in it. */
function buildCast(avatars: Record<Avatar, Object3D>, clips: AnimationClip[]): Cast {
  const random = seeded(17)
  const group = new Group()
  const people = [...campusCrowd.walkers, ...campusCrowd.idlers].map((person, index) => {
    const role = castPerson(person, index)
    const object = cloneSkinned(avatars[role.avatar])
    // A soft spot under each person stands in for their shadow; they still receive the scene's.
    object.traverse(child => { if (child instanceof Mesh) { child.castShadow = false; child.receiveShadow = true } })
    const mixer = new AnimationMixer(object)
    const clip = clips.find(item => item.name === role.clip) ?? clips[0]
    const action = mixer.clipAction(clip)
    action.play()
    action.time = random() * clip.duration
    group.add(object)
    return { object, mixer, action, pace: role.pace, last: new Vector3(person.x, 0, person.y), speed: 0, skip: index % 4 }
  })
  const spot = shadowSpot()
  const shadows = new InstancedMesh(spot.geometry, spot.material, Math.max(1, people.length))
  shadows.frustumCulled = false
  shadows.renderOrder = 2
  shadows.count = 0
  group.add(shadows)
  return { group, people, shadows }
}

const spotMatrix = new Matrix4()
const spotTurn = new Quaternion()
const spotAt = new Vector3()
const spotSize = new Vector3(0.95, 1, 0.95)

/** Moves each person to where the crowd has them, turns them to face their way and matches their stride to their speed. */
function moveCast(cast: Cast, robot: DriveState, clear: number, delta: number, camera: Camera, frame: number) {
  const { walkers, idlers } = campusCrowd
  let spots = 0
  cast.people.forEach((person, i) => {
    const data = i < walkers.length ? walkers[i] : idlers[i - walkers.length]
    if (!data) return
    const { object } = person
    const cleared = clear > 0 && Math.hypot(data.x - robot.x, data.y - robot.y) < clear
    // Out of the shot near the robot in the story's close-ups, and too far off to make out.
    const away = Math.hypot(data.x - camera.position.x, data.y - camera.position.z)
    object.visible = !cleared && away < PEOPLE_FAR
    // A hidden avatar's bones are left alone by the scene's per-frame matrix update.
    object.matrixWorldAutoUpdate = object.visible
    if (!object.visible) return
    object.position.set(data.x, 0.04, data.y)
    cast.shadows.setMatrixAt(spots, spotMatrix.compose(spotAt.set(data.x, 0.07, data.y), spotTurn, spotSize))
    spots += 1
    // Avatars face +z; the crowd's heading is in the map's x/y.
    object.rotation.y = Math.PI / 2 - data.yaw
    if (person.pace > 0 && delta > 0) {
      const moved = Math.hypot(data.x - person.last.x, data.y - person.last.z) / delta
      person.speed += (Math.min(moved, 4) - person.speed) * Math.min(1, delta * 5)
      person.action.timeScale = person.speed / person.pace
    }
    person.last.set(data.x, 0, data.y)
    // Far from the camera the animation runs at a quarter of the frame rate.
    if (away < PEOPLE_SLOW) person.mixer.update(delta)
    else if ((frame + person.skip) % 4 === 0) person.mixer.update(delta * 4)
  })
  cast.shadows.count = spots
  cast.shadows.instanceMatrix.needsUpdate = true
}

/** The people of the campus, as real-looking animated avatars. */
export function RealCrowd({ driveRef, clearRef }: { driveRef: MutableRefObject<DriveState>; clearRef?: MutableRefObject<number> }) {
  const loaded = useGLTF(AVATARS.map(avatarUrl), false, true)
  const animations = useGLTF(ANIMATIONS_URL, false, true)
  const cast = useMemo(() => {
    const avatars = {} as Record<Avatar, Object3D>
    AVATARS.forEach((name, i) => { avatars[name] = loaded[i].scene })
    return buildCast(avatars, animations.animations)
  }, [loaded, animations])
  useFrame((state, delta) => moveCast(cast, driveRef.current, clearRef?.current ?? 0, Math.min(delta, 0.1), state.camera, state.gl.info.render.frame))
  return <primitive object={cast.group} />
}
