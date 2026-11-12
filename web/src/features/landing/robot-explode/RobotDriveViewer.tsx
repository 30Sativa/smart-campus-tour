import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls, PerformanceMonitor, useProgress } from '@react-three/drei'
import { AdditiveBlending, Color, DoubleSide, Fog, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Vector3, type Scene } from 'three'
import { Bot, Camera, Expand, Gamepad2, Gauge, Hand, Moon, PackageOpen, RotateCcw, Shrink, Sparkles, Sun, X } from 'lucide-react'
import { CASING, PART_GROUPS, groupOfNode, partGroup, type PartGroupId } from './parts'
import { CALLOUTS } from './callouts'
import { ease, partCentre, poseRobot, projectCallouts, scanRobot, styleRobot, useRobotParts, type CalloutFrame, type RobotParts } from './robot-rig'
import CalloutLabels from './CalloutLabels'
import { followPath, inputFromKeys, nearestStop, startDrive, stepDrive, type DrivePoint, type DriveState } from './drive'
import { nextTurn } from './worlds/geometry'
import type { DriveWorld, Sensing, WorldId } from './worlds/world'
import { STORY_CHAPTERS, storyLook, storyShot } from './story'
import { StageLights, StoryScenery } from './StoryFx'
import ZoomControls from './ZoomControls'
import { useZoom } from './zoom'

/**
 * What the stage is for: `showcase` (the home page) shows the robot alone and,
 * once the scroll story has played, its parts; `drive` (the test-drive page)
 * puts it on a map to drive.
 */
export type ViewerMode = 'showcase' | 'drive'
/** "Đẹp": real trees, people and shadows; "Mượt": simple ones and no shadows, for slower computers. */
export type Quality = 'high' | 'smooth'
const ACCENT = '#8fcf4a'
/** Closer than this to a stop counts as having reached it, m. */
const ARRIVE = 1.6
/** The robot brakes for someone straight ahead closer than this, m. */
const GIVE_WAY = 2.2
/** Seconds the robot takes to come apart or go back together, and to open or close. */
const EXPLODE_SECONDS = 1.3
const OPEN_SECONDS = 0.8
/** Inspecting: camera distance from the whole robot (together, apart) and from one part, metres. */
const INSPECT = { together: 2.5, apart: 4.8, part: 1.5 } as const
/** Where the robot sits in the frame: shift of the picture as a share of the stage's width and height. */
type Framing = { x: number; y: number }

type View = 'chase' | 'cinema' | 'top' | 'inspect'
type DriveView = Exclude<View, 'inspect'>
const CAMERAS: { id: DriveView; label: string }[] = [
  { id: 'chase', label: 'Chase' },
  { id: 'cinema', label: 'Điện ảnh' },
  { id: 'top', label: 'Trên cao' },
]

export type DriveHud = {
  speed: number
  blocked: boolean
  /** Someone is straight ahead and the robot waits. */
  person: boolean
  tracked: number
  stop: number | null
  stopDistance: number
  turn: { side: 'left' | 'right'; distance: number } | null
}

/** Scene position of a map point on `world`'s floor, `lift` metres up. */
function onFloor(world: DriveWorld, point: DrivePoint, lift = 0) {
  const [x, z] = world.toScene(point)
  return new Vector3(x, world.floorY + lift * world.scale, z)
}

function freshDrive(world: DriveWorld): DriveState {
  return startDrive(world.stops[world.start.stop], world.start.yaw)
}

/** How the robot stands this frame, shared by the robot, the camera and the callouts. */
type RigState = { model: RobotParts; apart: number; open: number }

/** A LiDAR sweep on the floor around the robot: a ring at the sensor's reach and a turning fan; red while something blocks the way. */
function LidarSweep({ blockedRef }: { blockedRef: MutableRefObject<boolean> }) {
  const fan = useRef<Mesh>(null)
  useFrame((_, delta) => {
    if (!fan.current) return
    fan.current.rotation.z -= delta * 4.2
    const material = fan.current.material as MeshStandardMaterial
    material.color.set(blockedRef.current ? '#ff7a59' : ACCENT)
  })
  return (
    <group position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh renderOrder={4}>
        <ringGeometry args={[2.9, 2.95, 96]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.3} depthWrite={false} side={DoubleSide} />
      </mesh>
      <mesh ref={fan} renderOrder={4}>
        <circleGeometry args={[2.95, 40, 0, 0.75]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.16} depthWrite={false} side={DoubleSide} blending={AdditiveBlending} />
      </mesh>
    </group>
  )
}

