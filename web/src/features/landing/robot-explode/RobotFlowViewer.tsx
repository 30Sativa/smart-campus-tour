import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, Line, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, Group, Mesh, MeshStandardMaterial, QuadraticBezierCurve3, Vector3 } from 'three'
import { PART_GROUPS, groupOfNode, type PartGroupId } from './parts'
import { flowNode, signalColor, stepParts, type FlowLink, type FlowNodeId, type FlowStep } from './flows'
import ZoomControls from './ZoomControls'
import { dollyTo, useZoom } from './zoom'

const MODEL_URL = `${import.meta.env.BASE_URL}models/robot/campus-amr-explode.glb`
/** The students' tour page has no place on the robot; its link leaves upwards, above the headset. */
const CLOUD = new Vector3(0, 1.72, 0.25)
/** Groups seen through: the casing and lid fade so the signal paths inside show. */
const SEE_THROUGH: readonly PartGroupId[] = ['shell', 'lowershell', 'lid', 'screw', 'column', 'lidar']
const CAMERA = { position: [1.95, 1.3, 2.35] as const, target: [0, 0.62, 0] as const }
/** The camera's usual distance from what it looks at. */
const HOME_DISTANCE = new Vector3(...CAMERA.position).distanceTo(new Vector3(...CAMERA.target))

type Spinner = { pivot: Group; axis: 'x' | 'y'; group: PartGroupId }

/** How a node's parts are pinned for a link: one point, one per side (left/right), or one per corner. */
function anchorMode(id: FlowNodeId): 'centre' | 'sides' | 'corners' {
  if (id === 'sonar') return 'corners'
  if (id === 'driver' || id === 'motor' || id === 'wheel' || id === 'drv') return 'sides'
  return 'centre'
}

function useFlowModel() {
  const { scene } = useGLTF(MODEL_URL, false, true)
  return useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const materials = new Map<PartGroupId, MeshStandardMaterial>()
    for (const group of PART_GROUPS) {
      materials.set(group.id, new MeshStandardMaterial({ color: group.color, metalness: group.metalness, roughness: group.roughness, transparent: true }))
    }
    const meshes = new Map<PartGroupId, { mesh: Mesh; centre: Vector3 }[]>()
    root.traverse(object => {
      if (!(object instanceof Mesh)) return
      const group = groupOfNode(object.name)
      if (!group) return
      object.material = materials.get(group)!
      object.castShadow = true
      meshes.set(group, [...(meshes.get(group) ?? []), { mesh: object, centre: new Box3().setFromObject(object).getCenter(new Vector3()) }])
    })

    // Turning parts: every wheel and the LiDAR spin about their own centre; the whole head pans about the column.
    const pivotAt = (centre: Vector3, members: Mesh[]) => {
      const pivot = new Group()
      pivot.position.copy(centre)
      root.add(pivot)
      for (const mesh of members) {
        mesh.position.sub(centre)
        pivot.add(mesh)
      }
      return pivot
    }
    const spinners: Spinner[] = []
    for (const [group, axis] of [['wheel', 'x'], ['caster', 'x'], ['lidar', 'y']] as const) {
      for (const { mesh, centre } of meshes.get(group) ?? []) spinners.push({ pivot: pivotAt(centre, [mesh]), axis, group })
    }
    const column = meshes.get('column')?.[0]?.centre ?? new Vector3()
    const headMeshes = (['pantilt', 'head', 'quest'] as const).flatMap(group => (meshes.get(group) ?? []).map(item => item.mesh))
    const head = pivotAt(new Vector3(column.x, 0, column.z), headMeshes)

    const anchors = (id: FlowNodeId): Vector3[] => {
      if (id === 'cloud') return [CLOUD]
      const items = meshes.get(flowNode(id).part!) ?? []
      const mode = anchorMode(id)
      const buckets = new Map<string, Vector3[]>()
      for (const { centre } of items) {
        const key = mode === 'centre' ? 'c' : mode === 'sides' ? (centre.x < 0 ? 'L' : 'R') : `${centre.x < 0 ? 'L' : 'R'}${centre.z < 0 ? 'B' : 'F'}`
        buckets.set(key, [...(buckets.get(key) ?? []), centre])
      }
      return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, points]) => points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length))
    }
    return { root, materials, spinners, head, anchors }
  }, [scene])
}

type FlowModel = ReturnType<typeof useFlowModel>

