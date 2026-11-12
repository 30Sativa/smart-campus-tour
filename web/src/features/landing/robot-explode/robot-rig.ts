import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { AdditiveBlending, Box3, Color, EdgesGeometry, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Camera, type WebGLProgramParametersWithUniforms } from 'three'
import { CASING, PART_GROUPS, explodeOffset, groupOfNode, openOffset, partGroup, type PartGroupId } from './parts'
import { CALLOUTS, type CalloutPoint } from './callouts'

/**
 * The CampusTour robot from its SolidWorks assembly, as one set of moving
 * parts: taken apart (every part at once), opened (top lifted, side panels
 * slid out and see-through), parts lit up, wheels rolling and the camera head
 * turning. Used by the test drive on the Twin's floor map (section 04).
 */
export const ROBOT_MODEL_URL = `${import.meta.env.BASE_URL}models/robot/campus-amr-explode.glb`

const GLOW = new Color('#8fcf4a')
/** What turns with the head, about the column's axis; the base plate of the pan-tilt stays put. */
const HEAD_PIECES = new Set<PartGroupId>(['pantilt', 'head', 'quest'])
const HEAD_BASE = 'pantilt__03'

type Piece = {
  mesh: Mesh; group: PartGroupId; base: Vector3; home: Vector3; offset: Vector3; open: Vector3; side: number; turns: 'wheel' | 'head' | null
  /** The piece's own turn as modelled, and where its geometry's centre sits from its origin (in the model's space). */
  baseTurn: Quaternion; centre: Vector3
}
/** One unit's way out of the robot (a piece, or a board moving as one), for the callouts and the camera. */
type Anchor = { home: Vector3; offset: Vector3; open: Vector3 }

/** The scroll story's scan: a band of light on the robot's own surface, as a plane in world space. */
type ScanUniforms = { uScanPoint: { value: Vector3 }; uScanNormal: { value: Vector3 }; uScanWidth: { value: number }; uScanAmount: { value: number }; uScanColor: { value: Color } }

/**
 * Teaches a robot material the scan: a bright band where the plane cuts the
 * body, and behind it (where it has passed) a faint cyan with fine contour
 * lines, as if the surface had been read.
 */
