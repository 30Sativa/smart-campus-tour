import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Color, Fog, Group, Vector3, type Scene } from 'three'
import { Expand, Gamepad2, PackageOpen, Shrink, X } from 'lucide-react'
import { CASING, PART_GROUPS, partGroup, type PartGroupId } from './parts'
import { CALLOUTS } from './callouts'
import { ease, partCentre, projectCallouts, type CalloutFrame, type RobotParts } from './robot-rig'
import CalloutLabels from './CalloutLabels'
import { followPath, stepDrive, type DriveState } from './drive'
import { LidarSweep, LoadBar, RobotBody } from './RobotBody'
import { WIDE, attachFog, freshDrive, isTyping, onFloor, setFog, slideFraming, type Framing, type RigState } from './stage'
import { STORY_CHAPTERS, storyLook, storyShot } from './story'
import { StageLights, StoryScenery } from './StoryFx'
import ZoomControls from './ZoomControls'
import { useZoom } from './zoom'
import { studioWorld as world } from './worlds/studio-world'

/** Camera distance from the whole robot (together, apart) and from one part, metres. */
const INSPECT = { together: 2.5, apart: 4.8, part: 1.5 } as const
const isInside = (group: PartGroupId) => !CASING.has(group) && group !== 'frame'
/** The story's robot rolls straight on, towards the stage's far stop. */
const STRAIGHT_ON = [world.stops[1]]
const NEVER_BLOCKED = { current: false }

/** Rolls the robot on through the story's opening chapters and parks it for the rest. */
function StoryDrive({ driveRef, storyRef, still }: { driveRef: MutableRefObject<DriveState>; storyRef: MutableRefObject<number>; still: boolean }) {
  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    const parked = still || storyLook(storyRef.current).parked
    const input = parked ? { throttle: 0, steer: 0, brake: true } : followPath(driveRef.current, STRAIGHT_ON).input
    driveRef.current = stepDrive(driveRef.current, input, delta, world.canMove)
  })
  return null
}

const ahead = new Vector3()
const eye = new Vector3()
const toCamera = new Vector3()

/**
 * The camera: each story chapter's shot round the robot (followed closely, so
 * scrolling feels like scrubbing a film), then an orbit close round the robot,
 * turned to the picked part.
 */
function PartsCamera({ driveRef, rigRef, focusRef, storyRef, inspecting, picked, zoom, framing }: {
  driveRef: MutableRefObject<DriveState>
  rigRef: MutableRefObject<RigState | null>
  /** Camera's distance to what it looks at, for the backdrop's fog. */
  focusRef: MutableRefObject<number>
  storyRef: MutableRefObject<number>
  inspecting: boolean
  picked: PartGroupId | null
  zoom: number
  framing: Framing
}) {
  const camera = useThree(state => state.camera)
  const controls = useThree(state => state.controls) as unknown as { target: Vector3; update: () => void } | null
  const size = useThree(state => state.size)
  const look = useRef(new Vector3())
  const aim = useRef(new Vector3())
  const first = useRef(true)
  const orbiting = useRef<unknown>(null)
  const shift = useRef<Framing>({ ...framing })
  const swing = useRef(0)
  const entry = useRef(new Vector3())
  const S = world.scale

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    const state = driveRef.current
    const at = onFloor(world, state)
    slideFraming(camera, size.width, size.height, shift.current, framing, delta)
    if (inspecting) {
      const rig = rigRef.current
      if (!controls || !rig) return
      // The orbit takes over from wherever the camera was looking, then swings round to a
      // three-quarter view from the robot's front left, a little above it.
      if (orbiting.current !== controls) {
        orbiting.current = controls
        controls.target.copy(look.current)
        swing.current = 1.2
        entry.current.set(Math.cos(state.yaw + 0.75), 0.55, Math.sin(state.yaw + 0.75)).normalize()
      }
      const single = picked ? partCentre(rig.model, picked, rig.apart, rig.open, aim.current) : null
      const spread = ease(rig.apart)
      const goal = single ?? aim.current.copy(at).setY(at.y + (0.62 + 0.68 * spread + 0.12 * ease(rig.open)) * S)
      const distance = (single ? INSPECT.part : INSPECT.together + (INSPECT.apart - INSPECT.together) * spread + 0.5 * ease(rig.open)) * S
      // A narrow (phone) frame cuts the sides first, so the camera stands further back there.
      const fit = 'aspect' in camera ? Math.max(1, 0.9 / camera.aspect) : 1
      const blend = 1 - Math.exp(-3 * delta)
      toCamera.subVectors(camera.position, controls.target)
      const current = toCamera.length()
      if (swing.current > 0) {
        swing.current -= delta
        toCamera.normalize().lerp(entry.current, Math.min(1, delta * 3)).setLength(current)
      }
      controls.target.lerp(goal, blend)
      toCamera.setLength(current + (distance * fit * zoom - current) * blend)
      camera.position.copy(controls.target).add(toCamera)
      controls.update()
      look.current.copy(controls.target)
      focusRef.current = toCamera.length()
      return
    }
    orbiting.current = null
    const shot = storyShot(storyRef.current)
    const place = (p: { forward: number; side: number; h: number }) => onFloor(world, { x: state.x + Math.cos(state.yaw) * p.forward - Math.sin(state.yaw) * p.side, y: state.y + Math.sin(state.yaw) * p.forward + Math.cos(state.yaw) * p.side }, p.h)
    eye.copy(place(shot.eye))
    ahead.copy(place(shot.look))
    const blend = first.current ? 1 : 1 - Math.exp(-7 * delta)
    first.current = false
    camera.position.lerp(eye, blend)
    look.current.lerp(ahead, blend)
    camera.lookAt(look.current)
    focusRef.current = camera.position.distanceTo(at)
  })
  return null
}

