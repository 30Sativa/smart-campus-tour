import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, PointLight, Quaternion, Vector3 } from 'three'
import type { DriveState } from './drive'
import { CHIP, storyLook } from './story'
import type { DriveWorld } from './worlds/world'
import { seeded } from './worlds/fpt-campus'

/* The scroll story's effects round the robot (the scan itself is drawn on
   the robot's own surface, see robot-rig): lights that set it apart from the
   campus in the opening chapters, then a tunnel of the route ahead with a glowing chip at its end, and every
   signal converging on that chip. All in the robot's own frame (+X its nose,
   +Y up), in metres, so they follow it on any map. */

const CYAN = '#6fe6ff'
const ORANGE = '#ffb347'

/**
 * The opening chapters' lighting, in the robot's own frame (+Z its nose, +X
 * its left): a cool rim light high behind its right picking out its outline
 * against the hazy campus, and a softer kicker from behind its left. Always
 * there (so turning them on costs no shader rebuild), dark outside the story.
 */
export function StageLights({ storyRef }: { storyRef: MutableRefObject<number> }) {
  const rim = useRef<PointLight>(null)
  const kick = useRef<PointLight>(null)
  useFrame(() => {
    const stage = storyLook(storyRef.current).stage
    if (rim.current) rim.current.intensity = stage * 9
    if (kick.current) kick.current.intensity = stage * 2.5
  })
  return (
    <>
      <pointLight ref={rim} position={[-1.1, 1.6, -1.0]} color="#bfefff" intensity={0} decay={2} />
      <pointLight ref={kick} position={[1.4, 1.0, -1.5]} color="#7fd8ff" intensity={0} decay={2} />
    </>
  )
}

const TUNNEL = { from: 4, step: 3, frames: 24, width: 7, height: 4.6 } as const
const CURVES = 90
const SPARKS = 160
const CURVE_STEPS = 24

/** Points of one converging signal: from `start` round to the chip, bowing forward. */
function curvePoints(start: Vector3, chip: Vector3) {
  const control = start.clone().add(chip).multiplyScalar(0.5).add(new Vector3(7, 0, 0))
  return Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
    const t = i / CURVE_STEPS
    const u = 1 - t
    return new Vector3().addScaledVector(start, u * u).addScaledVector(control, 2 * u * t).addScaledVector(chip, t * t)
  })
}