/** Curves for one link: left to left and right to right when both ends come in pairs, otherwise fanning out or in. */
function linkCurves(model: FlowModel, link: FlowLink) {
  const from = model.anchors(link.from)
  const to = model.anchors(link.to)
  const pairs: [Vector3, Vector3][] = from.length === to.length
    ? from.map((point, index) => [point, to[index]])
    : from.length === 1 ? to.map(point => [from[0], point]) : to.length === 1 ? from.map(point => [point, to[0]]) : from.flatMap(a => to.map(b => [a, b] as [Vector3, Vector3]))
  return pairs.map(([a, b]) => {
    const lift = 0.06 + a.distanceTo(b) * 0.25
    const control = a.clone().lerp(b, 0.5).add(new Vector3(0, lift, 0))
    return new QuadraticBezierCurve3(a.clone(), control, b.clone())
  })
}

/** The signal colour a part glows in: that of the first link of the step touching it (extra parts take the step's first link). */
function partGlow(step: FlowStep): Map<PartGroupId, string> {
  const glow = new Map<PartGroupId, string>()
  for (const link of step.links) {
    for (const id of [link.from, link.to]) {
      const part = flowNode(id).part
      if (part && !glow.has(part)) glow.set(part, signalColor(link.kind))
    }
  }
  for (const part of stepParts(step)) if (!glow.has(part)) glow.set(part, signalColor(step.links[0].kind))
  return glow
}

/** Lights the parts that work in this step in their signal's colour; the rest fade, the casing most of all. */
function styleModel(model: FlowModel, step: FlowStep | null) {
  const glow = step ? partGlow(step) : new Map<PartGroupId, string>()
  for (const [group, material] of model.materials) {
    const colour = glow.get(group)
    material.opacity = colour ? 1 : group === 'frame' ? 0.3 : SEE_THROUGH.includes(group) ? 0.06 : 0.14
    material.depthWrite = Boolean(colour) || group === 'frame'
    material.emissive.set(colour ?? '#000000')
    material.emissiveIntensity = colour ? 0.55 : 0
  }
}

/** Spins the wheels or the LiDAR, or pans the head, when the step is about them; the head eases back otherwise. */
function moveParts(model: FlowModel, motion: FlowStep['motion'], delta: number, time: number) {
  for (const spinner of model.spinners) {
    const turning = (motion === 'wheels' && spinner.group !== 'lidar') || (motion === 'lidar' && spinner.group === 'lidar')
    if (turning) spinner.pivot.rotation[spinner.axis] += delta * (spinner.group === 'lidar' ? 5 : 3.2)
  }
  const pan = motion === 'head' ? Math.sin(time * 0.9) * 0.5 : 0
  model.head.rotation.y += (pan - model.head.rotation.y) * Math.min(1, delta * 4)
}

/** How the current is drawn: pulses every PERIOD metres along a path, running at SPEED metres a second. */
const CURRENT = { period: 0.32, speed: 0.42 }
/**
 * One pulse is a stack of dashes that all end at the same front: long and faint
 * at the back, short and solid at the front, with a white-hot core on the very
 * front, so together they read as a spark with a tail fading out behind it.
 */
const PULSE = [
  { length: 0.16, width: 3, opacity: 0.14, white: false },
  { length: 0.09, width: 3, opacity: 0.26, white: false },
  { length: 0.045, width: 3.2, opacity: 0.6, white: false },
  { length: 0.018, width: 3.8, opacity: 1, white: false },
  { length: 0.011, width: 1.5, opacity: 1, white: true },
] as const

type Dashed = { material: { dashOffset: number } }

/** Runs the pulses forward: a smaller dash offset moves the dashes towards the end of the line. */
function runCurrent(layers: (Dashed | null)[], travelled: number) {
  layers.forEach((layer, index) => {
    if (layer) layer.material.dashOffset = -travelled - (PULSE[0].length - PULSE[index].length)
  })
}

/** The receiving end breathes a little, like a contact taking current. */
function breathe(halo: Mesh | null, time: number) {
  if (halo) halo.scale.setScalar(1 + 0.35 * (0.5 + 0.5 * Math.sin(time * 6)))
}

/**
 * One signal path drawn like a thin live wire: a fine line in the signal's
 * colour, and sparks of current with fading tails running along it from the
 * sender to the receiver.
 */
