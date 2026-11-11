import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Quaternion, RingGeometry, Vector3, type Camera } from 'three'
import { Expand, Pause, Play, Shrink, X } from 'lucide-react'
import { PART_GROUPS, explodeOffset, groupOfNode, orderMoves, pairMoves, partGroup, planAssembly, stepApart, stepAt, type PartGroupId, type Step, type Vec3 } from './parts'
import WheelAura from './WheelAura'
import ZoomControls from './ZoomControls'
import { useZoom } from './zoom'

export const ROBOT_EXPLODE_URL = `${import.meta.env.BASE_URL}models/robot/campus-amr-explode.glb`

/** Seconds one ordinary move takes to go on (or come off); the whole robot takes the sum of its moves' turns. */
const SECONDS_PER_TURN = 0.5
/** Auto cycle: assembled, apart, assembled; seconds. */
/** Assembled long enough to see it drive and look around. */
const CYCLE = { holdTogether: 9, holdApart: 2.5 }
const GLOW = new Color('#8fcf4a')
/** Where the camera looks when no part is picked: the middle of the robot, put together or apart. */
const HOME = { together: { y: 0.62, distance: 3.1 }, apart: { y: 1.3, distance: 5.6 } }
const HOME_TARGET = new Vector3(0, HOME.apart.y, 0)
/** Camera distance from one picked part. */
const PICKED_DISTANCE = 2.1

type Piece = { mesh: Mesh; group: PartGroupId; base: Vector3; home: Vector3; offset: Vector3; step: Step | undefined }
/** What turns with the head, about the column's axis; the base plate of the pan-tilt stays put. */
const HEAD_PIECES = new Set<PartGroupId>(['pantilt', 'head', 'quest'])
const HEAD_BASE = 'pantilt__03'
/** One unit's way out of the robot: from its home along its offset, as far as its step has taken it. */
type Leader = { home: Vector3; offset: Vector3; step: Step | undefined }

function usePieces() {
  const { scene } = useGLTF(ROBOT_EXPLODE_URL, false, true)
  return useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const materials = new Map<PartGroupId, MeshStandardMaterial>()
    const glow = new Map<PartGroupId, MeshStandardMaterial>()
    for (const group of PART_GROUPS) {
      const material = new MeshStandardMaterial({ color: group.color, metalness: group.metalness, roughness: group.roughness })
      materials.set(group.id, material)
      glow.set(group.id, Object.assign(material.clone(), { emissive: GLOW.clone(), emissiveIntensity: 0.45 }))
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
    const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z]
    const units = [...boxes.values()].map(unit => ({ ...unit, centre: vec(unit.box.getCenter(new Vector3())), size: vec(unit.box.getSize(new Vector3())) }))

    // A move is what goes on at once: a unit with its mirror twin, all the screws, or a unit on its own.
    // Pairs take their place in the order from their right-hand piece.
    const moves = orderMoves(pairMoves(units).map(members => ({
      group: members[0].group,
      members,
      centre: members.reduce((right, unit) => (unit.centre[0] > right.centre[0] ? unit : right)).centre,
    })))
    const count: Partial<Record<PartGroupId, number>> = {}
    for (const move of moves) count[move.group] = (count[move.group] ?? 0) + 1
    const plan = planAssembly(count)
    const taken = new Map<PartGroupId, number>()
    const pieces: Piece[] = []
    const leaders: Leader[] = []
    for (const move of moves) {
      const index = taken.get(move.group) ?? 0
      taken.set(move.group, index + 1)
      const step = plan.steps.get(move.group)?.[index]
      for (const unit of move.members) {
        // Each piece of a pair leaves towards its own side.
        const offset = new Vector3(...explodeOffset(partGroup(unit.group).explode, unit.centre))
        for (const mesh of unit.meshes) pieces.push({ mesh, group: unit.group, base: mesh.position.clone(), home: new Box3().setFromObject(mesh).getCenter(new Vector3()), offset, step })
        leaders.push({ home: new Vector3(...unit.centre), offset, step })
      }
    }
    const counts = new Map<PartGroupId, number>()
    pieces.forEach(piece => counts.set(piece.group, (counts.get(piece.group) ?? 0) + 1))
    const column = pieces.find(piece => piece.group === 'column')?.home ?? new Vector3()
    const panAxis = new Vector3(column.x, 0, column.z)
    const wheelCentres = pieces.filter(piece => piece.group === 'wheel').map(piece => piece.home)
    return { root, pieces, leaders, materials, glow, counts, panAxis, wheelCentres, steps: plan.steps, seconds: plan.turns * SECONDS_PER_TURN }
  }, [scene])
}

