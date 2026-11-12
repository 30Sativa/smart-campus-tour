import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line, PerformanceMonitor } from '@react-three/drei'
import { AdditiveBlending, Fog, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { Bot, Camera, Gauge, Hand, Moon, RotateCcw, Sparkles, Sun } from 'lucide-react'
import { followPath, inputFromKeys, nearestStop, stepDrive, type DrivePoint, type DriveState } from './drive'
import { LidarSweep, LoadBar, RobotBody } from './RobotBody'
import { ACCENT, WIDE, attachFog, freshDrive, isTyping, onFloor, setFog, slideFraming, type Framing, type RigState } from './stage'
import { nextTurn } from './worlds/geometry'
import { fptWorld } from './worlds/fpt-world'
import { nvhWorld } from './worlds/nvh-world'
import type { DriveWorld, Sensing, WorldId } from './worlds/world'

/** "Đẹp": real trees, people and shadows; "Mượt": simple ones and no shadows, for slower computers. */
export type Quality = 'high' | 'smooth'
/** Closer than this to a stop counts as having reached it, m. */
const ARRIVE = 1.6
/** The robot brakes for someone straight ahead closer than this, m. */
const GIVE_WAY = 2.2
const WORLDS: readonly DriveWorld[] = [fptWorld, nvhWorld]

type View = 'chase' | 'cinema' | 'top'
const CAMERAS: { id: View; label: string }[] = [
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

/** Drives the camera: high behind the robot ("Chase"), circling it low ("Điện ảnh") or straight down ("Trên cao"). */
function DriveCamera({ world, driveRef, view, framing }: { world: DriveWorld; driveRef: MutableRefObject<DriveState>; view: View; framing: Framing }) {
  const camera = useThree(state => state.camera)
  const size = useThree(state => state.size)
  const look = useRef(new Vector3())
  const first = useRef(true)
  const backRef = useRef<number>(world.chase.back)
  const shift = useRef<Framing>({ ...framing })
  const circle = useRef(0)
  const S = world.scale

  useFrame((_, frameDelta) => {
    const delta = Math.min(frameDelta, 0.1)
    const state = driveRef.current
    const at = onFloor(world, state)
    slideFraming(camera, size.width, size.height, shift.current, framing, delta)
    const forward = new Vector3(Math.cos(state.yaw), 0, Math.sin(state.yaw))
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

/** The map's haze: its sky's fog, day or night. */
function SkyFog({ world, night }: { world: DriveWorld; night: boolean }) {
  const scene = useThree(state => state.scene)
  const fog = useMemo(() => new Fog('#000000', 400, 800), [])
  useEffect(() => attachFog(scene, fog), [scene, fog])
  useEffect(() => {
    const sky = world.sky(night)
    setFog(fog, sky.background, sky.fogNear, sky.fogFar)
  }, [fog, world, night])
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

/** Runs the drive: input in, pose out, a few read-outs back to the page. */
function DriveLoop({ world, driveRef, keysRef, blockedRef, senseRef, autopilot, reset, onArrive, onHud, onAutopilotDone }: {
  world: DriveWorld
  driveRef: MutableRefObject<DriveState>
  keysRef: MutableRefObject<Set<string>>
  blockedRef: MutableRefObject<boolean>
  senseRef: MutableRefObject<Sensing | null>
  autopilot: Autopilot | null
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
    let input = inputFromKeys(keysRef.current)
    if (autopilot) {
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

  return autopilot && autopilot.route.length > 1
    ? <Line points={autopilot.route.map(point => onFloor(world, point, 0.12))} color={ACCENT} lineWidth={3} transparent opacity={0.85} dashed dashSize={0.3 * world.scale} gapSize={0.2 * world.scale} />
    : null
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
const kmh = (metres: number) => (Math.abs(metres) * 3.6).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const meters = (value: number) => Math.round(value).toLocaleString('vi-VN')
/** `inputFromKeys` reads the arrow names as the browser spells them; letters arrive lower-cased here. */
const keyName = (key: string) => key.toLowerCase()
const asInput = (name: string) => ({ arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight' } as Record<string, string>)[name] ?? name

type StageProps = {
  world: DriveWorld
  quality: Quality
  /** Sets the look; an automatic change (`auto`) is refused once the visitor has chosen. Returns whether it was applied. */
  onQuality: (quality: Quality, auto?: boolean) => boolean
  night: boolean
  intro?: ReactNode
  onWorld: (id: WorldId) => void
  onNight: (night: boolean) => void
}

/** One drive on one map; switching maps starts a new one. */
function DriveStage({ world, quality, onQuality, night, intro, onWorld, onNight }: StageProps) {
  const lite = quality === 'smooth'
  const driveRef = useRef<DriveState>(freshDrive(world))
  const keysRef = useRef(new Set<string>())
  const blockedRef = useRef(false)
  const senseRef = useRef<Sensing | null>(null)
  const rigRef = useRef<RigState | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const inViewRef = useRef(false)
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set())
  // On arrival the robot drives itself and the camera circles it; the first key the visitor presses takes over with the chase camera.
  const [view, setView] = useState<View>('cinema')
  const cameraChosen = useRef(false)
  const [wide, setWide] = useState(true)
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
  const sky = world.sky(night)
  // The robot sits right of the title (wide), or a little above the middle, clear of the bottom sheet (narrow).
  const framing: Framing = wide ? { x: -0.06, y: 0.04 } : { x: 0, y: 0.2 }

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
      const resize = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 1200) >= WIDE))
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

  /** The visitor drives: from the circling camera to the chase camera, unless they picked a camera themselves. */
  const takeOver = useCallback(() => {
    if (cameraChosen.current) return
    cameraChosen.current = true
    setView(current => (current === 'cinema' ? 'chase' : current))
  }, [])

  const hold = useCallback((id: string, on: boolean) => {
    if (on) keysRef.current.add(id)
    else keysRef.current.delete(id)
    setHeld(new Set(keysRef.current))
    if (on) setStarted(true)
    if (on && id !== 'brake') {
      setAutopilot(null)
      takeOver()
    }
  }, [takeOver])

  const toggleAutopilot = useCallback(() => {
    setStarted(true)
    setAutopilot(current => (current ? null : planNext(hud.stop ?? 0)))
  }, [planNext, hud.stop])

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
    setView(current => CAMERAS[(CAMERAS.findIndex(item => item.id === current) + 1) % CAMERAS.length].id)
  }, [])

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

  // Keys: W A S D, P, C, N and R whenever the stage fills most of the screen;
  // the arrows and Space only once the map has focus, so they still scroll the page otherwise.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
      const inside = stageRef.current?.contains(event.target as Node) ?? false
      if (!inside && !inViewRef.current) return
      const name = keyName(event.key)
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
  }, [takeOver, nextCamera, toggleAutopilot, restart, world, night, onNight])

  const camLabel = CAMERAS.find(item => item.id === view)?.label ?? ''
  const status = autopilot ? 'Tự hành' : 'Lái tay'
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
      aria-label={`Robot trên bản đồ ${world.label}. W A S D hoặc phím mũi tên để lái, Space phanh, P tự hành, C đổi máy quay${world.hasNight ? ', N ngày hoặc đêm' : ''}.`}
      data-mode="drive"
      data-view="drive"
      data-night={night && world.hasNight}
      data-story="done"
      onBlur={event => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        keysRef.current.clear()
        setHeld(new Set())
      }}
    >
      <Canvas className="lp3-td__canvas" shadows dpr={dpr} camera={{ position: [4, 17, 12], fov: 46, near: 0.02, far: 600 }}>
        <color attach="background" args={[sky.background]} />
        <PerformanceMonitor onDecline={declined} onIncline={inclined} />
        <SkyFog world={world} night={night} />
        <world.Lights night={night} driveRef={driveRef} lite={lite} />
        <world.Map night={night} driveRef={driveRef} lite={lite} />
        <Stops world={world} visited={visited} target={autopilot?.target ?? null} />
        {world.sense && <TrackedTags world={world} senseRef={senseRef} />}
        <RobotBody
          world={world}
          driveRef={driveRef}
          rigRef={rigRef}
          extras={<><LidarSweep blockedRef={blockedRef} /><RobotLights driveRef={driveRef} night={night && world.hasNight} scale={world.scale} /></>}
        />
        <DriveLoop world={world} driveRef={driveRef} keysRef={keysRef} blockedRef={blockedRef} senseRef={senseRef} autopilot={autopilot} reset={reset} onArrive={onArrive} onHud={setHud} onAutopilotDone={onAutopilotDone} />
        <DriveCamera world={world} driveRef={driveRef} view={view} framing={framing} />
      </Canvas>
      <LoadBar label="Đang tải bản đồ" />
      <div className="lp3-td__scrim" aria-hidden="true" />

      <p className="lp3-td__where" aria-hidden="true"><i />{world.title}</p>
      <div className="lp3-td__intro">{intro}</div>
      {!started && <p className="lp3-td__hint" aria-hidden="true">Nhấn W hoặc ↑ để lái robot</p>}
      {toast && <p className="lp3-td__toast" role="status">{toast}</p>}

      <aside className="lp3-td__panel" aria-label="Bảng điều khiển robot">
        <div className="lp3-td__row lp3-td__row--head">
          <span>Cách thức</span>
          <b><i data-live="true" />{status}</b>
        </div>
        <div className="lp3-td__row lp3-td__row--pick">
          <span>Bản đồ</span>
          <div className="lp3-td__seg" role="group" aria-label="Bản đồ">
            {WORLDS.map(item => (
              <button key={item.id} type="button" aria-pressed={item.id === world.id} onClick={() => onWorld(item.id)}>{item.label}</button>
            ))}
          </div>
        </div>
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
          <button type="button" className="lp3-td__btn" aria-pressed={autopilot !== null} onClick={toggleAutopilot}>
            {autopilot ? <Hand size={15} aria-hidden="true" /> : <Bot size={15} aria-hidden="true" />}{autopilot ? 'Lái tay' : 'Tự hành'}
          </button>
          <button type="button" className="lp3-td__btn" onClick={nextCamera} aria-label={`Máy quay: ${camLabel}. Bấm để đổi`}><Camera size={15} aria-hidden="true" />{camLabel}</button>
          <button type="button" className="lp3-td__btn lp3-td__btn--icon" onClick={restart} aria-label="Đặt lại" title="Đặt lại (R)"><RotateCcw size={15} aria-hidden="true" /></button>
        </div>
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
 * The test drive (/lai-thu-robot), a large dark card the size of the screen:
 * the robot on a map, the FPT University campus demo (people and traffic, day
 * or night) or the operations Twin's floor (NVH tầng 6). W A S D (arrows once
 * the map has focus) or the panel's keys drive; P lets it drive itself from
 * stop to stop, C changes the camera, N switches day and night. "Đồ họa"
 * picks the look: "Đẹp" (real trees, people, shadows) or "Mượt" (simple ones,
 * no shadows), and a frame rate that stays low switches to "Mượt" by itself.
 * Only driving here: the robot's parts are on the home page (RobotPartsViewer).
 *
 * A web simulation only: nothing is sent to a robot.
 */
export default function RobotDriveViewer({ intro }: { intro?: ReactNode }) {
  const [worldId, setWorldId] = useState<WorldId>(WORLDS[0].id)
  const [night, setNight] = useState(false)
  const [saved] = useState(savedQuality)
  const [quality, setQuality] = useState<Quality>(saved ?? 'high')
  /** The visitor chose a look themselves: the frame rate no longer changes it. */
  const chosen = useRef(saved !== null)
  const onQuality = useCallback((next: Quality, auto = false) => {
    if (auto && chosen.current) return false
    if (!auto) {
      chosen.current = true
      try { window.localStorage.setItem(QUALITY_KEY, next) } catch { /* storage off: this visit only */ }
    }
    setQuality(next)
    return true
  }, [])
  const world = WORLDS.find(item => item.id === worldId) ?? WORLDS[0]
  return <DriveStage key={world.id} world={world} quality={quality} onQuality={onQuality} night={night} intro={intro} onWorld={setWorldId} onNight={setNight} />
}
