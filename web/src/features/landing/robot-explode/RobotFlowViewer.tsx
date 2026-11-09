import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, Html, Line, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, QuadraticBezierCurve3, Vector3 } from 'three'
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

/** The pan-tilt pieces, by node name: the base fixed on the column, and the cradle that tilts with the head. */
const PAN_BASE = 'pantilt__03'
const TILT_PIECES = ['pantilt__05']
/** Height of the tilt shaft, through the middle of the bracket arms (m). */
const TILT_AXIS_Y = 0.978
/** How far the head swings while a step is about it (rad): pan ±34°, tilt ±12°. */
const SWING = { pan: 0.6, tilt: 0.21 }

/** How a node's parts are pinned for a link: one point, one per side (left/right), or one per corner. */
function anchorMode(id: FlowNodeId): 'centre' | 'sides' | 'corners' {
  if (id === 'sonar' || id === 'sr04t') return 'corners'
  if (id === 'driver' || id === 'motor' || id === 'drv') return 'sides'
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
    for (const [group, axis] of [['wheel', 'x'], ['lidar', 'y']] as const) {
      for (const { mesh, centre } of meshes.get(group) ?? []) spinners.push({ pivot: pivotAt(centre, [mesh]), axis, group })
    }
    // The pan-tilt head: its base stays on the column; everything above it pans about the
    // column's vertical axis, and the cradle with the head and headset tilts (nods) about
    // a sideways axis through the bracket arms.
    const column = meshes.get('column')?.[0]?.centre ?? new Vector3()
    const pantilt = meshes.get('pantilt') ?? []
    const tilting = [
      ...pantilt.filter(item => TILT_PIECES.includes(item.mesh.name)),
      ...(['head', 'quest'] as const).flatMap(group => meshes.get(group) ?? []),
    ].map(item => item.mesh)
    const panning = pantilt.filter(item => item.mesh.name !== PAN_BASE && !TILT_PIECES.includes(item.mesh.name)).map(item => item.mesh)
    const panCentre = new Vector3(column.x, 0, column.z)
    const tiltCentre = new Vector3(column.x, TILT_AXIS_Y, column.z)
    const head = pivotAt(panCentre, panning)
    const tilt = pivotAt(tiltCentre, tilting)
    head.add(tilt)
    tilt.position.sub(panCentre)

    const anchors = (id: FlowNodeId): Vector3[] => {
      if (id === 'cloud') return [CLOUD]
      const node = flowNode(id)
      const items = (meshes.get(node.part!) ?? []).filter(item => !node.pieces || node.pieces.includes(item.mesh.name))
      const mode = anchorMode(id)
      const buckets = new Map<string, Vector3[]>()
      for (const { centre } of items) {
        const key = mode === 'centre' ? 'c' : mode === 'sides' ? (centre.x < 0 ? 'L' : 'R') : `${centre.x < 0 ? 'L' : 'R'}${centre.z < 0 ? 'B' : 'F'}`
        buckets.set(key, [...(buckets.get(key) ?? []), centre])
      }
      return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, points]) => points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length))
    }
    /** Height of the middle of a group's parts, as built. */
    const heightOf = (group: PartGroupId) => {
      const items = meshes.get(group) ?? []
      return items.length ? items.reduce((sum, item) => sum + item.centre.y, 0) / items.length : null
    }
    const wheels = spinners.filter(spinner => spinner.group === 'wheel').map(spinner => spinner.pivot)
    return { root, materials, spinners, wheels, head, tilt, panCentre, tiltCentre, anchors, heightOf }
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
    // Working drive wheels stay solid dark tyres, so the coloured aura round them reads.
    const tyre = group === 'wheel' && colour
    material.emissive.set(tyre ? '#000000' : colour ?? '#000000')
    material.emissiveIntensity = colour && !tyre ? 0.55 : 0
  }
}

/**
 * Spins the LiDAR or swings the head on both of its axes when the step is about
 * them (the head eases back otherwise); the drive wheels turn at `drive`
 * (0 still … 1 full speed), which rises once the current reaches the motors.
 */