function addScan(material: MeshStandardMaterial, uniforms: ScanUniforms) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScanWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvScanWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScanWorld;\nuniform vec3 uScanPoint;\nuniform vec3 uScanNormal;\nuniform float uScanWidth;\nuniform float uScanAmount;\nuniform vec3 uScanColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uScanAmount > 0.0) {
  // sd: how far past the scan plane, in band widths (negative: already scanned).
  float sd = dot(vScanWorld - uScanPoint, uScanNormal) / uScanWidth;
  float core = exp(-sd * sd * 4.0);
  float band = exp(-sd * sd * 0.5);
  float halo = exp(-sd * sd * 0.02);
  float trail = sd < 0.0 ? exp(sd * 0.06) : 0.0;
  float lines = smoothstep(0.8, 1.0, abs(fract(vScanWorld.y / (uScanWidth * 0.8)) - 0.5) * 2.0);
  // The body dims a little and what has been read turns cool, so the light of the band shows on the white casing.
  diffuseColor.rgb *= 1.0 - uScanAmount * (0.5 - 0.3 * trail) * (1.0 - band);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.85, 1.0), trail * uScanAmount);
  totalEmissiveRadiance += uScanColor * uScanAmount * (core * 3.0 + band * 1.4 + halo * 0.25 + trail * (0.06 + lines * 0.6));
}`)
  }
  material.customProgramCacheKey = () => 'robot-scan'
}

export function useRobotParts() {
  const { scene } = useGLTF(ROBOT_MODEL_URL, false, true)
  return useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const materials = new Map<PartGroupId, MeshStandardMaterial>()
    const scan: ScanUniforms = { uScanPoint: { value: new Vector3() }, uScanNormal: { value: new Vector3(0, 0, 1) }, uScanWidth: { value: 0.05 }, uScanAmount: { value: 0 }, uScanColor: { value: new Color(SCAN_COLOR) } }
    for (const group of PART_GROUPS) {
      const material = new MeshStandardMaterial({ color: group.color, metalness: group.metalness, roughness: group.roughness, emissive: GLOW.clone(), emissiveIntensity: 0 })
      addScan(material, scan)
      materials.set(group.id, material)
    }
    const found: { mesh: Mesh; group: PartGroupId; box: Box3 }[] = []
    root.traverse(object => {
      if (!(object instanceof Mesh)) return
      const group = groupOfNode(object.name)
      if (!group) return
      object.material = materials.get(group)!
      object.castShadow = true
      object.receiveShadow = true
      found.push({ mesh: object, group, box: new Box3().setFromObject(object) })
    })

    // A unit moves as one solid thing: a rigid board (whole, or one per side), otherwise a single piece.
    const boxes = new Map<string, { group: PartGroupId; meshes: Mesh[]; box: Box3 }>()
    for (const item of found) {
      const rigid = partGroup(item.group).rigid
      const x = item.box.getCenter(new Vector3()).x
      const key = rigid === 'side' ? `${item.group}:${x < 0 ? 'L' : 'R'}` : rigid ? item.group : item.mesh.uuid
      const unit = boxes.get(key) ?? { group: item.group, meshes: [], box: new Box3() }
      unit.meshes.push(item.mesh)
      unit.box.union(item.box)
      boxes.set(key, unit)
    }
    const pieces: Piece[] = []
    const anchors = new Map<PartGroupId, Anchor[]>()
    for (const unit of boxes.values()) {
      const centre = unit.box.getCenter(new Vector3())
      const apart = explodeOffset(partGroup(unit.group).explode, [centre.x, centre.y, centre.z])
      const offset = new Vector3(...apart)
      const open = new Vector3(...openOffset(unit.group, apart))
      for (const mesh of unit.meshes) {
        const home = new Box3().setFromObject(mesh).getCenter(new Vector3())
        const turns = unit.group === 'wheel' ? 'wheel' : HEAD_PIECES.has(unit.group) && mesh.name !== HEAD_BASE ? 'head' : null
        mesh.geometry.computeBoundingBox()
        const centre = mesh.geometry.boundingBox!.getCenter(new Vector3()).multiply(mesh.scale).applyQuaternion(mesh.quaternion)
        pieces.push({ mesh, group: unit.group, base: mesh.position.clone(), home, offset, open, side: Math.sign(home.x) || 1, turns, baseTurn: mesh.quaternion.clone(), centre })
      }
      anchors.set(unit.group, [...(anchors.get(unit.group) ?? []), { home: centre, offset, open }])
    }
    const counts = new Map<PartGroupId, number>()
    pieces.forEach(piece => counts.set(piece.group, (counts.get(piece.group) ?? 0) + 1))
    const column = pieces.find(piece => piece.group === 'column')?.home ?? new Vector3()
    const wheels = pieces.filter(piece => piece.turns === 'wheel')
    const xs = wheels.map(piece => piece.home.x)
    const box = new Box3().setFromObject(root)
    return {
      root,
      pieces,
      anchors,
      materials,
      counts,
      panAxis: new Vector3(column.x, 0, column.z),
      /** Distance between the two drive wheels and their radius, metres. */
      track: xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0.45,
      wheelRadius: wheels.length ? Math.max(0.03, new Box3().setFromObject(wheels[0].mesh).getSize(new Vector3()).y / 2) : 0.08,
      height: box.max.y,
      /** Back and nose of the robot along its length (model +Z is the nose), for the scan. */
      length: [box.min.z, box.max.z] as const,
      scan,
    }
  }, [scene])
}

export type RobotParts = ReturnType<typeof useRobotParts>

export function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

const turn = new Quaternion()
const pivot = new Vector3()
const arm = new Vector3()
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)

/**
 * Puts every piece where it is now. `apart` 0 assembled .. 1 taken apart (all
 * parts at once); `open` lifts the top section and slides the side panels.
 * `wheels` is the roll angle of the left (+X) and right drive wheel, `pan`
 * the head's turn about the column.
 */
export function poseRobot(model: RobotParts, apart: number, open: number, wheels: { left: number; right: number }, pan: number) {
  const a = ease(apart)
  const o = ease(open) * (1 - a)
  for (const piece of model.pieces) {
    piece.mesh.position.copy(piece.base).addScaledVector(piece.offset, a).addScaledVector(piece.open, o)
    if (!piece.turns) continue
    // Turn about an axis through `pivot`: a wheel about its own axle (the centre of its geometry,
    // wherever the wheel now is), the head about the column's vertical axis.
    const at = piece.mesh.position
    if (piece.turns === 'wheel') {
      turn.setFromAxisAngle(X_AXIS, piece.side > 0 ? wheels.left : wheels.right)
      pivot.copy(at).add(piece.centre)
    } else {
      turn.setFromAxisAngle(Y_AXIS, pan)
      pivot.set(model.panAxis.x, at.y, model.panAxis.z)
    }
    // Rotating the piece about `pivot` moves its origin to pivot + turn(origin - pivot).
    arm.subVectors(at, pivot).applyQuaternion(turn)
    at.copy(pivot).add(arm)
    piece.mesh.quaternion.copy(turn).multiply(piece.baseTurn)
  }
}

/** Where a unit is now, in the model's own space. */
function anchorAt(anchor: Anchor, apart: number, open: number, out: Vector3) {
  const a = ease(apart)
  return out.copy(anchor.home).addScaledVector(anchor.offset, a).addScaledVector(anchor.open, ease(open) * (1 - a))
}

const scratch = new Vector3()

/** Middle of one group's units as they stand now, in world space; null for a group the model lacks. */
export function partCentre(model: RobotParts, group: PartGroupId, apart: number, open: number, out: Vector3) {
  const list = model.anchors.get(group)
  if (!list?.length) return null
  out.set(0, 0, 0)
  for (const anchor of list) out.add(anchorAt(anchor, apart, open, scratch))
  return model.root.localToWorld(out.divideScalar(list.length))
}

/**
 * Lights up the focused groups (with a slow pulse); while the robot is open the
 * casing turns see-through, and with a part in focus everything else fades.
 */
export function styleRobot(model: RobotParts, highlight: ReadonlySet<PartGroupId>, hovered: PartGroupId | null, open: number, fade: boolean, time: number, xray = 0) {
  const pulse = 0.42 + Math.sin(time * 3.2) * 0.14
  const see = ease(open)
  for (const [group, material] of model.materials) {
    const focused = highlight.has(group)
    let opacity = 1
    if (!focused && CASING.has(group)) opacity = 1 - 0.9 * see
    else if (!focused && fade && highlight.size > 0) opacity = 0.3
    // X-ray: the solid parts thin out to a ghost behind their glowing edges.
    opacity *= 1 - 0.93 * xray
    const transparent = opacity < 0.999
    if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true }
    material.opacity = opacity
    material.depthWrite = !transparent
    material.emissive.copy(xray > 0 ? XRAY : GLOW)
    material.emissiveIntensity = focused ? pulse : hovered === group ? 0.25 : xray * 0.6
  }
  setEdges(model, xray)
}

const XRAY = new Color('#5fe3ff')
const SCAN_COLOR = '#6fe6ff'
const scanAxis = new Vector3()

/**
 * The scan over the robot's body: `progress` 0 (at its back) .. 1 (past its
 * nose), or null for none. Fades in and out at the ends of the pass.
 */
export function scanRobot(model: RobotParts, progress: number | null) {
  const uniforms = model.scan
  if (progress === null) { uniforms.uScanAmount.value = 0; return }
  const [back, nose] = model.length
  const margin = 0.08
  model.root.updateWorldMatrix(true, false)
  const world = model.root.matrixWorld
  uniforms.uScanPoint.value.set(0, 0, back - margin + (nose - back + 2 * margin) * progress).applyMatrix4(world)
  uniforms.uScanNormal.value.copy(scanAxis.set(0, 0, 1)).transformDirection(world)
  uniforms.uScanWidth.value = 0.035 * world.getMaxScaleOnAxis()
  uniforms.uScanAmount.value = Math.min(1, progress / 0.08, (1 - progress) / 0.12 + 0.35)
}
const edgeMaterial = new LineBasicMaterial({ color: '#7fe9ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false })
const edged = new WeakSet<RobotParts>()

/**
 * The robot's edges as glowing lines, for the x-ray look of the scroll story.
 * Worked out the first time they are needed (a moment's work), then kept on
 * each piece so they move with it.
 */
function setEdges(model: RobotParts, amount: number) {
  edgeMaterial.opacity = amount * 0.85
  if (amount <= 0 || edged.has(model)) return
  edged.add(model)
  for (const piece of model.pieces) {
    const lines = new LineSegments(new EdgesGeometry(piece.mesh.geometry, 28), edgeMaterial)
    lines.raycast = () => {}
    lines.renderOrder = 8
    piece.mesh.add(lines)
  }
}

/** The overlay's per-frame entry point: where each callout's part is on screen (null: hidden). */
export type CalloutFrame = (points: readonly (CalloutPoint | null)[], width: number, height: number) => void

const projected = new Vector3()
const nearest = new Vector3()

/** Screen positions of the callouts' parts; for a group of several (wheels, sensors) the one nearest the camera. */
export function projectCallouts(model: RobotParts, camera: Camera, width: number, height: number, apart: number, open: number) {
  return CALLOUTS.map((callout, id): CalloutPoint | null => {
    const list = model.anchors.get(callout.group)
    if (!list?.length) return null
    let best = Infinity
    for (const anchor of list) {
      model.root.localToWorld(anchorAt(anchor, apart, open, scratch))
      const gap = scratch.distanceToSquared(camera.position)
      if (gap < best) { best = gap; nearest.copy(scratch) }
    }
    projected.copy(nearest).project(camera)
    if (projected.z > 1 || projected.z < -1) return null
    return { id, x: (projected.x + 1) / 2 * width, y: (1 - projected.y) / 2 * height }
  })
}

useGLTF.preload(ROBOT_MODEL_URL, false, true)
