import { useCallback, useEffect, useRef, useState } from 'react'
import { createPatrol, patrolPose, robotRoute, stepPatrol, PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TICK, PATROL_TRANSFORM, type PatrolState } from './patrol-demo'
import type { FleetPath } from './FleetPaths'
import type { TwinRobot } from './TwinScene'
import type { RobotPose } from './demo-motion'

/** React (lists, panels, traffic rings) sees the patrol at most this often; the 3D robots read it every frame. */
export const PATROL_SNAPSHOT_MS = 250

/** The latest two ticks and when the last one landed, so a frame can draw between them. */
export type PatrolClock = { previous: PatrolState; current: PatrolState; steppedAt: number; tickMs: number }

const shortest = (from: number, to: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from))

/** Robot `index`'s pose at `now`, interpolated between the last two ticks. */
export function interpolatedPose(clock: PatrolClock, index: number, now: number): RobotPose {
  const to = patrolPose(clock.current.robots[index])
  const fromRobot = clock.previous.robots[index]
  if (!fromRobot || fromRobot.id !== clock.current.robots[index].id) return to
  const from = patrolPose(fromRobot)
  const t = Math.min(1, Math.max(0, (now - clock.steppedAt) / clock.tickMs))
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, yaw: from.yaw + (shortest(from.yaw, to.yaw) - from.yaw) * t }
}

/**
 * The local six-robot patrol, computed in the browser. It advances in a ref at
 * `PATROL_TICK` while `running` (and playing); React gets a snapshot (`state`)
 * at most every `PATROL_SNAPSHOT_MS`, and the scene reads `livePose` each frame.
 * It publishes no pose and sends no command.
 */
export function useSimulatedPatrol(running = true) {
  const [state, setSnapshot] = useState(() => createPatrol())
  const clock = useRef<PatrolClock>({ previous: state, current: state, steppedAt: 0, tickMs: PATROL_TICK * 1000 })
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const advancing = running && playing
  useEffect(() => {
    if (!advancing) return
    let previous = performance.now()
    let accumulator = 0
    let published = 0
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = Math.min((now - previous) / 1000, 0.25)
      previous = now
      if (document.hidden) { accumulator = 0; return }
      accumulator += elapsed * speed
      const ticks = Math.floor((accumulator + 1e-9) / PATROL_TICK)
      accumulator -= ticks * PATROL_TICK
      if (!ticks) return
      let next = clock.current.current
      let before = next
      for (let i = 0; i < ticks; i++) { before = next; next = stepPatrol(next) }
      clock.current = { previous: before, current: next, steppedAt: now, tickMs: (PATROL_TICK * 1000) / speed }
      if (now - published >= PATROL_SNAPSHOT_MS) { published = now; setSnapshot(next) }
    }, 50)
    return () => {
      window.clearInterval(timer)
      // Paused, stopped or re-timed: the panels show exactly where the patrol stands.
      setSnapshot(clock.current.current)
    }
  }, [advancing, speed])
  /** Replaces the patrol (reset, scenario panels); the scene and React see it at once. */
  const setState = useCallback((update: PatrolState | ((current: PatrolState) => PatrolState)) => {
    const next = typeof update === 'function' ? update(clock.current.current) : update
    clock.current = { previous: next, current: next, steppedAt: performance.now(), tickMs: clock.current.tickMs }
    setSnapshot(next)
  }, [])
  const livePose = useCallback((index: number) => interpolatedPose(clock.current, index, performance.now()), [])
  return { state, setState, playing, setPlaying, speed, setSpeed, reset: () => setState(createPatrol()), livePose }
}

/**
 * The patrol robots as scene robots. `prefix` names them (R1… on the workbench,
 * S1… beside real robots); `synthetic` marks them as simulation in a scene that
 * also draws real robots, so they are dimmed and labelled "Mô phỏng".
 * `livePose` (from `useSimulatedPatrol`) lets the scene move them every frame
 * between React snapshots.
 */
export function patrolTwinRobots(state: PatrolState, { playing, selected = null, prefix = 'R', synthetic, livePose }: { playing: boolean; selected?: number | null; prefix?: string; synthetic?: boolean; livePose?: (index: number) => RobotPose }): TwinRobot[] {
  return state.robots.map((robot, index) => ({
    id: robot.id, name: `${prefix}${index + 1}`, color: robot.color, pose: patrolPose(robot),
    livePose: livePose ? () => livePose(index) : undefined,
    transform: PATROL_TRANSFORM, scale: PATROL_MODEL_SCALE, groundY: PATROL_FLOOR_Y, exactPose: true,
    active: (robot.mode === 'moving' || robot.mode === 'yielding') && !robot.waiting && playing,
    focused: robot.number === selected, stale: false, headYaw: 0, synthetic,
    traffic: robot.waiting ? 'hold' as const : robot.yieldTo !== null ? 'yield' as const : 'clear' as const,
  }))
}

/** Each patrol robot's remaining path, for `TwinScene.patrolPaths`. */
export function patrolPaths(state: PatrolState): FleetPath[] {
  return state.robots.map(robot => ({ id: robot.id, color: robot.color, points: robotRoute(robot), active: robot.mode === 'moving' || robot.mode === 'yielding' }))
}
