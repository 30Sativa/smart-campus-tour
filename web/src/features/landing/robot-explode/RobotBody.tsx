import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { AdditiveBlending, DoubleSide, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { groupOfNode, type PartGroupId } from './parts'
import { poseRobot, scanRobot, styleRobot, useRobotParts, type RobotParts } from './robot-rig'
import type { DriveState } from './drive'
import { storyLook } from './story'
import { ACCENT, type RigState } from './stage'
import type { DriveWorld } from './worlds/world'

/** Seconds the robot takes to come apart or go back together, and to open or close. */
const EXPLODE_SECONDS = 1.3
const OPEN_SECONDS = 0.8
/** Without a scroll story the stage is past it. */
const NO_STORY = { current: 1 }
const NO_PARTS: readonly PartGroupId[] = []

/** A LiDAR sweep on the floor around the robot: a ring at the sensor's reach and a turning fan; red while something blocks the way. */
export function LidarSweep({ blockedRef }: { blockedRef: MutableRefObject<boolean> }) {
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

/**
 * The robot, placed by `driveRef`: wheels rolling with its speed (two-wheel
 * drive: turning runs one faster than the other) and the head glancing into
 * turns. On the parts stage it can also open, come apart, light up the picked
 * part and be clicked; `extras` (the LiDAR fan, lights) go once the story
 * turns digital, `children` stay.
 */
export function RobotBody({ world, driveRef, rigRef, storyRef = NO_STORY, inspecting = false, apart = false, opened = false, highlight = NO_PARTS, hovered = null, onHover, onPick, onModel, extras, children }: {
  world: DriveWorld
  driveRef: MutableRefObject<DriveState>
  rigRef: MutableRefObject<RigState | null>
  /** Scroll story progress (1: over): the scan and the x-ray. */
  storyRef?: MutableRefObject<number>
  inspecting?: boolean
  apart?: boolean
  opened?: boolean
  highlight?: readonly PartGroupId[]
  hovered?: PartGroupId | null
  /** Pointing at and clicking parts; without them the robot takes no pointer events. */
  onHover?: (group: PartGroupId | null) => void
  onPick?: (group: PartGroupId) => void
  onModel?: (model: RobotParts) => void
  extras?: ReactNode
  children?: ReactNode
}) {
  const model = useRobotParts()
  useEffect(() => { onModel?.(model) }, [model, onModel])
  const body = useRef<Group>(null)
  const extrasRef = useRef<Group>(null)
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
    // The LiDAR fan and the lights go once the story turns digital.
    if (extrasRef.current) extrasRef.current.visible = look.digital < 0.3
    rigRef.current = { model, apart: m.apart, open: m.open }
  })

  const groupAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => groupOfNode(event.object.name)
  const pointer = onPick
    ? {
        onPointerMove: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onHover?.(groupAt(event)) },
        onPointerOut: () => onHover?.(null),
        onClick: (event: ThreeEvent<MouseEvent>) => {
          // A drag to turn the view is not a pick.
          if (event.delta > 4) return
          event.stopPropagation()
          const group = groupAt(event)
          if (group) onPick(group)
        },
      }
    : {}
  // The model's nose is +Z; a map heading turns a +X nose.
  return (
    <group ref={body} scale={world.scale}>
      <group rotation={[0, Math.PI / 2, 0]}>
        <primitive object={model.root} {...pointer} />
        <group ref={extrasRef}>{extras}</group>
        {children}
      </group>
    </group>
  )
}

/** The loading bar while the models download. */
export function LoadBar({ label }: { label: string }) {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div className="lp3-td__load" role="status">
      <span style={{ width: `${Math.round(progress)}%` }} />
      <p>{label} · {Math.round(progress)}%</p>
    </div>
  )
}