/** Headlights at night, and a red glow on the floor behind while braking. */
function RobotLights({ driveRef, night, scale }: { driveRef: MutableRefObject<DriveState>; night: boolean; scale: number }) {
  const target = useMemo(() => { const object = new Object3D(); object.position.set(0, 0, 6); return object }, [])
  const brake = useRef<Mesh>(null)
  const last = useRef(0)
  useFrame((_, delta) => {
    const speed = driveRef.current.speed
    const slowing = delta > 0 && (last.current - speed) / delta > 0.6 && speed > 0.05
    last.current = speed
    const material = brake.current?.material as MeshBasicMaterial | undefined
    if (material) material.opacity += (((slowing || driveRef.current.blocked) ? 0.75 : 0) - material.opacity) * Math.min(1, delta * 8)
  })
  return (
    <>
      <primitive object={target} />
      {night && <spotLight position={[0, 0.55, 0.35]} target={target} color="#fff4dc" intensity={30} distance={22 * scale} angle={0.6} penumbra={0.6} decay={1.2} />}
      <mesh ref={brake} position={[0, 0.04, -0.75]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <circleGeometry args={[0.85, 32]} />
        <meshBasicMaterial color="#ff2a1a" transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </>
  )
}

/**
 * The robot on the map: driven by `driveRef`, wheels rolling with its speed
 * (two-wheel drive: turning runs one faster than the other) and the head
 * glancing into turns. While inspected it can open and come apart in place.
 */
function RobotOnMap({ world, night, driveRef, blockedRef, rigRef, storyRef, clearRef, inspecting, apart, opened, highlight, hovered, onHover, onPick, onModel }: {
  world: DriveWorld
  /** Scroll story progress (1: over): the scan, x-ray and the stage lights. */
  storyRef: MutableRefObject<number>
  /** How far round the robot people leave the shot (set here from the story, read by the map). */
  clearRef: MutableRefObject<number>
  night: boolean
  driveRef: MutableRefObject<DriveState>
  blockedRef: MutableRefObject<boolean>
  rigRef: MutableRefObject<RigState | null>
  inspecting: boolean
  apart: boolean
  opened: boolean
  highlight: readonly PartGroupId[]
  hovered: PartGroupId | null
  onHover: (group: PartGroupId | null) => void
  onPick: (group: PartGroupId) => void
  onModel: (model: RobotParts) => void
}) {
  const model = useRobotParts()
  useEffect(() => { onModel(model) }, [model, onModel])
  const body = useRef<Group>(null)
  const extras = useRef<Group>(null)
  const motion = useRef({ apart: 0, open: 0, left: 0, right: 0, pan: 0 })
  const focus = useMemo(() => new Set(highlight), [highlight])

  useFrame((state, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    const drive = driveRef.current
    if (body.current) {
      const [x, z] = world.toScene(drive)
      body.current.position.set(x, world.floorY, z)
      body.current.rotation.y = -drive.yaw
    }
    const m = motion.current
    const roll = (side: number) => ((drive.speed + side * drive.turn * model.track / 2) / model.wheelRadius) * delta
    m.left += roll(1)
    m.right += roll(-1)
    m.pan += (-drive.turn * 0.32 - m.pan) * Math.min(1, delta * 4)
    m.apart += Math.max(-delta / EXPLODE_SECONDS, Math.min(delta / EXPLODE_SECONDS, (apart ? 1 : 0) - m.apart))
    m.open += Math.max(-delta / OPEN_SECONDS, Math.min(delta / OPEN_SECONDS, (opened ? 1 : 0) - m.open))
    poseRobot(model, m.apart, m.open, m, m.pan)
    const look = storyLook(storyRef.current)
    styleRobot(model, focus, hovered, m.open, inspecting, state.clock.elapsedTime, look.xray)
    scanRobot(model, look.scan)
    // In the close-ups nobody stands in front of the robot.
    clearRef.current = look.stage * 7
    // The LiDAR fan and the lights go once the story turns digital.
    if (extras.current) extras.current.visible = look.digital < 0.3
    rigRef.current = { model, apart: m.apart, open: m.open }
  })

  const groupAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => groupOfNode(event.object.name)
  // The model's nose is +Z; a map heading turns a +X nose.
  return (
    <group ref={body} scale={world.scale}>
      <group rotation={[0, Math.PI / 2, 0]}>
        <primitive
          object={model.root}
          onPointerMove={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onHover(groupAt(event)) }}
          onPointerOut={() => onHover(null)}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            // A drag to turn the view is not a pick.
            if (event.delta > 4) return
            event.stopPropagation()
            const group = groupAt(event)
            if (group) onPick(group)
          }}
        />
        <group ref={extras}>
          {!inspecting && <LidarSweep blockedRef={blockedRef} />}
          {!inspecting && <RobotLights driveRef={driveRef} night={night} scale={world.scale} />}
        </group>
        <StageLights storyRef={storyRef} />
      </group>
    </group>
  )
}

function Stops({ world, visited, target }: { world: DriveWorld; visited: ReadonlySet<number>; target: number | null }) {
  const S = world.scale
  return (
    <>
      {world.stops.map((stop, index) => {
        const at = onFloor(world, stop, 0.06)
        const done = visited.has(index)
        const color = done ? ACCENT : index === target ? '#ffd166' : '#d8e7f2'
        return (
          <group key={index} position={at}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
              <ringGeometry args={[0.75 * S, 1 * S, 40]} />
              <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
            </mesh>
            {done && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
                <circleGeometry args={[0.75 * S, 40]} />
                <meshBasicMaterial color={ACCENT} transparent opacity={0.35} depthWrite={false} />
              </mesh>
            )}
            <Html position={[0, 2.2 * S, 0]} center zIndexRange={[3, 0]}>
              <span className="lp3-drive__stop" data-state={done ? 'done' : index === target ? 'target' : 'idle'}>
                <b>{index + 1}</b>{world.id === 'fpt' && <em>{stop.label}</em>}
              </span>
            </Html>
          </group>
        )
      })}
    </>
  )
}

const ahead = new Vector3()
const eye = new Vector3()
const toCamera = new Vector3()

/**
 * Drives the camera: high behind the robot ("Chase"), circling it low
 * ("Điện ảnh"), straight down ("Trên cao"), or (while inspecting) orbiting it
 * close up, turned to the picked part.
 */
function CameraRig({ world, driveRef, rigRef, focusRef, storyRef, view, picked, zoom, framing }: {
  world: DriveWorld
  storyRef: MutableRefObject<number>
  driveRef: MutableRefObject<DriveState>
  rigRef: MutableRefObject<RigState | null>
  /** Camera's distance to what it looks at while inspecting, for the backdrop's fog. */
  focusRef: MutableRefObject<number>
  view: View
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
  const backRef = useRef<number>(world.chase.back)
  const orbiting = useRef<unknown>(null)
  const shift = useRef<Framing>({ ...framing })
  const circle = useRef(0)
  const swing = useRef(0)
  const entry = useRef(new Vector3())
  const S = world.scale

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    const state = driveRef.current
    const at = onFloor(world, state)
    // Slide the picture so the robot sits beside the text and panel, not under them.
    const glide = Math.min(1, delta * 4)
    shift.current.x += (framing.x - shift.current.x) * glide
    shift.current.y += (framing.y - shift.current.y) * glide
    if (camera instanceof PerspectiveCamera && size.width > 0) camera.setViewOffset(size.width, size.height, shift.current.x * size.width, shift.current.y * size.height, size.width, size.height)
    if (view === 'inspect') {
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
    const forward = new Vector3(Math.cos(state.yaw), 0, Math.sin(state.yaw))
    if (storyRef.current < 1) {
      // The scroll story: each chapter's shot round the robot, followed closely so scrolling feels like scrubbing a film.
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
      return
    }
    if (view === 'chase') {
      // High behind, looking down at about 45°; closer in (and higher) rather than behind a wall.
      const room = Math.max(0.6, Math.min(world.chase.back, world.cameraRoom(state, state.yaw, world.chase.back)))
      backRef.current += (room - backRef.current) * Math.min(1, delta * (room < backRef.current ? 12 : 2))
      const back = backRef.current
      eye.copy(at).addScaledVector(forward, -back * S).setY(at.y + (world.chase.height + (world.chase.back - back) * 0.8) * S)
      ahead.copy(at).addScaledVector(forward, world.chase.ahead * S).setY(at.y + 0.4 * S)
    } else if (view === 'cinema') {
      circle.current += delta * 0.16
      eye.copy(at).add(new Vector3(Math.cos(circle.current) * world.cinema.distance * S, world.cinema.height * S, Math.sin(circle.current) * world.cinema.distance * S))
      ahead.copy(at).setY(at.y + 0.7 * S)
    } else {
      eye.copy(at).add(new Vector3(0, world.top * S, 0.35 * world.top * S))
      ahead.copy(at)
    }
    const blend = first.current ? 1 : 1 - Math.exp(-(view === 'chase' ? 4 : 2.5) * delta)
    first.current = false
    camera.position.lerp(eye, blend)
    look.current.lerp(ahead, blend)
    camera.lookAt(look.current)
  })
  return null
}