const DIGITAL = new Color('#03111b')
/** The haze the stage sinks into behind the robot in the story's opening close-ups. */
const STAGE = new Color('#0b1822')
const tint = new Color()

/** The canvas background follows the fog colour. */
function paintBackground(scene: Scene, color: Color) {
  if (scene.background instanceof Color) scene.background.copy(color)
}

/**
 * The haze round the stage: drawn in by the story's close-ups, dark in its
 * digital chapters, and closing round the robot while its parts are shown,
 * which hides the stage floor and leaves the robot on a quiet grid with its
 * shadow.
 */
function StageBackdrop({ on, floorRef, focusRef, driveRef, storyRef, digital }: {
  on: boolean
  storyRef: MutableRefObject<number>
  /** The story's digital chapters: a dark backdrop and a cyan floor grid. */
  digital: boolean
  floorRef: MutableRefObject<Group | null>
  focusRef: MutableRefObject<number>
  driveRef: MutableRefObject<DriveState>
}) {
  const scene = useThree(state => state.scene)
  const fog = useMemo(() => new Fog('#000000', 400, 800), [])
  const floor = useRef<Group>(null)
  const amount = useRef(0)
  const S = world.scale
  useEffect(() => attachFog(scene, fog), [scene, fog])
  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    amount.current += Math.max(-delta / 0.7, Math.min(delta / 0.7, (on ? 1 : 0) - amount.current))
    const look = storyLook(storyRef.current)
    const story = look.digital
    const close = Math.max(amount.current, story)
    const level = Math.max(close, look.stage * 0.72)
    const t = ease(level)
    const sky = world.sky(false)
    tint.set(sky.background).lerp(STAGE, look.stage * (1 - story) * 0.72).lerp(DIGITAL, story)
    const near = focusRef.current + 1.4 * S
    // Far off, then closing in: interpolate on a log scale so the fog visibly sweeps in.
    setFog(fog, tint, near * (sky.fogNear / near) ** (1 - t), (near + 2.6 * S) * (sky.fogFar / (near + 2.6 * S)) ** (1 - t))
    paintBackground(scene, tint)
    if (floorRef.current) floorRef.current.visible = close < 0.98
    if (floor.current) {
      floor.current.visible = close > 0.3
      floor.current.position.copy(onFloor(world, driveRef.current, 0.01))
    }
  })
  return (
    <group ref={floor} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6 * S, 64]} />
        <shadowMaterial transparent opacity={0.4} />
      </mesh>
      {/* A little above the shadow, not in its plane, so the two do not fight over the same depth. */}
      <Grid position={[0, 0.004 * S, 0]} args={[10 * S, 10 * S]} cellSize={0.1 * S} cellThickness={0.6} cellColor={digital ? '#145566' : '#9fb3bf'} sectionSize={0.5 * S} sectionThickness={1} sectionColor={digital ? '#2bb7d6' : '#7f97a6'} fadeDistance={8 * S} fadeStrength={1.6} infiniteGrid />
    </group>
  )
}