function SignalPath({ curve, color, reduced }: { curve: QuadraticBezierCurve3; color: string; reduced: boolean }) {
  const points = useMemo(() => curve.getPoints(64), [curve])
  const wire = useMemo(() => new Color(color).lerp(new Color('#ffffff'), 0.5), [color])
  const layers = useRef<(Dashed | null)[]>([])
  const halo = useRef<Mesh>(null)
  const travelled = useRef(0)
  useFrame((state, delta) => {
    if (!reduced) travelled.current += delta * CURRENT.speed
    runCurrent(layers.current, travelled.current)
    if (!reduced) breathe(halo.current, state.clock.elapsedTime)
  })
  return (
    <group>
      {/* Solid (not see-through) so the joints between segments do not show as dots. */}
      <Line points={points} color={wire} lineWidth={1.2} depthTest={false} toneMapped={false} renderOrder={10} />
      {PULSE.map((pulse, index) => (
        <Line
          key={index}
          ref={node => { layers.current[index] = node as unknown as Dashed | null }}
          points={points}
          color={pulse.white ? '#ffffff' : color}
          lineWidth={pulse.width}
          dashed
          dashSize={pulse.length}
          gapSize={CURRENT.period - pulse.length}
          transparent
          opacity={pulse.opacity}
          depthTest={false}
          toneMapped={false}
          renderOrder={11 + index}
        />
      ))}
      <mesh position={curve.v0} renderOrder={17}>
        <sphereGeometry args={[0.006, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={curve.v2} renderOrder={17}>
        <sphereGeometry args={[0.014, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={curve.v2} renderOrder={18}>
        <sphereGeometry args={[0.007, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Keeps the camera at its usual distance times the zoom factor, easing there. */
function ZoomRig({ zoom }: { zoom: number }) {
  const controls = useThree(state => state.controls) as unknown as { target: Vector3; update: () => void } | null
  const camera = useThree(state => state.camera)
  const scratch = useMemo(() => new Vector3(), [])
  useFrame((_, delta) => {
    if (!controls) return
    dollyTo(camera.position, controls.target, HOME_DISTANCE * zoom, 1 - Math.exp(-6 * delta), scratch)
    controls.update()
  })
  return null
}

function Robot({ step, reduced }: { step: FlowStep | null; reduced: boolean }) {
  const model = useFlowModel()
  const styled = useRef<FlowStep | null | undefined>(undefined)
  const curves = useMemo(
    () => (step?.links ?? []).flatMap((link, index) => linkCurves(model, link).map((curve, part) => ({ key: `${index}-${part}`, curve, color: signalColor(link.kind) }))),
    [model, step],
  )
  useFrame((state, delta) => {
    if (styled.current !== step) {
      styled.current = step
      styleModel(model, step)
    }
    moveParts(model, reduced ? undefined : step?.motion, delta, state.clock.elapsedTime)
  })
  return (
    <>
      <primitive object={model.root} />
      {curves.map(item => <SignalPath key={item.key} curve={item.curve} color={item.color} reduced={reduced} />)}
    </>
  )
}

/**
 * The robot seen through its casing, with one step of a signal flow drawn
 * on it: the parts that work in the step light up, each link runs as a
 * coloured path with packets travelling along it, and the wheels, the LiDAR
 * or the head move when the step is about them.
 */
export default function RobotFlowViewer({ step, visible = true, reduced = false }: { step: FlowStep | null; visible?: boolean; reduced?: boolean }) {
  const colour = useMemo(() => new Color('#ffffff'), [])
  const stage = useRef<HTMLDivElement>(null)
  const zoom = useZoom(stage)
  return (
    <div className="lp3-flow__zoomable" ref={stage}>
      <Canvas className="lp3-flow__canvas" frameloop={visible ? 'always' : 'never'} shadows dpr={[1, 1.75]} camera={{ position: [...CAMERA.position], fov: 34, near: 0.05, far: 30 }}>
        <hemisphereLight args={[colour, '#8a9aa4', 1.3]} />
        <directionalLight position={[2.5, 4, 3]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2, -2]} intensity={0.7} />
        <Robot step={step} reduced={reduced} />
        <Grid position={[0, -0.001, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.6} cellColor="#9fb0b8" sectionSize={0.5} sectionThickness={1} sectionColor="#7d939d" fadeDistance={6} fadeStrength={2.2} infiniteGrid />
        <ContactShadows position={[0, 0, 0]} opacity={0.3} scale={2.4} blur={2.4} far={1.2} />
        <OrbitControls makeDefault target={[...CAMERA.target]} enablePan={false} enableZoom={false} minPolarAngle={Math.PI * 0.2} maxPolarAngle={Math.PI * 0.49} />
        <ZoomRig zoom={zoom.level} />
      </Canvas>
      <ZoomControls level={zoom.level} onIn={zoom.zoomIn} onOut={zoom.zoomOut} onReset={zoom.reset} />
    </div>
  )
}

useGLTF.preload(MODEL_URL, false, true)