type Model = ReturnType<typeof usePieces>

/** Moves every piece to where it is at `progress` (0 assembled, 1 apart); the move under way glows. */
function placePieces(model: Model, progress: number, moving: Step | null) {
  for (const piece of model.pieces) {
    piece.mesh.position.copy(piece.base).addScaledVector(piece.offset, stepApart(progress, piece.step))
    piece.mesh.material = (moving && piece.step === moving ? model.glow : model.materials).get(piece.group)!
  }
}

const scratch = new Box3()
const toCamera = new Vector3()

/** Eases the orbit `target` to `goal` and the camera to `distance` from it, keeping the viewing direction. */
function followCamera(position: Vector3, target: Vector3, goal: Vector3, distance: number, blend: number) {
  toCamera.subVectors(position, target)
  const current = toCamera.length()
  target.lerp(goal, blend)
  toCamera.setLength(current + (distance - current) * blend)
  position.copy(target).add(toCamera)
}

/** Current centre of one group's parts, written into `out`. */
function groupCentre(model: Model, group: PartGroupId, out: Vector3) {
  const box = new Box3()
  for (const piece of model.pieces) if (piece.group === group) box.union(scratch.setFromObject(piece.mesh))
  return box.isEmpty() ? null : box.getCenter(out)
}

/** Lights up the focused groups; everything else fades so the parts inside the body show. */
function styleParts(model: Model, highlight: readonly PartGroupId[], hovered: PartGroupId | null) {
  const focus = new Set(highlight)
  for (const [group, material] of model.materials) {
    const dim = focus.size > 0 && !focus.has(group)
    if (material.transparent !== dim) material.needsUpdate = true
    material.transparent = dim
    material.opacity = dim ? 0.1 : 1
    material.depthWrite = !dim
    material.emissive.copy(GLOW)
    material.emissiveIntensity = focus.has(group) ? 0.55 : hovered === group ? 0.25 : 0
  }
}

/* ---------- Effects: snap flashes, a scan ring, an idle drive and a fly-in. ---------- */

const FLASHES = 8
const FLASH_SECONDS = 0.65
const SCAN = { radius: 0.52, height: 1.42, rise: 2.4, rest: 3.2 } as const

/** The effect objects, made once and moved every frame. */
function makeEffects() {
  // Rings that flash where a part snaps into place.
  const flashes = Array.from({ length: FLASHES }, () => {
    const ring = new Mesh(new RingGeometry(0.05, 0.062, 40), new MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: DoubleSide }))
    ring.renderOrder = 30
    ring.visible = false
    return { ring, age: Infinity }
  })

  // A light ring sweeping up the assembled robot, like a scanner checking the build.
  const scan = new Mesh(new RingGeometry(SCAN.radius, SCAN.radius + 0.012, 96), new MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }))
  scan.rotation.x = -Math.PI / 2
  scan.renderOrder = 6
  const group = new Group()
  group.add(scan, ...flashes.map(flash => flash.ring))
  return { group, flashes, scan, scanClock: 0, lastMoving: null as Step | null, idle: 0, idleClock: 0, wheelAngle: 0 }
}

type Effects = ReturnType<typeof makeEffects>

/** How the head looks around while the robot stands idle: [seconds into the cycle, pan in rad], eased between. */
const LOOK_AROUND: readonly [number, number][] = [[0, 0], [2.2, 0], [3.2, 0.6], [4.4, 0.6], [5.6, -0.45], [6.6, -0.45], [7.6, 0], [9, 0]]
const IDLE_WHEEL_SPIN = 3.4

function lookAround(time: number) {
  const t = time % LOOK_AROUND[LOOK_AROUND.length - 1][0]
  const next = LOOK_AROUND.findIndex(([at]) => at > t)
  const [a, from] = LOOK_AROUND[next - 1]
  const [b, to] = LOOK_AROUND[next]
  const k = (t - a) / (b - a)
  return from + (to - from) * k * k * (3 - 2 * k)
}