/** Places the callouts after the camera has moved; clears them once while the story plays. */
function CalloutTracker({ rigRef, calloutsRef, active }: { rigRef: MutableRefObject<RigState | null>; calloutsRef: MutableRefObject<CalloutFrame | null>; active: boolean }) {
  const camera = useThree(state => state.camera)
  const size = useThree(state => state.size)
  const cleared = useRef(false)
  useFrame(() => {
    const rig = rigRef.current
    if (!calloutsRef.current) return
    if (!active || !rig) {
      if (!cleared.current) calloutsRef.current(CALLOUTS.map(() => null), size.width, size.height)
      cleared.current = true
      return
    }
    cleared.current = false
    camera.updateMatrixWorld()
    calloutsRef.current(projectCallouts(rig.model, camera, size.width, size.height, rig.apart, rig.open), size.width, size.height)
  })
  return null
}

/** The chapters down the right side while the story plays, the one on screen lit, and a nudge to keep scrolling. */
function StorySteps({ chapter }: { chapter: number }) {
  return (
    <div className="lp3-story-steps" aria-hidden="true">
      <ol>
        {STORY_CHAPTERS.map((item, index) => (
          <li key={item.kicker} data-state={index === chapter ? 'on' : index < chapter ? 'done' : 'next'}>{item.kicker}</li>
        ))}
      </ol>
      <p>Cuộn để khám phá <span>↓</span></p>
    </div>
  )
}

/** Without a scroll story the parts are shown straight away. */
const NO_STORY = { current: 1 }

/**
 * The home page's section 04: the CampusTour robot alone on a dark stage (no
 * map loads here), a large dark card the size of the screen. A scroll story
 * plays first (the robot rolling on, a scan along it, its digital model, the
 * route ahead, the decision on its computer); then its parts: the visitor
 * turns it (it turns slowly by itself until then), takes it apart, opens its
 * casing and picks any part group from the robot, its callouts or the list.
 * Only the parts here: driving is on the test-drive page (`driveTo`,
 * RobotDriveViewer).
 */