function moveParts(model: FlowModel, motion: FlowStep['motion'], delta: number, time: number, drive: number) {
  for (const spinner of model.spinners) {
    if (spinner.group === 'wheel') spinner.pivot.rotation.x += delta * WHEEL_SPIN * drive
    else if (motion === 'lidar') spinner.pivot.rotation[spinner.axis] += delta * 5
  }
  const swinging = motion === 'head'
  const pan = swinging ? Math.sin(time * 0.9) * SWING.pan : 0
  const tilt = swinging ? Math.sin(time * 1.5 + 0.8) * SWING.tilt : 0
  const ease = Math.min(1, delta * 4)
  model.head.rotation.y += (pan - model.head.rotation.y) * ease
  model.tilt.rotation.x += (tilt - model.tilt.rotation.x) * ease
}

/** Keeps the tilt-axis marker on the tilt shaft as the head pans, and turns each axis's arrow ring with its motor. */
function followAxes(model: FlowModel, tiltAxis: Group | null, panRing: Group | null, tiltRing: Group | null) {
  if (tiltAxis) tiltAxis.rotation.y = model.head.rotation.y
  if (panRing) panRing.rotation.y = model.head.rotation.y
  if (tiltRing) tiltRing.rotation.x = model.tilt.rotation.x
}

/** Axis markers are drawn in the see-through pass after the parts (which are all transparent materials), so they stay on top. */
const AXIS_COLOUR = '#0f5b66'

/** Turning speed of the drive wheels at full speed (rad/s); positive rolls the robot forwards (+z, where the headset looks). */
const WHEEL_SPIN = 3.4
/** How the drive wheels' aura is laid out: speed arcs round the tyre, streaks on the floor behind, chevrons ahead. */
const AURA = { arcs: [{ radius: 0.118, width: 0.005, opacity: 0.9 }, { radius: 0.142, width: 0.0035, opacity: 0.5 }], streaks: 5, chevrons: 3 } as const

type AuraParts = { arcs: (Group | null)[]; halos: (Mesh | null)[]; streaks: (Mesh | null)[]; chevrons: (Mesh | null)[] }

function fade(mesh: Mesh | null, opacity: number) {
  if (mesh) (mesh.material as MeshBasicMaterial).opacity = opacity
}

/**
 * Moves the aura with the wheels: the arcs turn with the tyre, the halo
 * breathes, streaks slide back along the floor and chevrons slide forward,
 * everything as strong as the wheels are fast.
 */
function runAura(model: FlowModel, parts: AuraParts, time: number, drive: number) {
  parts.arcs.forEach((arc, index) => { if (arc) arc.rotation.x = (model.wheels[Math.floor(index / AURA.arcs.length)]?.rotation.x ?? 0) * (index % 2 ? 0.8 : 1) })
  parts.arcs.forEach(arc => arc?.children.forEach(child => fade(child as Mesh, (child.userData.opacity as number) * drive)))
  parts.halos.forEach(halo => {
    fade(halo, (0.1 + 0.06 * Math.sin(time * 5)) * drive)
    halo?.scale.setScalar(1 + 0.06 * Math.sin(time * 5))
  })
  parts.streaks.forEach((streak, index) => {
    if (!streak) return
    const phase = (time * 1.1 * drive + (index % AURA.streaks) / AURA.streaks + (index % 3) * 0.13) % 1
    streak.position.z = -0.06 - phase * 0.34
    fade(streak, Math.sin(phase * Math.PI) * 0.7 * drive)
  })
  parts.chevrons.forEach((chevron, index) => {
    if (!chevron) return
    const phase = (time * 0.7 + (index % AURA.chevrons) / AURA.chevrons) % 1
    chevron.position.z = 0.08 + phase * 0.3
    fade(chevron, Math.sin(phase * Math.PI) * 0.85 * drive)
  })
}

/**
 * A moving aura round each drive wheel, shown once the current reaches the
 * motors: glowing speed arcs turning with the tyre over a soft halo, light
 * streaks running back along the floor and chevrons running ahead, so the
 * robot is seen to drive forward.
 */