/** Puts `fog` on the scene; the returned function takes it off again. */
function attachFog(scene: Scene, fog: Fog) {
  scene.fog = fog
  return () => { scene.fog = null }
}

const DIGITAL = new Color('#03111b')
/** The haze the campus sinks into behind the robot in the story's opening close-ups. */
const STAGE = new Color('#0b1822')
const tint = new Color()

/** The canvas background follows the fog colour (the map's sky, or the story's dark). */
function paintBackground(scene: Scene, color: Color) {
  if (scene.background instanceof Color) scene.background.copy(color)
}

function setFog(fog: Fog, color: Color, near: number, far: number) {
  fog.color.copy(color)
  fog.near = near
  fog.far = far
}

/**
 * The haze over the far map, and while inspecting a fog that closes in round
 * the robot and then hides the map, leaving it alone on a quiet floor with its
 * shadow; leaving brings the map back.
 */
function FocusBackdrop({ world, night, on, mapRef, focusRef, driveRef, storyRef, digital }: {
  world: DriveWorld
  night: boolean
  on: boolean
  storyRef: MutableRefObject<number>
  /** The story's digital chapters: a dark backdrop and a cyan floor grid. */
  digital: boolean
  mapRef: MutableRefObject<Group | null>
  focusRef: MutableRefObject<number>
  driveRef: MutableRefObject<DriveState>
}) {
  const scene = useThree(state => state.scene)
  const fog = useMemo(() => new Fog('#000000', 400, 800), [])
  const floor = useRef<Group>(null)
  const amount = useRef(0)
  const beams = useRef<Object3D[] | null>(null)
  const S = world.scale
  useEffect(() => attachFog(scene, fog), [scene, fog])
  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    amount.current += Math.max(-delta / 0.7, Math.min(delta / 0.7, (on ? 1 : 0) - amount.current))
    const look = storyLook(storyRef.current)
    const story = look.digital
    // Inspecting or the digital chapters close the fog right round the robot and then hide the map;
    // the opening close-ups only draw it in part of the way, so the campus is still there, hazy and dim.
    const close = Math.max(amount.current, story)
    const level = Math.max(close, look.stage * 0.72)
    const t = ease(level)
    const sky = world.sky(night)
    tint.set(sky.background).lerp(STAGE, look.stage * (1 - story) * 0.72).lerp(DIGITAL, story)
    const near = focusRef.current + 1.4 * S
    // Far off, then closing in: interpolate on a log scale so the fog visibly sweeps in.
    setFog(fog, tint, near * (sky.fogNear / near) ** (1 - t), (near + 2.6 * S) * (sky.fogFar / (near + 2.6 * S)) ** (1 - t))
    paintBackground(scene, tint)
    if (mapRef.current) mapRef.current.visible = close < 0.98
    // The Twin's lamp beams are drawn without fog, so they go with the map.
    // Searched for a few times while the map loads (a search walks the whole scene), then kept.
    if (beams.current === null || (beams.current.length === 0 && Math.random() < 0.02)) beams.current = ['downlight-beam', 'downlight-floor-glow'].map(name => scene.getObjectByName(name)).filter((item): item is Object3D => Boolean(item))
    for (const beam of beams.current) beam.visible = level < 0.05
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
      <Grid args={[10 * S, 10 * S]} cellSize={0.1 * S} cellThickness={0.6} cellColor={digital ? '#145566' : night ? '#3c5465' : '#9fb3bf'} sectionSize={0.5 * S} sectionThickness={1} sectionColor={digital ? '#2bb7d6' : night ? '#4f6c80' : '#7f97a6'} fadeDistance={8 * S} fadeStrength={1.6} infiniteGrid />
    </group>
  )
}

/** Places the callouts after the camera has moved; hides them while driving. */
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

const TAG_SLOTS = 3
const TAG_NAMES = { person: 'Người đi bộ', car: 'Ô tô' } as const

/** Tags over the nearest people and cars the robot tracks, with their distance, as on the robot's own display. */
function TrackedTags({ world, senseRef }: { world: DriveWorld; senseRef: MutableRefObject<Sensing | null> }) {
  const groups = useRef<(Group | null)[]>([])
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  useFrame(() => {
    const seen = senseRef.current?.tracked.filter(item => item.distance > 1.2 && item.distance < 22) ?? []
    for (let i = 0; i < TAG_SLOTS; i += 1) {
      const group = groups.current[i]
      const label = labels.current[i]
      const item = seen[i]
      if (!group || !label) continue
      group.visible = Boolean(item)
      label.style.display = item ? '' : 'none'
      if (!item) continue
      // Each slot a little higher than the one before, so tags of people standing together do not cover each other.
      group.position.copy(onFloor(world, item, (item.kind === 'car' ? 2.4 : 2.3) + i * 0.55))
      label.textContent = `${TAG_NAMES[item.kind]} · ${Math.round(item.distance)} m`
    }
  })
  return (
    <>
      {Array.from({ length: TAG_SLOTS }, (_, i) => (
        <group key={i} ref={node => { groups.current[i] = node }} visible={false}>
          <Html center zIndexRange={[3, 0]}>
            <span className="lp3-td__tag" ref={node => { labels.current[i] = node }} style={{ display: 'none' }} />
          </Html>
        </group>
      ))}
    </>
  )
}

/** A trip the robot drives by itself: the stop it heads for and the path there (first point: where it set off). */
type Autopilot = { target: number; route: DrivePoint[] }

