import { useEffect, useState } from 'react'
import { createPatrol, patrolPose, robotRoute, stepPatrol, PATROL_FLOOR_Y, PATROL_MODEL_SCALE, PATROL_TICK, PATROL_TRANSFORM, type PatrolState } from './patrol-demo'
import type { FleetPath } from './FleetPaths'
import type { TwinRobot } from './TwinScene'

/**
 * The local six-robot patrol, computed in the browser: its state and playback,
 * advanced at `PATROL_TICK` while `running`. It publishes no pose and sends no
 * command; the caller decides where (and whether) to draw it.
 */
export function useSimulatedPatrol(running = true) {
  const [state, setState] = useState(() => createPatrol())
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const advancing = running && playing
  useEffect(() => {
    if (!advancing) return
    let previous = performance.now()
    let accumulator = 0
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = Math.min((now - previous) / 1000, 0.25)
      previous = now
      if (document.hidden) { accumulator = 0; return }
      accumulator += elapsed * speed
      const ticks = Math.floor((accumulator + 1e-9) / PATROL_TICK)
      accumulator -= ticks * PATROL_TICK
      if (ticks) setState(current => {
        let next = current
        for (let i = 0; i < ticks; i++) next = stepPatrol(next)
        return next
      })
    }, 50)
    return () => window.clearInterval(timer)
  }, [advancing, speed])
  return { state, setState, playing, setPlaying, speed, setSpeed, reset: () => setState(createPatrol()) }
}

/**
 * The patrol robots as scene robots. `prefix` names them (R1… on the workbench,
 * S1… beside real robots); `synthetic` marks them as simulation in a scene that
 * also draws real robots, so they are dimmed and labelled "Mô phỏng".
 */
export function patrolTwinRobots(state: PatrolState, { playing, selected = null, prefix = 'R', synthetic }: { playing: boolean; selected?: number | null; prefix?: string; synthetic?: boolean }): TwinRobot[] {
  return state.robots.map((robot, index) => ({
    id: robot.id, name: `${prefix}${index + 1}`, color: robot.color, pose: patrolPose(robot),
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