function WheelAura({ model, color, drive }: { model: FlowModel; color: string; drive: { current: number } }) {
  const parts = useRef<AuraParts>({ arcs: [], halos: [], streaks: [], chevrons: [] })
  useFrame(state => runAura(model, parts.current, state.clock.elapsedTime, drive.current))
  return (
    <>
      {model.wheels.map((wheel, side) => {
        const out = wheel.position.x < 0 ? -1 : 1
        return (
          <group key={side} position={wheel.position}>
            {AURA.arcs.map((arc, layer) => (
              <group key={layer} ref={node => { parts.current.arcs[side * AURA.arcs.length + layer] = node }}>
                {[0, 1, 2].map(index => (
                  <mesh key={index} rotation={[0, Math.PI / 2, ((index + layer * 0.5) * Math.PI * 2) / 3]} userData={{ opacity: arc.opacity }} renderOrder={21}>
                    <torusGeometry args={[arc.radius, arc.width, 8, 48, Math.PI * (layer ? 0.3 : 0.42)]} />
                    <meshBasicMaterial color={layer ? '#ffffff' : color} transparent opacity={0} depthTest={false} toneMapped={false} />
                  </mesh>
                ))}
              </group>
            ))}
            <mesh ref={node => { parts.current.halos[side] = node }} position={[out * 0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]} renderOrder={20}>
              <ringGeometry args={[0.09, 0.15, 48]} />
              <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} toneMapped={false} side={2} />
            </mesh>
            {Array.from({ length: AURA.streaks }, (_, index) => (
              <mesh
                key={`s${index}`}
                ref={node => { parts.current.streaks[side * AURA.streaks + index] = node }}
                position={[out * (0.005 + (index - 2) * 0.012), 0.002 - wheel.position.y, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                renderOrder={20}
              >
                <planeGeometry args={[0.005, 0.09 + (index % 2) * 0.05]} />
                <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} toneMapped={false} side={2} />
              </mesh>
            ))}
            {Array.from({ length: AURA.chevrons }, (_, index) => (
              <mesh
                key={`c${index}`}
                ref={node => { parts.current.chevrons[side * AURA.chevrons + index] = node }}
                position={[0, 0.003 - wheel.position.y, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                renderOrder={20}
              >
                <ringGeometry args={[0.026, 0.04, 3, 1, Math.PI / 6, (Math.PI * 2) / 3]} />
                <meshBasicMaterial color={color} transparent opacity={0} depthTest={false} toneMapped={false} side={2} />
              </mesh>
            ))}
          </group>
        )
      })}
    </>
  )
}

/** Ultrasound: arcs leaving each sensor head outwards, and fainter echoes coming back. */
const WAVES = { count: 3, arc: Math.PI * 0.45, reach: 0.34, period: 1.4 } as const

function runWaves(waves: (Mesh | null)[], time: number) {
  waves.forEach((wave, index) => {
    if (!wave) return
    const echo = index % (WAVES.count * 2) >= WAVES.count
    const phase = (time / WAVES.period + (index % WAVES.count) / WAVES.count) % 1
    const distance = echo ? 1 - phase : phase
    wave.scale.set(0.15 + distance, 0.15 + distance, 1)
    fade(wave, (echo ? 0.35 : 0.85) * Math.sin(phase * Math.PI))
  })
}

/** Sound waves from the four ultrasonic heads, while the step is about them. */
function SonarWaves({ model, color }: { model: FlowModel; color: string }) {
  const waves = useRef<(Mesh | null)[]>([])
  useFrame(state => runWaves(waves.current, state.clock.elapsedTime))
  const heads = useMemo(() => model.anchors('sonar'), [model])
  return (
    <>
      {heads.map((head, sensor) => (
        <group key={sensor} position={head} rotation={[0, Math.atan2(-head.z, head.x), 0]}>
          {Array.from({ length: WAVES.count * 2 }, (_, index) => (
            <mesh key={index} ref={node => { waves.current[sensor * WAVES.count * 2 + index] = node }} rotation={[-Math.PI / 2, 0, -WAVES.arc / 2]} renderOrder={21}>
              <torusGeometry args={[WAVES.reach, index >= WAVES.count ? 0.006 : 0.009, 8, 32, WAVES.arc]} />
              <meshBasicMaterial color={index >= WAVES.count ? '#ffffff' : color} transparent opacity={0} depthTest={false} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

/** A ring of arrow heads round an axis, showing which way the motor turns it. */
function TurnRing({ radius, axis }: { radius: number; axis: 'x' | 'y' }) {
  const turn = axis === 'y' ? [Math.PI / 2, 0, 0] as const : [0, Math.PI / 2, 0] as const
  return (
    <group rotation={turn}>
      <mesh renderOrder={20}>
        <torusGeometry args={[radius, 0.0035, 8, 64, Math.PI * 1.6]} />
        <meshBasicMaterial color={AXIS_COLOUR} transparent opacity={0.85} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[radius, 0, 0]} rotation={[0, 0, 0]} renderOrder={20}>
        <coneGeometry args={[0.012, 0.03, 12]} />
        <meshBasicMaterial color={AXIS_COLOUR} transparent depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * The two motor shafts of the pan-tilt head, drawn as axes through the head:
 * the pan axis stands up the column, the tilt axis runs sideways through the
 * bracket arms and turns with the pan. Each carries a ring turning with its
 * motor and a label.
 */
function PanTiltAxes({ model }: { model: FlowModel }) {
  const tiltAxis = useRef<Group>(null)
  const panRing = useRef<Group>(null)
  const tiltRing = useRef<Group>(null)
  useFrame(() => followAxes(model, tiltAxis.current, panRing.current, tiltRing.current))
  const { panCentre, tiltCentre } = model
  return (
    <>
      <group position={[panCentre.x, 0, panCentre.z]}>
        <Line points={[[0, 0.83, 0], [0, 1.42, 0]]} color={AXIS_COLOUR} lineWidth={2.2} dashed dashSize={0.024} gapSize={0.012} transparent opacity={0.95} depthTest={false} toneMapped={false} renderOrder={19} />
        <group ref={panRing} position={[0, 0.925, 0]}><TurnRing radius={0.105} axis="y" /></group>
        <Html position={[0, 1.44, 0]} center zIndexRange={[5, 0]} className="lp3-flow__axis-label">Trục pan</Html>
      </group>
      <group ref={tiltAxis} position={[tiltCentre.x, tiltCentre.y, tiltCentre.z]}>
        <Line points={[[-0.17, 0, 0], [0.17, 0, 0]]} color={AXIS_COLOUR} lineWidth={2.2} dashed dashSize={0.024} gapSize={0.012} transparent opacity={0.95} depthTest={false} toneMapped={false} renderOrder={19} />
        <group ref={tiltRing} position={[0.12, 0, 0]}><TurnRing radius={0.05} axis="x" /></group>
        <Html position={[0.25, 0, 0]} center zIndexRange={[5, 0]} className="lp3-flow__axis-label">Trục tilt</Html>
      </group>
    </>
  )
}

/** How the current is drawn: pulses every PERIOD metres along a path, running at SPEED metres a second. */
const CURRENT = { period: 0.32, speed: 0.42 }
/** Segments each signal path is drawn with. */
const SEGMENTS = 64
/**
 * One pulse is a stack of dashes that all end at the same front: long and faint
 * at the back, short and solid at the front, with a white-hot core on the very
 * front, so together they read as a spark with a tail fading out behind it.
 */
const PULSE = [
  { length: 0.17, width: 4.2, opacity: 0.14, white: false },
  { length: 0.1, width: 4.2, opacity: 0.26, white: false },
  { length: 0.05, width: 4.6, opacity: 0.6, white: false },
  { length: 0.02, width: 5.4, opacity: 1, white: false },
  { length: 0.013, width: 2.2, opacity: 1, white: true },
] as const

type Dashed = { material: { dashOffset: number } }

type Clipped = { geometry: { instanceCount: number } }

/**
 * Runs the current forward. `front` is how far it has got along the path (m):
 * the wire is drawn only up to there, the leading spark sits right at it, and
 * once the front has reached the end the sparks keep coming at a steady pace.
 * (A smaller dash offset moves the dashes towards the end of the line.)
 */
function runCurrent(wire: Clipped | null, layers: (Dashed | null)[], front: number, length: number, segments: number) {
  const reached = Math.max(0, Math.min(1, front / length))
  const drawn = Math.ceil(reached * segments)
  if (wire) wire.geometry.instanceCount = drawn
  layers.forEach((layer, index) => {
    if (!layer) return
    const clipped = layer as unknown as Clipped
    layer.material.dashOffset = PULSE[index].length - front
    clipped.geometry.instanceCount = drawn
  })
}

/** The receiving end breathes a little, like a contact taking current; hidden until the current gets there (`time` null). */
function breathe(halo: Mesh | null, time: number | null) {
  if (!halo) return
  halo.visible = time !== null
  if (time !== null) halo.scale.setScalar(1 + 0.35 * (0.5 + 0.5 * Math.sin(time * 6)))
}

/**
 * One signal path drawn like a thin live wire: a fine line in the signal's
 * colour, and sparks of current with fading tails running along it from the
 * sender to the receiver.
 */
function SignalPath({ curve, color, lead }: {
  curve: QuadraticBezierCurve3
  color: string
  /** Length of the chain before this path (m): the current sets off along it only when it has run that far. */
  lead: number
}) {
  const points = useMemo(() => curve.getPoints(SEGMENTS), [curve])
  const length = useMemo(() => curve.getLength(), [curve])
  const wireColour = useMemo(() => new Color(color).lerp(new Color('#ffffff'), 0.5), [color])
  const wire = useRef<Clipped | null>(null)
  const layers = useRef<(Dashed | null)[]>([])
  const halo = useRef<Mesh>(null)
  const travelled = useRef(0)
  useFrame((state, delta) => {
    travelled.current += delta * CURRENT.speed
    const front = travelled.current - lead
    runCurrent(wire.current, layers.current, front, length, SEGMENTS)
    breathe(halo.current, front >= length ? state.clock.elapsedTime : null)
  })
  return (
    <group>
      {/* Solid (not see-through) so the joints between segments do not show as dots. */}
      <Line ref={node => { wire.current = node as unknown as Clipped | null }} points={points} color={wireColour} lineWidth={1.9} depthTest={false} toneMapped={false} renderOrder={10} />
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
        <sphereGeometry args={[0.008, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={curve.v2} renderOrder={17}>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={curve.v2} renderOrder={18}>
        <sphereGeometry args={[0.009, 12, 12]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Shifts the camera and what it looks at together, easing `target` towards `goal` by `blend`. */
function slideTo(position: Vector3, target: Vector3, goal: Vector3, blend: number, scratch: Vector3) {
  scratch.subVectors(goal, target).multiplyScalar(blend)
  target.add(scratch)
  position.add(scratch)
}

/** Where the camera looks for a step: up the column, halfway towards the middle of the parts that work in it. */
function stepFocus(model: FlowModel, step: FlowStep | null) {
  const heights = (step ? stepParts(step) : []).map(model.heightOf).filter((height): height is number => height !== null)
  const middle = heights.length ? heights.reduce((sum, height) => sum + height, 0) / heights.length : CAMERA.target[1]
  return new Vector3(CAMERA.target[0], CAMERA.target[1] + (middle - CAMERA.target[1]) * 0.55, CAMERA.target[2])
}

/** Keeps the camera on the step's parts, at its usual distance times the zoom factor, easing there. */
function ZoomRig({ zoom, focus }: { zoom: number; focus: Vector3 }) {
  const controls = useThree(state => state.controls) as unknown as { target: Vector3; update: () => void } | null
  const camera = useThree(state => state.camera)
  const scratch = useMemo(() => new Vector3(), [])
  useFrame((_, delta) => {
    if (!controls) return
    const blend = 1 - Math.exp(-4 * delta)
    slideTo(camera.position, controls.target, focus, blend, scratch)
    dollyTo(camera.position, controls.target, HOME_DISTANCE * zoom, blend, scratch)
    controls.update()
  })
  return null
}

/**
 * The curves of a step's links. A link that starts where the one before it
 * ended (sonar → STM32 → mini PC) carries on its current, so sparks run the
 * whole chain in one go.
 */
function chainCurves(model: FlowModel, step: FlowStep | null) {
  let lead = 0
  let end: FlowNodeId | null = null
  return (step?.links ?? []).flatMap((link, index) => {
    const curves = linkCurves(model, link)
    if (link.from !== end) lead = 0
    const start = lead
    lead += curves[0]?.getLength() ?? 0
    end = link.to
    return curves.map((curve, part) => ({
      key: `${step!.title}-${index}-${part}`,
      curve,
      color: signalColor(link.kind),
      lead: start,
      /** Seconds after the step starts when the current reaches the end of this path. */
      arrives: (start + curve.getLength()) / CURRENT.speed,
      link,
    }))
  })
}

/** When (seconds into the step) a command first reaches the drive motors, or null if it never does. */
function motorsStartAt(curves: ReturnType<typeof chainCurves>) {
  const times = curves.filter(item => item.link.to === 'motor' && item.link.kind === 'command').map(item => item.arrives)
  return times.length ? Math.min(...times) : null
}

/** Eases the drive wheels' speed (0…1) up once the current has reached the motors, and down otherwise. */
function easeDrive(drive: { current: number }, on: boolean, delta: number) {
  drive.current += ((on ? 1 : 0) - drive.current) * Math.min(1, delta * 2.2)
}

function Robot({ step, zoom }: { step: FlowStep | null; zoom: number }) {
  const model = useFlowModel()
  const focus = useMemo(() => stepFocus(model, step), [model, step])
  const styled = useRef<FlowStep | null | undefined>(undefined)
  const curves = useMemo(() => chainCurves(model, step), [model, step])
  const motorsAt = useMemo(() => motorsStartAt(curves), [curves])
  const started = useRef(0)
  const drive = useRef(0)
  useFrame((state, delta) => {
    const time = state.clock.elapsedTime
    if (styled.current !== step) {
      styled.current = step
      started.current = time
      styleModel(model, step)
    }
    easeDrive(drive, step?.motion === 'wheels' && motorsAt !== null && time - started.current >= motorsAt, delta)
    moveParts(model, step?.motion, delta, time, drive.current)
  })
  return (
    <>
      <primitive object={model.root} />
      {curves.map(item => <SignalPath key={item.key} curve={item.curve} color={item.color} lead={item.lead} />)}
      <WheelAura model={model} color={signalColor(step?.links[0].kind ?? 'command')} drive={drive} />
      {step?.motion === 'sonar' && <SonarWaves model={model} color={signalColor('feedback')} />}
      {step?.motion === 'head' && <PanTiltAxes model={model} />}
      <ZoomRig zoom={zoom} focus={focus} />
    </>
  )
}

/**
 * The robot seen through its casing, with one step of a signal flow drawn
 * on it: the parts that work in the step light up, each link runs as a
 * coloured path with current running along it, and the wheels, the LiDAR
 * or the pan-tilt head (with its two motor axes drawn) move when the step is
 * about them. Signals and moving parts are what this view explains, so they
 * keep moving even when the system asks for reduced motion.
 */
export default function RobotFlowViewer({ step, visible = true }: { step: FlowStep | null; visible?: boolean }) {
  const colour = useMemo(() => new Color('#ffffff'), [])
  const stage = useRef<HTMLDivElement>(null)
  const zoom = useZoom(stage)
  return (
    <div className="lp3-flow__zoomable" ref={stage}>
      <Canvas className="lp3-flow__canvas" frameloop={visible ? 'always' : 'never'} shadows dpr={[1, 1.75]} camera={{ position: [...CAMERA.position], fov: 34, near: 0.05, far: 30 }}>
        <hemisphereLight args={[colour, '#8a9aa4', 1.3]} />
        <directionalLight position={[2.5, 4, 3]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2, -2]} intensity={0.7} />
        <Robot step={step} zoom={zoom.level} />
        <Grid position={[0, -0.001, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.6} cellColor="#9fb0b8" sectionSize={0.5} sectionThickness={1} sectionColor="#7d939d" fadeDistance={6} fadeStrength={2.2} infiniteGrid />
        <ContactShadows position={[0, 0, 0]} opacity={0.3} scale={2.4} blur={2.4} far={1.2} />
        <OrbitControls makeDefault target={[...CAMERA.target]} enablePan={false} enableZoom={false} minPolarAngle={Math.PI * 0.2} maxPolarAngle={Math.PI * 0.49} />
      </Canvas>
      <ZoomControls level={zoom.level} onIn={zoom.zoomIn} onOut={zoom.zoomOut} onReset={zoom.reset} />
    </div>
  )
}

useGLTF.preload(MODEL_URL, false, true)