export default function RobotPartsViewer({ visible = true, intro, storyRef = NO_STORY, chapter = STORY_CHAPTERS.length, driveTo }: {
  visible?: boolean
  /** The kicker, title and text (or the story chapter's), laid over the stage. */
  intro?: ReactNode
  /** Scroll story progress from the section, 0..1. */
  storyRef?: MutableRefObject<number>
  /** Chapter of the story on screen; `STORY_CHAPTERS.length` (the default) once it is over. */
  chapter?: number
  /** The test-drive page. */
  driveTo: string
}) {
  const driveRef = useRef<DriveState>(freshDrive(world))
  const rigRef = useRef<RigState | null>(null)
  const calloutsRef = useRef<CalloutFrame | null>(null)
  const focusRef = useRef(INSPECT.together * world.scale)
  const floorRef = useRef<Group | null>(null)
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

  // The parts once the story has played (and the story again if scrolled back up).
  const inspecting = chapter >= STORY_CHAPTERS.length
  const digital = chapter >= 2 && !inspecting
  const opened = inspecting && (shellOpen || (picked !== null && isInside(picked)))
  const highlight = useMemo(() => (inspecting && picked ? [picked] : []), [inspecting, picked])
  const info = inspecting && picked ? partGroup(picked) : null
  // On a wide screen the title and panel stand in a column at the left (CSS: min(420px, 31%) from 28px);
  // the robot and its callouts have the room to the right of it.
  const sideSpace = wide ? 28 + Math.min(420, stageWidth * 0.31) + 40 : 14
  // During the story the robot sits right of the chapter text, the tunnel and chip straight ahead in the middle;
  // then in the middle of the room right of the column (wide), above the bottom sheet (narrow).
  const framing: Framing = !inspecting
    ? (wide ? { x: chapter >= 3 ? 0 : -0.1, y: 0 } : { x: 0, y: chapter >= 3 ? 0 : 0.12 })
    : (wide ? { x: -(sideSpace - 32) / (2 * stageWidth), y: -0.01 } : { x: 0, y: 0.16 })

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

  const pickPart = (group: PartGroupId) => {
    if (!inspecting) return
    setPicked(current => (current === group ? null : group))
  }

  const shown = CALLOUTS.map(callout => inspecting && (picked ? callout.group === picked : apart || Boolean(callout.key)))
  const calloutState = CALLOUTS.map(callout => (callout.group === picked ? 'picked' as const : hovered === callout.group ? 'focus' as const : 'idle' as const))
  const hint = inspecting && !touched && !picked ? 'Kéo để xoay · bấm linh kiện hoặc chú thích để xem' : null

  return (
    <div
      className="lp3-td"
      ref={stageRef}
      tabIndex={-1}
      role="application"
      aria-label="Mô hình 3D robot CampusTour. Kéo để xoay, bấm vào một linh kiện hoặc chú thích để xem chi tiết."
      data-mode="showcase"
      style={{ ['--td-side' as string]: `${sideSpace}px` }}
      data-view={inspecting ? 'inspect' : 'drive'}
      data-hovering={hovered ? 'true' : 'false'}
      data-story={inspecting ? 'done' : 'on'}
    >
      <Canvas
        className="lp3-td__canvas"
        frameloop={visible ? 'always' : 'never'}
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [4, 17, 12], fov: 46, near: 0.02, far: 600 }}
        onPointerMissed={() => { if (inspecting) setPicked(null) }}
      >
        <color attach="background" args={[world.sky(false).background]} />
        <world.Lights night={false} driveRef={driveRef} />
        <group ref={floorRef}><world.Map night={false} driveRef={driveRef} /></group>
        <StageBackdrop on={inspecting} floorRef={floorRef} focusRef={focusRef} driveRef={driveRef} storyRef={storyRef} digital={digital} />
        {!inspecting && <StoryScenery world={world} driveRef={driveRef} storyRef={storyRef} />}
        <RobotBody
          world={world}
          driveRef={driveRef}
          rigRef={rigRef}
          storyRef={storyRef}
          inspecting={inspecting}
          apart={inspecting && apart}
          opened={opened}
          highlight={highlight}
          hovered={hovered}
          onHover={setHovered}
          onPick={pickPart}
          onModel={setModel}
          extras={!inspecting && <LidarSweep blockedRef={NEVER_BLOCKED} />}
        >
          <StageLights storyRef={storyRef} />
        </RobotBody>
        <StoryDrive driveRef={driveRef} storyRef={storyRef} still={inspecting} />
        {inspecting && <OrbitControls makeDefault enablePan={false} enableZoom={false} minPolarAngle={Math.PI * 0.12} maxPolarAngle={Math.PI * 0.48} autoRotate={!touched && !picked} autoRotateSpeed={0.45} onStart={() => setTouched(true)} />}
        <PartsCamera driveRef={driveRef} rigRef={rigRef} focusRef={focusRef} storyRef={storyRef} inspecting={inspecting} picked={inspecting ? picked : null} zoom={inspecting ? zoom.level : 1} framing={framing} />
        <CalloutTracker rigRef={rigRef} calloutsRef={calloutsRef} active={inspecting} />
      </Canvas>
      <LoadBar label="Đang tải mô hình" />
      <div className="lp3-td__scrim" aria-hidden="true" />

      <CalloutLabels frameRef={calloutsRef} shown={shown} state={calloutState} side={picked ? 'left' : undefined} top={wide ? 110 : 150} bottom={wide ? 40 : 360} left={sideSpace} right={wide ? 32 : 14} onHover={setHovered} onPick={pickPart} />

      <p className="lp3-td__where" aria-hidden="true"><i />{world.title}</p>
      <div className="lp3-td__intro">{intro}</div>
      {hint && <p className="lp3-td__hint" aria-hidden="true">{hint}</p>}
      {!inspecting && <StorySteps chapter={chapter} />}

      <aside className="lp3-td__panel" aria-hidden={!inspecting} inert={!inspecting} aria-label="Cấu tạo robot">
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
