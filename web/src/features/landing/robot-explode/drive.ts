/**
 * Test drive of the CampusTour robot on the floor map of the operations Twin
 * (section 04 of the public Home page). Pure functions: the viewer feeds the
 * pressed keys or buttons in, draws the pose that comes out.
 *
 * Positions are in the map's own metres (the frame of
 * `features/digital-twin/patrol-nav.json`), `yaw` in radians. Nothing here is
 * sent to a robot: it is a visitor's toy on a picture of the real floor.
 */

export type DrivePoint = { x: number; y: number }

export type DriveState = DrivePoint & {
  yaw: number
  /** Forward speed, m/s (negative while backing up). */
  speed: number
  /** Turn rate, rad/s; positive turns `yaw` up. */
  turn: number
  /** The last step ran into a wall and stopped. */
  blocked: boolean
  /** Metres driven so far. */
  odometer: number
}

export type DriveInput = {
  /** 1 forward, -1 back, 0 coast. */
  throttle: number
  /** 1 or -1 turns the robot on the spot or while it drives; 0 holds the heading. */
  steer: number
  brake: boolean
}

/** Speeds of the toy, picked to feel lively on a 70 m floor; the real robot is slower. */
export const DRIVE = {
  maxSpeed: 1.8,
  reverseSpeed: 0.7,
  accel: 1.8,
  coast: 1.4,
  brake: 5,
  maxTurn: 1.9,
  turnAccel: 7,
} as const

export const IDLE: DriveInput = { throttle: 0, steer: 0, brake: false }

/** Whether the robot may go in a straight line from `a` to `b` (the floor's walls, with clearance). */
export type CanMove = (a: DrivePoint, b: DrivePoint) => boolean

export function startDrive(at: DrivePoint, yaw: number): DriveState {
  return { x: at.x, y: at.y, yaw, speed: 0, turn: 0, blocked: false, odometer: 0 }
}

function approach(value: number, target: number, rate: number) {
  return value < target ? Math.min(target, value + rate) : Math.max(target, value - rate)
}

/** Keys or buttons held: arrows/WASD, Space to brake. Unknown keys leave the input as it was. */
export function inputFromKeys(held: ReadonlySet<string>): DriveInput {
  const has = (...keys: string[]) => keys.some(key => held.has(key))
  const forward = has('ArrowUp', 'w', 'W', 'up')
  const back = has('ArrowDown', 's', 'S', 'down')
  const left = has('ArrowLeft', 'a', 'A', 'left')
  const right = has('ArrowRight', 'd', 'D', 'right')
  return {
    throttle: (forward ? 1 : 0) - (back ? 1 : 0),
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    brake: has(' ', 'Space', 'brake'),
  }
}

/**
 * One step of `dt` seconds. The robot speeds up and slows down smoothly,
 * turns on the spot like the real two-wheel platform, and does not go through
 * walls: running into one at an angle, it slides along it; head-on, it stops.
 */
export function stepDrive(state: DriveState, input: DriveInput, dt: number, canMove: CanMove): DriveState {
  const target = input.throttle > 0 ? DRIVE.maxSpeed * Math.min(1, input.throttle) : input.throttle < 0 ? -DRIVE.reverseSpeed * Math.min(1, -input.throttle) : 0
  const rate = input.brake ? DRIVE.brake : input.throttle === 0 ? DRIVE.coast : Math.sign(target) !== Math.sign(state.speed) && state.speed !== 0 ? DRIVE.brake : DRIVE.accel
  let speed = approach(state.speed, input.brake ? 0 : target, rate * dt)
  const turn = approach(state.turn, input.steer * DRIVE.maxTurn, DRIVE.turnAccel * dt)
  const yaw = state.yaw + turn * dt

  const step = speed * dt
  if (step === 0) return { ...state, yaw, speed, turn, blocked: false }
  const from = { x: state.x, y: state.y }
  const goal = { x: from.x + Math.cos(yaw) * step, y: from.y + Math.sin(yaw) * step }
  let to: DrivePoint | null = canMove(from, goal) ? goal : null
  let blocked = false
  if (!to) {
    // Slide along the wall on whichever axis is still free; only that part of the step is made.
    const slides = [{ x: goal.x, y: from.y }, { x: from.x, y: goal.y }]
      .filter(point => Math.hypot(point.x - from.x, point.y - from.y) > Math.abs(step) * 0.25)
      .sort((a, b) => Math.hypot(b.x - from.x, b.y - from.y) - Math.hypot(a.x - from.x, a.y - from.y))
    to = slides.find(point => canMove(from, point)) ?? null
    if (!to) { blocked = true; speed = 0; to = from }
  }
  return { x: to.x, y: to.y, yaw, speed, turn, blocked, odometer: state.odometer + Math.hypot(to.x - from.x, to.y - from.y) }
}

