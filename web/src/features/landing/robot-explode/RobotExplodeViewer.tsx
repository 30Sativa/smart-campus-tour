import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, useGLTF } from '@react-three/drei'
import { Box3, Color, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { Expand, Pause, Play, Shrink, X } from 'lucide-react'
import { PART_GROUPS, explodeOffset, groupOfNode, orderMoves, pairMoves, partGroup, planAssembly, stepApart, stepAt, type PartGroupId, type Step, type Vec3 } from './parts'
import ZoomControls from './ZoomControls'
import { useZoom } from './zoom'

export const ROBOT_EXPLODE_URL = `${import.meta.env.BASE_URL}models/robot/campus-amr-explode.glb`

/** Seconds one ordinary move takes to go on (or come off); the whole robot takes the sum of its moves' turns. */
const SECONDS_PER_TURN = 0.5
/** Auto cycle: assembled, apart, assembled; seconds. */
const CYCLE = { holdTogether: 2.5, holdApart: 2.5 }
const GLOW = new Color('#8fcf4a')
/** Where the camera looks when no part is picked: the middle of the robot, put together or apart. */
const HOME = { together: { y: 0.62, distance: 3.1 }, apart: { y: 1.3, distance: 5.6 } }
const HOME_TARGET = new Vector3(0, HOME.apart.y, 0)
/** Camera distance from one picked part. */
const PICKED_DISTANCE = 2.1

type Piece = { mesh: Mesh; group: PartGroupId; base: Vector3; offset: Vector3; step: Step | undefined }

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
    for (const move of moves) {
      const index = taken.get(move.group) ?? 0
      taken.set(move.group, index + 1)
      const step = plan.steps.get(move.group)?.[index]
      for (const unit of move.members) {
        // Each piece of a pair leaves towards its own side.
        const offset = new Vector3(...explodeOffset(partGroup(unit.group).explode, unit.centre))
        for (const mesh of unit.meshes) pieces.push({ mesh, group: unit.group, base: mesh.position.clone(), offset, step })
      }
    }
    const counts = new Map<PartGroupId, number>()
    pieces.forEach(piece => counts.set(piece.group, (counts.get(piece.group) ?? 0) + 1))
    return { root, pieces, materials, glow, counts, steps: plan.steps, seconds: plan.turns * SECONDS_PER_TURN }
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
          camera={{ position: [2.65, 1.75, 3.2], fov: 34, near: 0.05, far: 40 }}
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