/** Lines from `pairs` of points, coloured from `from` (first point) to `to` (second) as given. */
function lineGeometry(segments: { a: Vector3; b: Vector3; ca: Color; cb: Color }[]) {
  const positions = new Float32Array(segments.length * 6)
  const colors = new Float32Array(segments.length * 6)
  segments.forEach(({ a, b, ca, cb }, i) => {
    positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6)
    colors.set([ca.r, ca.g, ca.b, cb.r, cb.g, cb.b], i * 6)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

function buildScenery() {
  const chip = new Vector3(CHIP.ahead, CHIP.h, 0)
  const cyan = new Color(CYAN)
  const dark = new Color('#0b2a36')
  // The tunnel: square frames down the route, rails along their corners, fading with distance.
  const tunnel: { a: Vector3; b: Vector3; ca: Color; cb: Color }[] = []
  const w = TUNNEL.width / 2
  const top = CHIP.h + TUNNEL.height / 2
  const bottom = Math.max(0.02, CHIP.h - TUNNEL.height / 2)
  const fade = (x: number) => dark.clone().lerp(cyan, Math.max(0.12, 1 - (x - TUNNEL.from) / (TUNNEL.step * TUNNEL.frames)))
  for (let i = 0; i < TUNNEL.frames; i += 1) {
    const x = TUNNEL.from + i * TUNNEL.step
    const c = fade(x)
    const corners = [new Vector3(x, bottom, -w), new Vector3(x, top, -w), new Vector3(x, top, w), new Vector3(x, bottom, w)]
    corners.forEach((corner, k) => tunnel.push({ a: corner, b: corners[(k + 1) % 4], ca: c, cb: c }))
  }
  const end = TUNNEL.from + TUNNEL.step * (TUNNEL.frames - 1)
  for (const [y, z] of [[bottom, -w], [top, -w], [top, w], [bottom, w]] as const) tunnel.push({ a: new Vector3(TUNNEL.from, y, z), b: new Vector3(end, y, z), ca: cyan, cb: dark })
  // Lines on the tunnel floor converging on the chip.
  for (let k = -3; k <= 3; k += 1) tunnel.push({ a: new Vector3(TUNNEL.from, bottom, (k * w) / 3), b: new Vector3(CHIP.ahead, bottom, 0), ca: dark.clone().lerp(cyan, 0.5), cb: dark })
  // The converging signals: curves from all round the chip into it.
  const random = seeded(404)
  const curves: Vector3[][] = []
  const signals: { a: Vector3; b: Vector3; ca: Color; cb: Color }[] = []
  for (let i = 0; i < CURVES; i += 1) {
    const angle = random() * Math.PI * 2
    const radius = 6 + random() * 12
    const start = new Vector3(CHIP.ahead - 4 - random() * 10, CHIP.h + Math.sin(angle) * radius * 0.55, Math.cos(angle) * radius)
    const points = curvePoints(start, chip)
    curves.push(points)
    for (let k = 0; k < CURVE_STEPS; k += 1) {
      const t = k / CURVE_STEPS
      signals.push({ a: points[k], b: points[k + 1], ca: dark.clone().lerp(cyan, t * 0.9 + 0.1), cb: dark.clone().lerp(cyan, (k + 1) / CURVE_STEPS * 0.9 + 0.1) })
    }
  }
  const sparks = Array.from({ length: SPARKS }, () => ({ curve: Math.floor(random() * CURVES), offset: random(), speed: 0.25 + random() * 0.35 }))
  return { tunnel: lineGeometry(tunnel), signals: lineGeometry(signals), curves, sparks, chip }
}

/** Sets how strongly the tunnel and the signals show. */
function fadeLines(materials: { tunnel: LineBasicMaterial; signals: LineBasicMaterial }, tunnel: number, signals: number) {
  materials.tunnel.opacity = tunnel
  materials.signals.opacity = signals
}

const matrix = new Matrix4()
const spot = new Vector3()
const noTurn = new Quaternion()
const size = new Vector3()

/**
 * The route tunnel, the chip and the converging signals, placed ahead of the
 * robot where it stands (it is parked by then). Hidden outside the story's
 * last chapters.
 */
export function StoryScenery({ world, driveRef, storyRef }: { world: DriveWorld; driveRef: MutableRefObject<DriveState>; storyRef: MutableRefObject<number> }) {
  const scenery = useMemo(() => buildScenery(), [])
  const materials = useMemo(() => ({
    tunnel: new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }),
    signals: new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }),
  }), [])
  const tunnel = useMemo(() => new LineSegments(scenery.tunnel, materials.tunnel), [scenery, materials])
  const signals = useMemo(() => new LineSegments(scenery.signals, materials.signals), [scenery, materials])
  const group = useRef<Group>(null)
  const chip = useRef<Mesh>(null)
  const halo = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  const sparks = useRef<InstancedMesh>(null)

  useFrame(state => {
    const look = storyLook(storyRef.current)
    const shown = Math.max(look.tunnel, look.converge)
    if (!group.current) return
    group.current.visible = shown > 0.01
    if (!group.current.visible) return
    const drive = driveRef.current
    const [x, z] = world.toScene(drive)
    group.current.position.set(x, world.floorY, z)
    group.current.rotation.y = -drive.yaw
    group.current.scale.setScalar(world.scale)
    fadeLines(materials, look.tunnel * 0.9, look.converge * 0.75)
    const beat = 0.85 + Math.sin(state.clock.elapsedTime * 4) * 0.15
    ;(chip.current?.material as MeshBasicMaterial | undefined)?.color.set(ORANGE).multiplyScalar(0.6 + shown * 0.6 * beat)
    if (halo.current) {
      halo.current.scale.setScalar((2.2 + look.converge * 1.6) * beat)
      ;(halo.current.material as MeshBasicMaterial).opacity = shown * 0.55
    }
    if (light.current) light.current.intensity = shown * 6 * beat
    const mesh = sparks.current
    if (mesh) {
      mesh.visible = look.converge > 0.05
      scenery.sparks.forEach((spark, i) => {
        const points = scenery.curves[spark.curve]
        const t = (spark.offset + state.clock.elapsedTime * spark.speed) % 1
        const at = t * CURVE_STEPS
        const k = Math.min(CURVE_STEPS - 1, Math.floor(at))
        spot.lerpVectors(points[k], points[k + 1], at - k)
        matrix.compose(spot, noTurn, size.setScalar(0.07 + t * 0.06))
        mesh.setMatrixAt(i, matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      ;(mesh.material as MeshBasicMaterial).opacity = look.converge
    }
  })

  return (
    <group ref={group} visible={false}>
      <primitive object={tunnel} />
      <primitive object={signals} />
      <mesh ref={chip} position={scenery.chip} renderOrder={10}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshBasicMaterial color={ORANGE} fog={false} />
      </mesh>
      <Billboard position={scenery.chip}>
        <mesh ref={halo} renderOrder={11}>
          <circleGeometry args={[0.5, 40]} />
          <meshBasicMaterial color={ORANGE} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} fog={false} />
        </mesh>
      </Billboard>
      <pointLight ref={light} position={scenery.chip} color={ORANGE} intensity={0} distance={30} decay={1.5} />
      <instancedMesh ref={sparks} args={[undefined, undefined, SPARKS]} frustumCulled={false} renderOrder={10}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#e6fbff" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} fog={false} />
      </instancedMesh>
    </group>
  )
}