/** The stop nearest `at` and how far it is, or null when there are no stops. */
export function nearestStop(at: DrivePoint, stops: readonly DrivePoint[]) {
  let index = -1
  let gap = Infinity
  stops.forEach((stop, i) => {
    const d = Math.hypot(stop.x - at.x, stop.y - at.y)
    if (d < gap) { gap = d; index = i }
  })
  return index < 0 ? null : { index, distance: gap }
}

/** How far the robot can go from `at` along `yaw`, in half-metre steps up to `reach`. */
function freeRun(at: DrivePoint, yaw: number, canMove: CanMove, reach: number) {
  let run = 0
  for (let d = 0.5; d <= reach; d += 0.5) {
    if (!canMove(at, { x: at.x + Math.cos(yaw) * d, y: at.y + Math.sin(yaw) * d })) break
    run = d
  }
  return run
}

/**
 * The heading (one of `directions` around the circle) with the longest free
 * run from `at`, for a sensible start. With `behind` > 0 a heading also wants
 * that much room at its back (counted twice), so a camera following the robot
 * does not start inside a wall.
 */
export function openHeading(at: DrivePoint, canMove: CanMove, reach = 6, directions = 16, behind = 0) {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < directions; i += 1) {
    const yaw = (i / directions) * Math.PI * 2
    const score = freeRun(at, yaw, canMove, reach) + (behind > 0 ? 2 * Math.min(behind, freeRun(at, yaw + Math.PI, canMove, behind)) : 0)
    if (score > bestScore) { bestScore = score; best = yaw }
  }
  return best
}

/** Compass-style heading for the read-out: 0–359°. */
export function headingDegrees(yaw: number) {
  const degrees = Math.round((yaw * 180) / Math.PI) % 360
  return degrees < 0 ? degrees + 360 : degrees
}

/**
 * Self-driving along a planned path (the "Tự hành" button): turn towards the
 * next waypoint, mostly on the spot when it is far off the nose, and slow down
 * for the last one. Waypoints within `reach` are dropped; an empty path brakes.
 */
export function followPath(state: DriveState, path: readonly DrivePoint[], reach = 0.6): { input: DriveInput; path: DrivePoint[] } {
  let rest = [...path]
  while (rest.length > 0 && Math.hypot(rest[0].x - state.x, rest[0].y - state.y) < reach) rest = rest.slice(1)
  const next = rest[0]
  if (!next) return { input: { throttle: 0, steer: 0, brake: true }, path: [] }
  const want = Math.atan2(next.y - state.y, next.x - state.x)
  const off = Math.atan2(Math.sin(want - state.yaw), Math.cos(want - state.yaw))
  const gap = Math.hypot(next.x - state.x, next.y - state.y)
  const cruise = rest.length === 1 ? Math.min(0.7, gap / 2.5 + 0.2) : 0.7
  const throttle = Math.abs(off) > 0.7 ? 0 : cruise * (1 - Math.abs(off) / 1.4)
  return { input: { throttle, steer: Math.max(-1, Math.min(1, off * 2.2)), brake: false }, path: rest }
}