const turn = new Quaternion()
const pivot = new Vector3()
const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)

/**
 * While the robot stands assembled with nothing to do, it "drives": the drive
 * wheels turn on their axles and now and then the head looks left and right.
 * `idle` eases in and out, so the head turns back before the robot comes apart.
 */
function runIdle(model: Model, effects: Effects, idle: boolean, delta: number) {
  effects.idle += ((idle ? 1 : 0) - effects.idle) * Math.min(1, delta * 2.5)
  effects.idleClock = idle ? effects.idleClock + delta : 0
  effects.wheelAngle += delta * IDLE_WHEEL_SPIN * effects.idle
  const pan = lookAround(effects.idleClock) * effects.idle
  for (const piece of model.pieces) {
    const wheel = piece.group === 'wheel'
    if (!wheel && !HEAD_PIECES.has(piece.group)) continue
    if (piece.mesh.name === HEAD_BASE) continue
    // Turn about an axis through `pivot`: the wheel's own axle, or the column for the head.
    if (wheel) turn.setFromAxisAngle(X_AXIS, effects.wheelAngle)
    else turn.setFromAxisAngle(Y_AXIS, pan)
    pivot.copy(wheel ? piece.home : model.panAxis)
    piece.mesh.quaternion.copy(turn)
    piece.mesh.position.add(pivot).sub(pivot.applyQuaternion(turn))
  }
}

/** Notes the move under way; when one has just finished going on (while assembling), its units flash. */
function trackMoves(model: Model, effects: Effects, moving: Step | null, assembling: boolean) {
  if (effects.lastMoving && effects.lastMoving !== moving && assembling) snap(model, effects, effects.lastMoving)
  effects.lastMoving = moving
}

/** Starts a flash on every unit of a move that has just been put in place. */
function snap(model: Model, effects: Effects, step: Step) {
  for (const leader of model.leaders) {
    if (leader.step !== step) continue
    const free = effects.flashes.find(flash => flash.age >= FLASH_SECONDS) ?? effects.flashes[0]
    free.age = 0
    free.ring.position.copy(leader.home)
    free.ring.visible = true
  }
}

/** Grows and fades the flashes, turned to face the camera. */
function runFlashes(effects: Effects, camera: Camera, delta: number) {
  for (const flash of effects.flashes) {
    if (!flash.ring.visible) continue
    flash.age += delta
    const t = flash.age / FLASH_SECONDS
    if (t >= 1) { flash.ring.visible = false; continue }
    flash.ring.quaternion.copy(camera.quaternion)
    flash.ring.scale.setScalar(0.6 + t * 2.4)
    const material = flash.ring.material as MeshBasicMaterial
    material.opacity = (1 - t) * 0.95
  }
}

/** Sweeps the scan ring up the robot every few seconds while it stands assembled. */
function runScan(effects: Effects, progress: number, delta: number, enabled: boolean) {
  const material = effects.scan.material as MeshBasicMaterial
  if (!enabled || progress > 0.02) {
    effects.scanClock = 0
    material.opacity = 0
    return
  }
  effects.scanClock = (effects.scanClock + delta) % (SCAN.rise + SCAN.rest)
  const t = effects.scanClock / SCAN.rise
  if (t >= 1) { material.opacity = 0; return }
  effects.scan.position.y = 0.02 + t * SCAN.height
  material.opacity = Math.sin(t * Math.PI) * 0.75
}

/** Put together, taken apart, looping between the two, or held where it is (while a part is being looked at). */
type Mode = 'together' | 'apart' | 'auto' | 'hold'