/** Runs the drive: input in, pose out, a few read-outs back to the page. Held still while the robot is inspected. */
function DriveLoop({ world, driveRef, keysRef, blockedRef, senseRef, storyRef, autopilot, parked: held, reset, showRoute = true, onArrive, onHud, onAutopilotDone }: {
  world: DriveWorld
  /** Draw the trip's path on the floor (not on the showcase's stage). */
  showRoute?: boolean
  storyRef: MutableRefObject<number>
  driveRef: MutableRefObject<DriveState>
  keysRef: MutableRefObject<Set<string>>
  blockedRef: MutableRefObject<boolean>
  senseRef: MutableRefObject<Sensing | null>
  autopilot: Autopilot | null
  parked: boolean
  reset: number
  onArrive: (index: number) => void
  onHud: (hud: DriveHud) => void
  onAutopilotDone: (target: number) => void
}) {
  const pathRef = useRef<DrivePoint[]>([])
  const lastHudRef = useRef(0)
  // The robot starts on a stop, which counts as reached already.
  const nearRef = useRef<number | null>(world.start.stop)
  const finishedRef = useRef(false)

  useEffect(() => { nearRef.current = world.start.stop }, [reset, world])
  useEffect(() => {
    pathRef.current = autopilot?.route.slice(1) ?? []
    finishedRef.current = false
  }, [autopilot])

  useFrame((state, frameDelta) => {
    // A slow frame still moves the robot its proper distance; a long pause (tab away) does not.
    const delta = Math.min(frameDelta, 0.1)
    // Inspected, or parked by the story for its digital chapters.
    const parked = held || storyLook(storyRef.current).parked
    let input = parked ? { throttle: 0, steer: 0, brake: true } : inputFromKeys(keysRef.current)
    if (autopilot && !parked) {
      const step = followPath(driveRef.current, pathRef.current)
      pathRef.current = step.path
      input = step.input
      // Report the arrival once; the next trip comes back through `autopilot`.
      if (step.path.length === 0 && !finishedRef.current) { finishedRef.current = true; onAutopilotDone(autopilot.target) }
    }
    const sense = world.sense?.(driveRef.current) ?? null
    senseRef.current = sense
    // Someone straight ahead: the robot waits, as the real one does for people in its way.
    const person = sense?.ahead !== null && sense?.ahead !== undefined && sense.ahead < GIVE_WAY && input.throttle > 0
    if (person) input = { ...input, throttle: 0, brake: true }
    driveRef.current = stepDrive(driveRef.current, input, delta, world.canMove)
    blockedRef.current = driveRef.current.blocked || person
    const stop = nearestStop(driveRef.current, world.stops)
    if (stop && stop.distance < ARRIVE && nearRef.current !== stop.index) onArrive(stop.index)
    nearRef.current = stop && stop.distance < ARRIVE ? stop.index : null
    if (state.clock.elapsedTime - lastHudRef.current > 0.15) {
      lastHudRef.current = state.clock.elapsedTime
      onHud({
        speed: driveRef.current.speed,
        blocked: driveRef.current.blocked,
        person,
        tracked: sense?.tracked.length ?? 0,
        stop: stop?.index ?? null,
        stopDistance: stop?.distance ?? 0,
        turn: autopilot ? nextTurn(driveRef.current, [driveRef.current, ...pathRef.current]) : null,
      })
    }
  })

  return showRoute && autopilot && autopilot.route.length > 1
    ? <Line points={autopilot.route.map(point => onFloor(world, point, 0.12))} color={ACCENT} lineWidth={3} transparent opacity={0.85} dashed dashSize={0.3 * world.scale} gapSize={0.2 * world.scale} />
    : null
}

function LoadBar() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div className="lp3-td__load" role="status">
      <span style={{ width: `${Math.round(progress)}%` }} />
      <p>Đang tải bản đồ · {Math.round(progress)}%</p>
    </div>
  )
}

/** A key on the panel: hold it to drive (like the keyboard key it shows), or press it once for an action. */
function Keycap({ id, label, held, onHold, onPress, children, wide = false }: { id?: string; label: string; held?: boolean; onHold?: (id: string, on: boolean) => void; onPress?: () => void; children: ReactNode; wide?: boolean }) {
  const press = (event: ReactPointerEvent<HTMLButtonElement>, on: boolean) => {
    if (!id || !onHold) return
    if (on) event.currentTarget.setPointerCapture(event.pointerId)
    onHold(id, on)
  }
  return (
    <button
      type="button"
      className="lp3-td__key"
      data-wide={wide}
      aria-label={label}
      aria-pressed={id ? Boolean(held) : undefined}
      onPointerDown={event => press(event, true)}
      onPointerUp={event => press(event, false)}
      onPointerCancel={event => press(event, false)}
      onLostPointerCapture={() => { if (id && onHold) onHold(id, false) }}
      onClick={onPress}
      onContextMenu={event => event.preventDefault()}
    >{children}</button>
  )
}

