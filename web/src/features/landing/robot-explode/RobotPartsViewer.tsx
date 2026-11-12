import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Fog, Vector3 } from 'three'
import { Expand, Gamepad2, PackageOpen, Shrink, X } from 'lucide-react'
import { CASING, PART_GROUPS, partGroup, type PartGroupId } from './parts'
import { CALLOUTS } from './callouts'
import { ease, partCentre, projectCallouts, type CalloutFrame, type RobotParts } from './robot-rig'
import CalloutLabels from './CalloutLabels'
import type { DriveState } from './drive'
import { LoadBar, RobotBody } from './RobotBody'
import { WIDE, attachFog, freshDrive, isTyping, onFloor, setFog, slideFraming, type Framing, type RigState } from './stage'
import ZoomControls from './ZoomControls'
import { useZoom } from './zoom'
import { studioWorld as world } from './worlds/studio-world'

/** Camera distance from the whole robot (together, apart) and from one part, metres. */
const INSPECT = { together: 2.5, apart: 4.8, part: 1.5 } as const
const isInside = (group: PartGroupId) => !CASING.has(group) && group !== 'frame'
/** Where the camera turns to on arrival: three-quarters from the robot's front left, a little above it. */
const ENTRY = new Vector3(Math.cos(world.start.yaw + 0.75), 0.55, Math.sin(world.start.yaw + 0.75)).normalize()
/** The camera starts further out along that line and comes in to the robot. */
const START_AT: [number, number, number] = [ENTRY.x * 7, 0.62 + ENTRY.y * 7, ENTRY.z * 7]

const toCamera = new Vector3()

/** The camera: an orbit close round the robot, turned to the picked part, coming in from further out on arrival. */
function PartsCamera({ driveRef, rigRef, focusRef, picked, zoom, framing }: {
  driveRef: MutableRefObject<DriveState>
  rigRef: MutableRefObject<RigState | null>
  /** Camera's distance to what it looks at, for the fog. */
  focusRef: MutableRefObject<number>
  picked: PartGroupId | null
  zoom: number
  framing: Framing
}) {
  const camera = useThree(state => state.camera)
  const controls = useThree(state => state.controls) as unknown as { target: Vector3; update: () => void } | null
  const size = useThree(state => state.size)
  const aim = useRef(new Vector3())
  const shift = useRef<Framing>({ ...framing })
  const S = world.scale

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    slideFraming(camera, size.width, size.height, shift.current, framing, delta)
    const rig = rigRef.current
    if (!controls || !rig) return
    const at = onFloor(world, driveRef.current)
    const single = picked ? partCentre(rig.model, picked, rig.apart, rig.open, aim.current) : null
    const spread = ease(rig.apart)
    const goal = single ?? aim.current.copy(at).setY(at.y + (0.62 + 0.68 * spread + 0.12 * ease(rig.open)) * S)
    const distance = (single ? INSPECT.part : INSPECT.together + (INSPECT.apart - INSPECT.together) * spread + 0.5 * ease(rig.open)) * S
    // A narrow (phone) frame cuts the sides first, so the camera stands further back there.
    const fit = 'aspect' in camera ? Math.max(1, 0.9 / camera.aspect) : 1
    const blend = 1 - Math.exp(-3 * delta)
    toCamera.subVectors(camera.position, controls.target)
    const current = toCamera.length()
    controls.target.lerp(goal, blend)
    toCamera.setLength(current + (distance * fit * zoom - current) * blend)
    camera.position.copy(controls.target).add(toCamera)
    controls.update()
    focusRef.current = toCamera.length()
  })
  return null
}

/**
 * Compiles the stage's shaders in the background once the robot is in, while
 * it is still hidden (behind the intro video), so its first frame does not
 * stall the page.
 */
function WarmUp({ ready }: { ready: boolean }) {
  const gl = useThree(state => state.gl)
  const scene = useThree(state => state.scene)
  const camera = useThree(state => state.camera)
  useEffect(() => {
    if (ready) gl.compileAsync(scene, camera).catch(() => undefined)
  }, [ready, gl, scene, camera])
  return null
}

/** A fog that closes round the robot, so it stands alone on its floor whatever the camera's distance. */
function StageFog({ focusRef }: { focusRef: MutableRefObject<number> }) {
  const scene = useThree(state => state.scene)
  const fog = useMemo(() => new Fog('#000000', 400, 800), [])
  useEffect(() => attachFog(scene, fog), [scene, fog])
  useFrame(() => {
    const near = focusRef.current + 1.4 * world.scale
    setFog(fog, world.sky(false).background, near, near + 2.6 * world.scale)
  })
  return null
}