function Robot({ model, mode, visible, highlight, hovered, zoom, onHover, onPick }: {
  model: Model
  mode: Mode
  /** False while the section is scrolled away and no frames are drawn. */
  visible: boolean
  highlight: readonly PartGroupId[]
  hovered: PartGroupId | null
  /** Factor on the camera distance, from the zoom buttons or a pinch. */
  zoom: number
  onHover: (group: PartGroupId | null) => void
  onPick: (group: PartGroupId) => void
}) {
  const progress = useRef(0)
  const clock = useRef(0)
  const styled = useRef('')
  const aim = useRef(new Vector3())
  const resumed = useRef(true)
  const controls = useThree(state => state.controls) as unknown as { target: Vector3; update: () => void } | null
  const camera = useThree(state => state.camera)
  const effects = useMemo(() => makeEffects(), [])

  useEffect(() => { clock.current = 0 }, [mode])
  // No frames are drawn while the section is away, so the first one back would span the whole pause.
  useEffect(() => { if (visible) resumed.current = true }, [visible])

  useFrame((_, frameDelta) => {
    const delta = resumed.current ? 0 : frameDelta
    resumed.current = false
    let target = mode === 'apart' ? 1 : mode === 'hold' ? progress.current : 0
    if (mode === 'auto') {
      clock.current += delta
      const cycle = 2 * model.seconds + CYCLE.holdTogether + CYCLE.holdApart
      const t = clock.current % cycle
      target = t > CYCLE.holdTogether && t < CYCLE.holdTogether + model.seconds + CYCLE.holdApart ? 1 : 0
    }
    // Reduced motion turns off the loop and the turntable, not the moves a visitor asks for with a button.
    const step = delta / model.seconds
    const before = progress.current
    progress.current += Math.max(-step, Math.min(step, target - progress.current))
    const moving = progress.current !== before ? stepAt(progress.current, model.steps) : null
    // Only the move under way glows, so the order can be followed one move at a time.
    placePieces(model, progress.current, highlight.length === 0 ? moving : null)
    // A move that has just finished going on flashes where it landed.
    trackMoves(model, effects, moving, progress.current < before)
    runIdle(model, effects, progress.current === 0 && target === 0 && highlight.length === 0, delta)
    runFlashes(effects, camera, delta)
    runScan(effects, progress.current, delta, highlight.length === 0)

    const look = `${highlight.join()}|${hovered ?? ''}`
    if (look !== styled.current) {
      styled.current = look
      styleParts(model, highlight, hovered)
    }
    if (controls) {
      // Turn towards the picked part and come closer; back to the whole robot otherwise.
      const single = highlight.length === 1 ? groupCentre(model, highlight[0], aim.current) : null
      const open = progress.current
      const home = HOME.together.distance + (HOME.apart.distance - HOME.together.distance) * open
      const goal = single ?? aim.current.set(0, HOME.together.y + (HOME.apart.y - HOME.together.y) * open, 0)
      // A narrow (phone) frame cuts the sides first, so the camera stands further back there.
      const fit = 'aspect' in camera ? Math.max(1, 0.9 / camera.aspect) : 1
      followCamera(camera.position, controls.target, goal, (single ? PICKED_DISTANCE : home) * fit * zoom, 1 - Math.exp(-3 * delta))
      controls.update()
    }
  })

  const groupAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => groupOfNode(event.object.name)

  return (
    <>
    <primitive object={effects.group} />
    <WheelAura centres={model.wheelCentres} color="#6fae3c" drive={() => effects.idle} angle={() => effects.wheelAngle} />
    <primitive
      object={model.root}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onHover(groupAt(event)) }}
      onPointerOut={() => onHover(null)}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        // A drag to turn the robot is not a pick.
        if (event.delta > 4) return
        event.stopPropagation()
        const group = groupAt(event)
        if (group) onPick(group)
      }}
    />
    </>
  )
}

function Scene(props: Omit<Parameters<typeof Robot>[0], 'model'> & { spin: boolean; onModel: (model: Model) => void }) {
  const { spin, onModel, ...robot } = props
  const model = usePieces()
  useEffect(() => { onModel(model) }, [model, onModel])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#8a9aa4', 1.3]} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.8} />
      <directionalLight position={[0, 1.5, -4]} intensity={0.6} color="#cfe9ff" />
      <Robot model={model} {...robot} />
      {/* A drafting-table floor: fine grid every 10 cm, heavier every 50 cm, fading out. */}
      <Grid position={[0, -0.001, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.6} cellColor="#9fb0b8" sectionSize={0.5} sectionThickness={1} sectionColor="#7d939d" fadeDistance={7} fadeStrength={2.2} infiniteGrid />
      <ContactShadows position={[0, 0, 0]} opacity={0.38} scale={3} blur={2.4} far={1.4} />
      <OrbitControls makeDefault target={[HOME_TARGET.x, HOME_TARGET.y, HOME_TARGET.z]} enablePan={false} enableZoom={false} autoRotate={spin} autoRotateSpeed={0.6} minPolarAngle={Math.PI * 0.18} maxPolarAngle={Math.PI * 0.49} />
    </>
  )
}