/** Keys that drive; the arrows and Space also scroll the page, so they only drive once the map has focus. */
const DRIVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '])
const PAGE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '])
/** Below this stage width the panel becomes a sheet along the bottom. */
const WIDE = 900
const kmh = (metres: number) => (Math.abs(metres) * 3.6).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const meters = (value: number) => Math.round(value).toLocaleString('vi-VN')
const isInside = (group: PartGroupId) => !CASING.has(group) && group !== 'frame'
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
/** `inputFromKeys` reads the arrow names as the browser spells them; letters arrive lower-cased here. */
const keyName = (key: string) => key.toLowerCase()
const asInput = (name: string) => ({ arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight' } as Record<string, string>)[name] ?? name

type StageProps = {
  world: DriveWorld
  /** The maps to choose from (the switch shows when there are several). */
  worlds: readonly DriveWorld[]
  mode: ViewerMode
  quality: Quality
  /** Sets the look; an automatic change (`auto`) is refused once the visitor has chosen. Returns whether it was applied. */
  onQuality: (quality: Quality, auto?: boolean) => boolean
  /** Where the test drive is, linked from the showcase. */
  driveTo: string
  night: boolean
  visible: boolean
  /** Scroll story progress, 0..1 (1: over, the drive is on). */
  storyRef: MutableRefObject<number>
  /** Chapter of the story on screen; `STORY_CHAPTERS.length` once it is over. */
  chapter: number
  intro?: ReactNode
  onWorld: (id: WorldId) => void
  onNight: (night: boolean) => void
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

/** One drive on one map; switching maps starts a new one. */
function DriveStage({ world, worlds, mode, quality, onQuality, driveTo, night, visible, storyRef, chapter, intro, onWorld, onNight }: StageProps) {
  const showcase = mode === 'showcase'
  const lite = quality === 'smooth'
  const driveRef = useRef<DriveState>(freshDrive(world))
  const keysRef = useRef(new Set<string>())
  const blockedRef = useRef(false)
  const senseRef = useRef<Sensing | null>(null)
  const rigRef = useRef<RigState | null>(null)
  const calloutsRef = useRef<CalloutFrame | null>(null)
  const focusRef = useRef(INSPECT.together * world.scale)
  const mapRef = useRef<Group | null>(null)
  const clearRef = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const inViewRef = useRef(false)
  const zoom = useZoom(stageRef)
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set())
  // On arrival the robot drives itself and the camera circles it; the first key the visitor presses takes over with the chase camera.
  const [view, setView] = useState<View>('cinema')
  const [lastDriveView, setLastDriveView] = useState<DriveView>('cinema')
  const cameraChosen = useRef(false)
  const [picked, setPicked] = useState<PartGroupId | null>(null)
  const [hovered, setHovered] = useState<PartGroupId | null>(null)
  const [apart, setApart] = useState(false)
  const [shellOpen, setShellOpen] = useState(false)
  const [wide, setWide] = useState(true)
  /** Room the panel takes at the stage's right edge, px: callouts keep clear of it. */
  const [panelSpace, setPanelSpace] = useState(420)
  const [stageWidth, setStageWidth] = useState(1200)
  // The showcase on a wide screen keeps its title and panel in a column at the left (CSS: min(420px, 31%) from 28px);
  // the robot and its callouts have the room to the right of it.
  const sideSpace = showcase && wide ? 28 + Math.min(420, stageWidth * 0.31) + 40 : wide ? 32 : 14
  /** The visitor has turned the robot themselves: the showcase stops turning it slowly. */
  const [touched, setTouched] = useState(false)
  // Pixel ratio: as sharp as the screen allows (up to 1.5), lowered while the frame rate drops.
  const maxDpr = useMemo(() => Math.min(1.5, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1), [])
  const [dpr, setDpr] = useState(maxDpr)
  const dprRef = useRef(maxDpr)
  /** No judging the frame rate before this time: the first seconds while the map loads, and just after the tab comes back. */
  const armedAt = useRef(0)
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([world.start.stop]))
  const seenRef = useRef<ReadonlySet<number>>(visited)
  const [autopilot, setAutopilot] = useState<Autopilot | null>(() => {
    const target = (world.start.stop + 1) % world.stops.length
    return { target, route: world.route(world.stops[world.start.stop], target) }
  })
  const [hud, setHud] = useState<DriveHud>({ speed: 0, blocked: false, person: false, tracked: 0, stop: world.start.stop, stopDistance: 0, turn: null })
  const [toast, setToast] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [reset, setReset] = useState(0)
  const [model, setModel] = useState<RobotParts | null>(null)

  const interactive = chapter >= STORY_CHAPTERS.length
  // The showcase shows the robot's parts once the story has played (and the story again if scrolled back up).
  const inspecting = showcase ? interactive : view === 'inspect'
  const digital = chapter >= 2 && !interactive
  const opened = inspecting && (shellOpen || (picked !== null && isInside(picked)))
  const highlight = useMemo(() => (inspecting && picked ? [picked] : []), [inspecting, picked])
  const info = inspecting && picked ? partGroup(picked) : null
  const sky = world.sky(night)
  // Wide: the robot sits right of the title while driving, in the middle of the free space while inspected.
  // Narrow: a little above the middle, clear of the bottom sheet.
  // During the story the robot sits right of the chapter text, the tunnel and chip straight ahead in the middle.
  const framing: Framing = !interactive
    ? (wide ? { x: chapter >= 3 ? 0 : -0.1, y: 0 } : { x: 0, y: chapter >= 3 ? 0 : 0.12 })
    : showcase
      // The showcase: in the middle of the room right of the title and panel; above the sheet on a phone.
      ? (wide ? { x: -(sideSpace - 32) / (2 * stageWidth), y: -0.01 } : { x: 0, y: 0.16 })
      : wide ? { x: inspecting ? 0.12 : -0.06, y: inspecting ? 0 : 0.04 } : { x: 0, y: inspecting ? 0.22 : 0.2 }

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const observers: { disconnect: () => void }[] = []
    if (typeof ResizeObserver !== 'undefined') {
      const resize = new ResizeObserver(([entry]) => {
        const width = entry?.contentRect.width ?? 1200
        setWide(width >= WIDE)
        setStageWidth(width)
        const panel = panelRef.current
        if (panel) setPanelSpace(Math.max(0, width - panel.offsetLeft) + 16)
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

  /** The next stop not reached yet, going round from `from`, and the path to it from where the robot stands. */
  const planNext = useCallback((from: number): Autopilot => {
    const count = world.stops.length
    let target = (from + 1) % count
    for (let step = 1; step <= count; step += 1) {
      const index = (from + step) % count
      if (!seenRef.current.has(index)) { target = index; break }
    }
    return { target, route: world.route(driveRef.current, target) }
  }, [world])

  const onArrive = useCallback((index: number) => {
    if (seenRef.current.has(index)) return
    const next = new Set(seenRef.current).add(index)
    seenRef.current = next
    setVisited(next)
    setToast(next.size === world.stops.length ? `Đã ghé đủ ${world.stops.length} điểm dừng!` : `Đã tới ${world.stops[index].label}`)
  }, [world])

  const onAutopilotDone = useCallback((target: number) => setAutopilot(planNext(target)), [planNext])

  /** Look at the robot on the spot, turned to `group` if given. */
  const inspect = useCallback((group: PartGroupId | null) => {
    setView(current => {
      if (current !== 'inspect') setLastDriveView(current)
      return 'inspect'
    })
    setPicked(group)
    setAutopilot(null)
  }, [])

  /** Back to driving: the robot closes up and goes back together. */
  const driveOn = useCallback((next?: DriveView) => {
    setView(current => (current === 'inspect' ? next ?? lastDriveView : next ?? current))
    setPicked(null)
    setApart(false)
    setShellOpen(false)
  }, [lastDriveView])

  const pickPart = (group: PartGroupId) => {
    if (!interactive) return
    if (!inspecting) { inspect(group); return }
    setPicked(current => (current === group ? null : group))
  }

  /** The visitor drives: from the circling camera to the chase camera, unless they picked a camera themselves. */
  const takeOver = useCallback(() => {
    if (cameraChosen.current) return
    cameraChosen.current = true
    setView(current => (current === 'cinema' ? 'chase' : current))
    setLastDriveView(current => (current === 'cinema' ? 'chase' : current))
  }, [])

  const hold = useCallback((id: string, on: boolean) => {
    if (on) keysRef.current.add(id)
    else keysRef.current.delete(id)
    setHeld(new Set(keysRef.current))
    if (on) setStarted(true)
    if (on && id !== 'brake') {
      setAutopilot(null)
      if (view === 'inspect') driveOn()
      takeOver()
    }
  }, [view, driveOn, takeOver])

  const toggleAutopilot = useCallback(() => {
    if (view === 'inspect') driveOn()
    setStarted(true)
    setAutopilot(current => (current ? null : planNext(hud.stop ?? 0)))
  }, [view, driveOn, planNext, hud.stop])

  const restart = useCallback(() => {
    driveRef.current = freshDrive(world)
    keysRef.current.clear()
    seenRef.current = new Set([world.start.stop])
    setHeld(new Set())
    setVisited(seenRef.current)
    setAutopilot(null)
    setReset(value => value + 1)
  }, [world])

  const nextCamera = useCallback(() => {
    cameraChosen.current = true
    const from = view === 'inspect' ? lastDriveView : view
    const next = CAMERAS[(CAMERAS.findIndex(item => item.id === from) + 1) % CAMERAS.length].id
    if (view === 'inspect') driveOn(next)
    else setView(next)
  }, [view, lastDriveView, driveOn])

  useEffect(() => { armedAt.current = performance.now() + 8000 }, [quality])
  // Coming back to a tab that was in the background looks like a slow frame: not counted.
  useEffect(() => {
    const away = () => { armedAt.current = Math.max(armedAt.current, performance.now() + 4000) }
    document.addEventListener('visibilitychange', away)
    return () => document.removeEventListener('visibilitychange', away)
  }, [])

  /** A low frame rate: less sharpness first; still low at the least, the lighter look (said once). */
  const declined = useCallback(() => {
    if (performance.now() < armedAt.current) return
    const next = Math.max(0.75, Math.round((dprRef.current - 0.25) * 100) / 100)
    if (next < dprRef.current) {
      dprRef.current = next
      setDpr(next)
      return
    }
    if (!lite && onQuality('smooth', true)) setToast('Đã chuyển sang đồ họa Mượt cho êm hơn')
  }, [lite, onQuality])
  const inclined = useCallback(() => {
    const next = Math.min(maxDpr, dprRef.current + 0.25)
    dprRef.current = next
    setDpr(next)
  }, [maxDpr])

  // Keys: W A S D, P, C, N and R whenever the section fills most of the screen;
  // the arrows and Space only once the map has focus, so they still scroll the page otherwise.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!interactive || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
      const inside = stageRef.current?.contains(event.target as Node) ?? false
      if (!inside && !inViewRef.current) return
      const name = keyName(event.key)
      // The showcase is not driven: Escape only lets go of the part.
      if (showcase) { if (name === 'escape') setPicked(null); return }
      if (name === 'escape' && view === 'inspect') { driveOn(); return }
      if (name === 'c') { nextCamera(); return }
      if (name === 'p') { toggleAutopilot(); return }
      if (name === 'r') { restart(); return }
      if (name === 'n' && world.hasNight) { onNight(!night); return }
      if (!DRIVE_KEYS.has(name) || (PAGE_KEYS.has(name) && !inside)) return
      event.preventDefault()
      setStarted(true)
      keysRef.current.add(asInput(name))
      if (name !== ' ') {
        setAutopilot(null)
        if (view === 'inspect') driveOn()
        takeOver()
      }
    }
    const up = (event: KeyboardEvent) => { keysRef.current.delete(asInput(keyName(event.key))) }
    const clear = () => { keysRef.current.clear(); setHeld(new Set()) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [showcase, interactive, view, driveOn, takeOver, nextCamera, toggleAutopilot, restart, world, night, onNight])

  const shown = CALLOUTS.map(callout => inspecting && (picked ? callout.group === picked : apart || Boolean(callout.key)))
  const calloutState = CALLOUTS.map(callout => (callout.group === picked ? 'picked' as const : hovered === callout.group ? 'focus' as const : 'idle' as const))
  const camLabel = CAMERAS.find(item => item.id === (inspecting ? lastDriveView : view))?.label ?? ''
  const status = inspecting ? 'Xem cấu tạo' : autopilot ? 'Tự hành' : 'Lái tay'
  const hint = inspecting ? (showcase && (touched || picked) ? null : 'Kéo để xoay · bấm linh kiện hoặc chú thích để xem') : started ? null : 'Nhấn W hoặc ↑ để lái robot'
  const nearest = hud.stop === null ? '' : `${world.stops[hud.stop].label} · ${meters(hud.stopDistance)} m`
  const message = hud.person
    ? 'Người phía trước · dừng chờ'
    : hud.blocked
      ? 'LiDAR · vật cản phía trước'
      : hud.turn
        ? `Rẽ ${hud.turn.side === 'left' ? 'trái' : 'phải'} sau ${meters(hud.turn.distance)} m`
        : autopilot
          ? `Đi thẳng tới ${world.stops[autopilot.target].label}`
          : 'LiDAR · thông thoáng'

  return (
    <div
      className="lp3-td"
      ref={stageRef}
      tabIndex={-1}
      role="application"
      aria-label={showcase
        ? 'Mô hình 3D robot CampusTour. Kéo để xoay, bấm vào một linh kiện hoặc chú thích để xem chi tiết.'
        : `Robot trên bản đồ ${world.label}. W A S D hoặc phím mũi tên để lái, Space phanh, P tự hành, C đổi máy quay${world.hasNight ? ', N ngày hoặc đêm' : ''}. Bấm vào robot để xem cấu tạo.`}
      data-mode={mode}
      style={{ ['--td-side' as string]: `${sideSpace}px` }}
      data-view={inspecting ? 'inspect' : 'drive'}
      data-hovering={hovered ? 'true' : 'false'}
      data-night={night && world.hasNight}
      data-story={interactive ? 'done' : 'on'}
      onBlur={event => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        keysRef.current.clear()
        setHeld(new Set())
      }}
    >
      <Canvas
        className="lp3-td__canvas"
        frameloop={visible ? 'always' : 'never'}
        shadows
        dpr={dpr}
        camera={{ position: [4, 17, 12], fov: 46, near: 0.02, far: 600 }}
        onPointerMissed={() => { if (inspecting) setPicked(null) }}
      >
        <color attach="background" args={[sky.background]} />
        {!showcase && <PerformanceMonitor onDecline={declined} onIncline={inclined} />}
        <world.Lights night={night} driveRef={driveRef} lite={lite} />
        <group ref={mapRef}><world.Map night={night} driveRef={driveRef} clearRef={clearRef} lite={lite} /></group>
        <FocusBackdrop world={world} night={night} on={inspecting} mapRef={mapRef} focusRef={focusRef} driveRef={driveRef} storyRef={storyRef} digital={digital} />
        {!inspecting && interactive && <Stops world={world} visited={visited} target={autopilot?.target ?? null} />}
        {!inspecting && interactive && world.sense && <TrackedTags world={world} senseRef={senseRef} />}
        {!interactive && <StoryScenery world={world} driveRef={driveRef} storyRef={storyRef} />}
        <RobotOnMap world={world} night={night && world.hasNight} driveRef={driveRef} blockedRef={blockedRef} rigRef={rigRef} storyRef={storyRef} clearRef={clearRef} inspecting={inspecting} apart={inspecting && apart} opened={opened} highlight={highlight} hovered={hovered} onHover={setHovered} onPick={pickPart} onModel={setModel} />
        <DriveLoop world={world} driveRef={driveRef} keysRef={keysRef} blockedRef={blockedRef} senseRef={senseRef} storyRef={storyRef} autopilot={autopilot} parked={inspecting} reset={reset} showRoute={!showcase} onArrive={onArrive} onHud={setHud} onAutopilotDone={onAutopilotDone} />
        {inspecting && <OrbitControls makeDefault enablePan={false} enableZoom={false} minPolarAngle={Math.PI * 0.12} maxPolarAngle={Math.PI * 0.48} autoRotate={showcase && !touched && !picked} autoRotateSpeed={0.45} onStart={() => setTouched(true)} />}
        <CameraRig world={world} driveRef={driveRef} rigRef={rigRef} focusRef={focusRef} storyRef={storyRef} view={inspecting ? 'inspect' : view} picked={inspecting ? picked : null} zoom={inspecting ? zoom.level : 1} framing={framing} />
        <CalloutTracker rigRef={rigRef} calloutsRef={calloutsRef} active={inspecting} />
      </Canvas>
      <LoadBar />
      <div className="lp3-td__scrim" aria-hidden="true" />

      <CalloutLabels frameRef={calloutsRef} shown={shown} state={calloutState} side={picked ? 'left' : undefined} top={wide ? 110 : showcase ? 150 : 150} bottom={wide ? 40 : 360} left={sideSpace} right={showcase ? (wide ? 32 : 14) : wide ? panelSpace : 14} onHover={setHovered} onPick={pickPart} />

      <p className="lp3-td__where" aria-hidden="true"><i />{world.title}</p>

      <div className="lp3-td__intro">
        {intro}
        {interactive && !showcase && (
          <div className="lp3-td__cta">
            <button type="button" className="lp3-td__btn lp3-td__btn--light" onClick={() => inspect(null)}>Xem cấu tạo</button>
          </div>
        )}
      </div>

      {interactive && hint && <p className="lp3-td__hint" aria-hidden="true">{hint}</p>}
      {interactive && toast && !inspecting && <p className="lp3-td__toast" role="status">{toast}</p>}
      {!interactive && <StorySteps chapter={chapter} />}

      <aside className="lp3-td__panel" ref={panelRef} aria-hidden={!interactive} inert={!interactive} aria-label={inspecting ? 'Cấu tạo robot' : 'Bảng điều khiển robot'}>
        <div className="lp3-td__row lp3-td__row--head">
          <span>{inspecting ? 'Cấu tạo' : 'Cách thức'}</span>
          <b><i data-live={!inspecting} />{inspecting ? (model ? `${model.pieces.length} chi tiết · ${PART_GROUPS.length} nhóm` : 'Đang tải…') : status}</b>
        </div>

        {inspecting ? (
          <>
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
                  <p>{showcase ? 'Kéo để xoay robot. Bấm vào một linh kiện trên xe, một chú thích hoặc một tên dưới đây để mở vỏ và xem nó.' : 'Bấm vào một linh kiện trên xe hoặc một chú thích để mở vỏ và xem nó.'}</p>
                </>
              )}
            </div>
            {showcase && (
              <div className="lp3-td__parts" role="group" aria-label="Chọn linh kiện">
                {PART_GROUPS.map(group => (
                  <button key={group.id} type="button" aria-pressed={picked === group.id} onClick={() => pickPart(group.id)} onPointerEnter={() => setHovered(group.id)} onPointerLeave={() => setHovered(null)}>
                    <i style={{ background: group.color }} aria-hidden="true" />{group.label}
                  </button>
                ))}
              </div>
            )}
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
            {showcase ? (
              <div className="lp3-td__actions lp3-td__actions--go">
                <Link to={driveTo} className="lp3-td__btn lp3-td__btn--lime"><Gamepad2 size={15} aria-hidden="true" />Lái thử robot trên bản đồ</Link>
              </div>
            ) : (
              <div className="lp3-td__actions">
                <button type="button" className="lp3-td__btn lp3-td__btn--light" onClick={() => driveOn()}><Gamepad2 size={15} aria-hidden="true" />Lái tiếp</button>
              </div>
            )}
          </>
        ) : (
          <>
            {worlds.length > 1 && (
              <div className="lp3-td__row lp3-td__row--pick">
                <span>Bản đồ</span>
                <div className="lp3-td__seg" role="group" aria-label="Bản đồ">
                  {worlds.map(item => (
                    <button key={item.id} type="button" aria-pressed={item.id === world.id} onClick={() => onWorld(item.id)}>{item.label}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="lp3-td__row lp3-td__row--pick">
              <span>Đồ họa</span>
              <div className="lp3-td__seg" role="group" aria-label="Chất lượng đồ họa">
                <button type="button" aria-pressed={!lite} onClick={() => onQuality('high')} title="Cây, người thật và bóng đổ"><Sparkles size={14} aria-hidden="true" />Đẹp</button>
                <button type="button" aria-pressed={lite} onClick={() => onQuality('smooth')} title="Nhẹ hơn cho máy yếu"><Gauge size={14} aria-hidden="true" />Mượt</button>
              </div>
            </div>
            {world.hasNight && (
              <div className="lp3-td__row lp3-td__row--pick">
                <span>Bối cảnh</span>
                <div className="lp3-td__seg" role="group" aria-label="Ngày hoặc đêm">
                  <button type="button" aria-pressed={!night} onClick={() => onNight(false)}><Sun size={14} aria-hidden="true" />Ngày</button>
                  <button type="button" aria-pressed={night} onClick={() => onNight(true)}><Moon size={14} aria-hidden="true" />Đêm</button>
                </div>
              </div>
            )}
            <div className="lp3-td__stats">
              <div><span>Tốc độ</span><strong>{kmh(hud.speed)}<small>km/h</small></strong></div>
              {world.sense
                ? <div><span>Theo dõi</span><strong>{hud.tracked}<small>đối tượng</small></strong></div>
                : <div><span>Điểm dừng</span><strong>{visited.size}<small>/ {world.stops.length} đã ghé</small></strong></div>}
            </div>
            <div className="lp3-td__row lp3-td__row--status">
              <span data-alert={hud.blocked || hud.person}>{message}</span>
              <span>{world.sense ? `${visited.size}/${world.stops.length} điểm · ` : ''}{nearest}</span>
            </div>
            <div className="lp3-td__keys">
              <div className="lp3-td__keyline">
                <Keycap id="up" label="Tiến (W)" held={held.has('up')} onHold={hold}>W</Keycap>
                <Keycap id="left" label="Rẽ trái (A)" held={held.has('left')} onHold={hold}>A</Keycap>
                <Keycap id="down" label="Lùi (S)" held={held.has('down')} onHold={hold}>S</Keycap>
                <Keycap id="right" label="Rẽ phải (D)" held={held.has('right')} onHold={hold}>D</Keycap>
                <small>hoặc mũi tên · lái xe</small>
              </div>
              <div className="lp3-td__keyline">
                <Keycap id="brake" label="Phanh (Space)" held={held.has('brake')} onHold={hold} wide>Space</Keycap><small>phanh</small>
                <Keycap label="Tự hành (P)" onPress={toggleAutopilot}>P</Keycap><small>tự hành</small>
                <Keycap label="Đổi máy quay (C)" onPress={nextCamera}>C</Keycap><small>máy quay</small>
              </div>
            </div>
            <div className="lp3-td__actions">
              <button type="button" className="lp3-td__btn lp3-td__btn--light" onClick={() => inspect(null)}>Xem cấu tạo</button>
              <button type="button" className="lp3-td__btn" aria-pressed={autopilot !== null} onClick={toggleAutopilot}>
                {autopilot ? <Hand size={15} aria-hidden="true" /> : <Bot size={15} aria-hidden="true" />}{autopilot ? 'Lái tay' : 'Tự hành'}
              </button>
              <button type="button" className="lp3-td__btn" onClick={nextCamera} aria-label={`Máy quay: ${camLabel}. Bấm để đổi`}><Camera size={15} aria-hidden="true" />{camLabel}</button>
              <button type="button" className="lp3-td__btn lp3-td__btn--icon" onClick={restart} aria-label="Đặt lại" title="Đặt lại (R)"><RotateCcw size={15} aria-hidden="true" /></button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

const QUALITY_KEY = 'campustour.drive.quality'

/** The look the visitor picked last time, if any (storage can be off or throw). */
function savedQuality(): Quality | null {
  try {
    const value = window.localStorage.getItem(QUALITY_KEY)
    return value === 'high' || value === 'smooth' ? value : null
  } catch {
    return null
  }
}

/**
 * The CampusTour robot in 3D, a large dark card the width and height of the
 * screen. Two modes:
 *
 * - `showcase` (home page, section 04): the robot alone on a stage, no map to
 *   load. A scroll story plays first; then the visitor turns it round, takes
 *   it apart, opens its casing and picks parts (callouts or the list on the
 *   panel), with a link to the test drive.
 * - `drive` (the test-drive page): the robot on a map, the FPT University
 *   campus demo (people and traffic, day or night) or the operations Twin's
 *   floor (NVH tầng 6). W A S D (arrows once the map has focus) or the panel's
 *   keys drive; P lets it drive itself from stop to stop, C changes the camera,
 *   N switches day and night, and clicking the robot inspects it. "Đồ họa"
 *   picks the look: "Đẹp" (real trees, people, shadows) or "Mượt" (simple ones,
 *   no shadows), and a frame rate that stays low switches to "Mượt" by itself.
 *
 * A web simulation only: nothing is sent to a robot.
 */
export function RobotViewer({ worlds, mode = 'drive', driveTo = '/lai-thu-robot', visible = true, intro, storyRef, chapter = STORY_CHAPTERS.length }: {
  /** The maps; the first one opens. */
  worlds: readonly DriveWorld[]
  mode?: ViewerMode
  driveTo?: string
  visible?: boolean
  /** The kicker, title and text (or the story chapter's), laid over the stage. */
  intro?: ReactNode
  /** Scroll story progress from the section, 0..1; without it the stage starts right away. */
  storyRef?: MutableRefObject<number>
  /** Chapter of the story on screen; `STORY_CHAPTERS.length` (the default) once it is over. */
  chapter?: number
}) {
  const [worldId, setWorldId] = useState<WorldId>(worlds[0].id)
  const [night, setNight] = useState(false)
  const [saved] = useState(savedQuality)
  const [quality, setQuality] = useState<Quality>(saved ?? 'high')
  /** The visitor chose a look themselves: the frame rate no longer changes it. */
  const chosen = useRef(saved !== null)
  const done = useRef(1)
  const onQuality = useCallback((next: Quality, auto = false) => {
    if (auto && chosen.current) return false
    if (!auto) {
      chosen.current = true
      try { window.localStorage.setItem(QUALITY_KEY, next) } catch { /* storage off: this visit only */ }
    }
    setQuality(next)
    return true
  }, [])
  const world = worlds.find(item => item.id === worldId) ?? worlds[0]
  return <DriveStage key={world.id} world={world} worlds={worlds} mode={mode} quality={quality} onQuality={onQuality} driveTo={driveTo} night={night} visible={visible} storyRef={storyRef ?? done} chapter={chapter} intro={intro} onWorld={setWorldId} onNight={setNight} />
}