/** Places the callouts after the camera has moved. */
function CalloutTracker({ rigRef, calloutsRef }: { rigRef: MutableRefObject<RigState | null>; calloutsRef: MutableRefObject<CalloutFrame | null> }) {
  const camera = useThree(state => state.camera)
  const size = useThree(state => state.size)
  useFrame(() => {
    const rig = rigRef.current
    if (!calloutsRef.current || !rig) return
    camera.updateMatrixWorld()
    calloutsRef.current(projectCallouts(rig.model, camera, size.width, size.height, rig.apart, rig.open), size.width, size.height)
  })
  return null
}

/**
 * The robot's parts, in the home page's section 04 after its intro video: the
 * CampusTour robot alone on a dark stage (no map loads here), a large dark
 * card the size of the screen. The camera comes in to it and it turns slowly
 * until the visitor turns it; they can take it apart, open its casing and pick
 * any part group from the robot, its callouts or the list. Only the parts here:
 * driving is on the test-drive page (`driveTo`, RobotDriveViewer). While
 * `visible` is false nothing is drawn, though the model still loads.
 */
export default function RobotPartsViewer({ visible = true, intro, driveTo }: {
  visible?: boolean
  /** The kicker, title and links, laid over the stage. */
  intro?: ReactNode
  /** The test-drive page. */
  driveTo: string
}) {
  const driveRef = useRef<DriveState>(freshDrive(world))
  const rigRef = useRef<RigState | null>(null)
  const calloutsRef = useRef<CalloutFrame | null>(null)
  const focusRef = useRef(INSPECT.together * world.scale)
  const stageRef = useRef<HTMLDivElement>(null)
  const inViewRef = useRef(false)
  const zoom = useZoom(stageRef)
  const [picked, setPicked] = useState<PartGroupId | null>(null)
  const [hovered, setHovered] = useState<PartGroupId | null>(null)
  const [apart, setApart] = useState(false)
  const [shellOpen, setShellOpen] = useState(false)
  /** The visitor has turned the robot themselves: it stops turning slowly by itself. */
  const [touched, setTouched] = useState(false)
  const [wide, setWide] = useState(true)
  const [stageWidth, setStageWidth] = useState(1200)
  const [model, setModel] = useState<RobotParts | null>(null)

  const opened = shellOpen || (picked !== null && isInside(picked))
  const highlight = useMemo(() => (picked ? [picked] : []), [picked])
  const info = picked ? partGroup(picked) : null
  // On a wide screen the title and panel stand in a column at the left (CSS: min(420px, 31%) from 28px);
  // the robot and its callouts have the room to the right of it. On a phone, above the bottom sheet.
  const sideSpace = wide ? 28 + Math.min(420, stageWidth * 0.31) + 40 : 14
  const framing: Framing = wide ? { x: -(sideSpace - 32) / (2 * stageWidth), y: -0.01 } : { x: 0, y: 0.16 }

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const observers: { disconnect: () => void }[] = []
    if (typeof ResizeObserver !== 'undefined') {
      const resize = new ResizeObserver(([entry]) => {
        const width = entry?.contentRect.width ?? 1200
        setWide(width >= WIDE)
        setStageWidth(width)
      })
      resize.observe(node)
      observers.push(resize)
    }
    if (typeof IntersectionObserver !== 'undefined') {
      const watch = new IntersectionObserver(([entry]) => { inViewRef.current = (entry?.intersectionRatio ?? 0) > 0.55 }, { threshold: [0, 0.55, 1] })
      watch.observe(node)
      observers.push(watch)
    }
    return () => observers.forEach(observer => observer.disconnect())
  }, [])

  // Escape lets go of the picked part while the stage fills most of the screen.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isTyping(event.target)) return
      if (!(stageRef.current?.contains(event.target as Node) ?? false) && !inViewRef.current) return
      setPicked(null)
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  const pickPart = (group: PartGroupId) => setPicked(current => (current === group ? null : group))

  const shown = CALLOUTS.map(callout => (picked ? callout.group === picked : apart || Boolean(callout.key)))
  const calloutState = CALLOUTS.map(callout => (callout.group === picked ? 'picked' as const : hovered === callout.group ? 'focus' as const : 'idle' as const))
  const hint = !touched && !picked ? 'Kéo để xoay · bấm linh kiện hoặc chú thích để xem' : null

  return (
    <div
      className="lp3-td"
      ref={stageRef}
      tabIndex={-1}
      role="application"
      aria-label="Mô hình 3D robot CampusTour. Kéo để xoay, bấm vào một linh kiện hoặc chú thích để xem chi tiết."
      data-mode="showcase"
      style={{ ['--td-side' as string]: `${sideSpace}px` }}
      data-view="inspect"
      data-hovering={hovered ? 'true' : 'false'}
    >
      <Canvas
        className="lp3-td__canvas"
        frameloop={visible ? 'always' : 'never'}
        shadows
        dpr={[1, 1.5]}
        camera={{ position: START_AT, fov: 46, near: 0.02, far: 600 }}
        onPointerMissed={() => setPicked(null)}
      >
        <color attach="background" args={[world.sky(false).background]} />
        <StageFog focusRef={focusRef} />
        <world.Lights night={false} driveRef={driveRef} />
        <world.Map night={false} driveRef={driveRef} />
        <RobotBody
          world={world}
          driveRef={driveRef}
          rigRef={rigRef}
          inspecting
          apart={apart}
          opened={opened}
          highlight={highlight}
          hovered={hovered}
          onHover={setHovered}
          onPick={pickPart}
          onModel={setModel}
        />
        <OrbitControls makeDefault target={[0, 0.62, 0]} enablePan={false} enableZoom={false} minPolarAngle={Math.PI * 0.12} maxPolarAngle={Math.PI * 0.48} autoRotate={!touched && !picked} autoRotateSpeed={0.45} onStart={() => setTouched(true)} />
        <PartsCamera driveRef={driveRef} rigRef={rigRef} focusRef={focusRef} picked={picked} zoom={zoom.level} framing={framing} />
        <CalloutTracker rigRef={rigRef} calloutsRef={calloutsRef} />
        <WarmUp ready={model !== null} />
      </Canvas>
      <LoadBar label="Đang tải mô hình" />
      <div className="lp3-td__scrim" aria-hidden="true" />

      <CalloutLabels frameRef={calloutsRef} shown={shown} state={calloutState} side={picked ? 'left' : undefined} top={wide ? 110 : 150} bottom={wide ? 40 : 360} left={sideSpace} right={wide ? 32 : 14} onHover={setHovered} onPick={pickPart} />

      <div className="lp3-td__intro">{intro}</div>
      {hint && <p className="lp3-td__hint" aria-hidden="true">{hint}</p>}

      <aside className="lp3-td__panel" aria-label="Cấu tạo robot">
        <div className="lp3-td__row lp3-td__row--head">
          <span>Cấu tạo</span>
          <b><i data-live="false" />{model ? `${model.pieces.length} chi tiết · ${PART_GROUPS.length} nhóm` : 'Đang tải…'}</b>
        </div>
        <div className="lp3-td__part">
          {info ? (
            <>
              <span className="lp3-td__label"><i style={{ background: info.color }} aria-hidden="true" />{(model?.counts.get(info.id) ?? 0) > 1 ? `${model?.counts.get(info.id)} chi tiết` : 'Linh kiện'}{opened && isInside(info.id) ? ' · đã mở vỏ' : ''}</span>
              <h3>{info.label}</h3>
              <p>{info.body}</p>
              <button type="button" className="lp3-td__link" onClick={() => setPicked(null)}><X size={13} aria-hidden="true" />Bỏ chọn</button>
            </>
          ) : (
            <>
              <span className="lp3-td__label">Mô hình SolidWorks · A_Full_Xe</span>
              <p>Kéo để xoay robot. Bấm vào một linh kiện trên xe, một chú thích hoặc một tên dưới đây để mở vỏ và xem nó.</p>
            </>
          )}
        </div>
        <div className="lp3-td__parts" role="group" aria-label="Chọn linh kiện">
          {PART_GROUPS.map(group => (
            <button key={group.id} type="button" aria-pressed={picked === group.id} onClick={() => pickPart(group.id)} onPointerEnter={() => setHovered(group.id)} onPointerLeave={() => setHovered(null)}>
              <i style={{ background: group.color }} aria-hidden="true" />{group.label}
            </button>
          ))}
        </div>
        <div className="lp3-td__row lp3-td__row--tools">
          <div className="lp3-td__seg" role="group" aria-label="Xem cấu tạo">
            <button type="button" aria-pressed={apart} onClick={() => setApart(value => !value)}>
              {apart ? <Shrink size={14} aria-hidden="true" /> : <Expand size={14} aria-hidden="true" />}{apart ? 'Ghép lại' : 'Bung ra'}
            </button>
            <button type="button" aria-pressed={shellOpen} onClick={() => { setShellOpen(value => !value); setApart(false) }}>
              <PackageOpen size={14} aria-hidden="true" />Mở vỏ
            </button>
          </div>
          <ZoomControls level={zoom.level} onIn={zoom.zoomIn} onOut={zoom.zoomOut} onReset={zoom.reset} />
        </div>
        <div className="lp3-td__actions lp3-td__actions--go">
          <Link to={driveTo} className="lp3-td__btn lp3-td__btn--lime"><Gamepad2 size={15} aria-hidden="true" />Lái thử robot trên bản đồ</Link>
        </div>
      </aside>
    </div>
  )
}