const MODES: { id: Exclude<Mode, 'hold'>; label: string }[] = [
  { id: 'apart', label: 'Bung ra' },
  { id: 'together', label: 'Ghép lại' },
  { id: 'auto', label: 'Tự chạy' },
]

/**
 * The CampusTour robot from its SolidWorks assembly: it comes apart one move
 * at a time (a piece, a mirrored pair, or all the screws) and goes back
 * together the same way. Clicking a part holds the robot
 * where it is and shows what that part is; every other part fades so the ones
 * inside the body can be seen.
 */
export default function RobotExplodeViewer({ focus = [], visible = true }: {
  /** Groups to highlight from outside (the technology list beside the viewer). */
  focus?: readonly PartGroupId[]
  /** Stop rendering while the section is scrolled away. */
  visible?: boolean
}) {
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mode, setMode] = useState<Mode>(reduced ? 'together' : 'auto')
  const [picked, setPicked] = useState<PartGroupId | null>(null)
  const [hovered, setHovered] = useState<PartGroupId | null>(null)
  const [model, setModel] = useState<Model | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const zoom = useZoom(stage)

  const highlight = useMemo(() => (picked ? [picked] : focus), [picked, focus])
  const info = picked ? partGroup(picked) : null
  const pieceCount = model?.pieces.length ?? 0

  const pick = (group: PartGroupId | null) => {
    setPicked(current => (current === group ? null : group))
    // Hold the robot where it is; the other parts fade, so the picked one shows even inside the body.
    if (group) setMode(current => (current === 'auto' ? 'hold' : current))
  }
  const choose = (next: Exclude<Mode, 'hold'>) => setMode(current => (next === 'auto' && current === 'auto' ? 'hold' : next))

  return (
    <div className="lp3-explode" data-hovering={hovered ? 'true' : 'false'}>
      <div className="lp3-explode__stage" ref={stage}>
        <Canvas
          className="lp3-explode__canvas"
          frameloop={visible ? 'always' : 'never'}
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [6.4, 3.9, 7.6], fov: 34, near: 0.05, far: 40 }}
          onPointerMissed={() => setPicked(null)}
        >
          <Scene
            mode={mode}
            visible={visible}
            highlight={highlight}
            hovered={hovered}
            zoom={zoom.level}
            onHover={setHovered}
            onPick={pick}
            spin={!picked && focus.length === 0 && !reduced}
            onModel={setModel}
          />
        </Canvas>

        <div className="lp3-explode__meta" aria-hidden="true">
          <span>Mô hình SolidWorks · A_Full_Xe</span>
          <strong>{pieceCount ? `${pieceCount} chi tiết · ${PART_GROUPS.length} nhóm linh kiện` : 'Đang tải mô hình…'}</strong>
        </div>
        <p className="lp3-explode__hint">Kéo để xoay · Ctrl + cuộn để phóng to · Bấm linh kiện để xem</p>
        <ZoomControls level={zoom.level} onIn={zoom.zoomIn} onOut={zoom.zoomOut} onReset={zoom.reset} />

        {info && (
          <div className="lp3-explode__card" role="status">
            <button type="button" className="lp3-explode__close" aria-label="Đóng thông tin linh kiện" onClick={() => setPicked(null)}><X size={16} /></button>
            <span className="lp3-explode__swatch" style={{ background: info.color }} aria-hidden="true" />
            <span className="lp3-explode__count">{(model?.counts.get(info.id) ?? 0) > 1 ? `${model?.counts.get(info.id)} chi tiết` : 'Linh kiện'}</span>
            <h3>{info.label}</h3>
            <p>{info.body}</p>
          </div>
        )}
      </div>

      <div className="lp3-explode__bar">
        <div className="lp3-explode__modes" role="group" aria-label="Chế độ xem robot">
          {MODES.map(item => (
            <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => choose(item.id)}>
              {item.id === 'apart' ? <Expand size={15} aria-hidden="true" /> : item.id === 'together' ? <Shrink size={15} aria-hidden="true" /> : mode === 'auto' ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

useGLTF.preload(ROBOT_EXPLODE_URL, false, true)
