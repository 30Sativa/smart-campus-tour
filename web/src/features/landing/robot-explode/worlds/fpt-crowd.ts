/**
 * People and cars on the FPT campus demo map. Walkers follow the paths in
 * `WALK_PATHS` (some stand about in the courtyard), cars drive street D1 and
 * turn round past the site. Everyone gives way to the robot: a walker steps
 * aside to pass it (and back onto the path after), a car with the robot in its
 * lane ahead stops. The robot in turn waits for whoever is straight ahead.
 * Plain data, stepped by the map each frame and read by the robot's sensing.
 */
import type { DrivePoint } from '../drive'
import { CAR_LANES, CAR_SPAN, IDLE_GROUPS, WALK_PATHS, seeded } from './fpt-campus'
import { alongPath, pathLength } from './geometry'

export type Walker = { path: number; travelled: number; speed: number; x: number; y: number; yaw: number; moving: boolean; shirt: string; skin: string; /** Sideways step off the path, m (left of the walking direction is positive). */ aside: number }
export type Car = { lane: number; x: number; y: number; speed: number; cruise: number; color: string }
export type Crowd = { walkers: Walker[]; idlers: Walker[]; cars: Car[] }
export type Tracked = { kind: 'person' | 'car'; x: number; y: number; distance: number }

const SHIRTS = ['#f26b38', '#2f6fb5', '#f2c14e', '#e9eef2', '#3d9970', '#c0392b', '#7d5ba6', '#1f2d3a', '#ff8fab', '#5bc0de']
const SKINS = ['#e8c2a0', '#d9a77e', '#c68e64', '#f1d3b8']
const CAR_COLORS = ['#e9edf0', '#20262c', '#b03a2e', '#2e5e8c', '#9aa3a8', '#d9d2c3']
/** A walker steps aside while the robot is closer than this to its path, m, by up to `STEP_ASIDE`. */
const GIVE_WAY = 2.6
const STEP_ASIDE = 1.5
/** A car stops for the robot this far ahead in its lane, m. */
const CAR_GAP = 7

function place(walker: Walker) {
  const path = WALK_PATHS[walker.path]
  const at = alongPath(path.points, path.loop, walker.travelled)
  walker.x = at.x - Math.sin(at.yaw) * walker.aside
  walker.y = at.y + Math.cos(at.yaw) * walker.aside
  walker.yaw = at.yaw
}

export function createCrowd(seed = 7): Crowd {
  const random = seeded(seed)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]
  const walkers: Walker[] = []
  WALK_PATHS.forEach((path, index) => {
    const length = pathLength(path.points, path.loop) * (path.loop ? 1 : 2)
    for (let i = 0; i < path.walkers; i += 1) {
      const walker: Walker = { path: index, travelled: (length * (i + random() * 0.6)) / path.walkers, speed: path.speed * (0.85 + random() * 0.3), x: 0, y: 0, yaw: 0, moving: true, shirt: pick(SHIRTS), skin: pick(SKINS), aside: 0 }
      place(walker)
      walkers.push(walker)
    }
  })
  // Small groups standing and chatting in the courtyard, in front of the building, by the gate and the pitch.
  const idlers: Walker[] = []
  for (const [cx, cy, n] of IDLE_GROUPS) {
    for (let i = 0; i < n; i += 1) {
      const angle = (i / n) * Math.PI * 2
      idlers.push({ path: -1, travelled: 0, speed: 0, x: cx + Math.cos(angle) * 0.8, y: cy + Math.sin(angle) * 0.8, yaw: angle + Math.PI, moving: false, shirt: pick(SHIRTS), skin: pick(SKINS), aside: 0 })
    }
  }
  const cars: Car[] = []
  CAR_LANES.forEach((lane, index) => {
    for (let i = 0; i < 3; i += 1) {
      const cruise = 7 + random() * 3
      cars.push({ lane: index, x: -CAR_SPAN + (i * 2 * CAR_SPAN) / 3 + random() * 20, y: lane.y, speed: cruise, cruise, color: pick(CAR_COLORS) })
    }
  })
  return { walkers, idlers, cars }
}

/** Moves everyone on by `dt` seconds, giving way to the robot at `robot`. */
export function stepCrowd(crowd: Crowd, dt: number, robot: DrivePoint) {
  for (const walker of crowd.walkers) {
    const path = WALK_PATHS[walker.path]
    // Never stop: step aside, away from the robot, while it is near the path just ahead, then back.
    const ahead = alongPath(path.points, path.loop, walker.travelled + 1)
    const near = Math.hypot(robot.x - ahead.x, robot.y - ahead.y) < GIVE_WAY
    const robotSide = -Math.sin(ahead.yaw) * (robot.x - ahead.x) + Math.cos(ahead.yaw) * (robot.y - ahead.y)
    const goal = near ? (robotSide > 0 ? -STEP_ASIDE : STEP_ASIDE) : 0
    walker.aside += Math.max(-1.6 * dt, Math.min(1.6 * dt, goal - walker.aside))
    walker.moving = true
    // Slow down while stepping round.
    walker.travelled += walker.speed * dt * (near ? 0.6 : 1)
    place(walker)
  }
  for (const car of crowd.cars) {
    const dir = CAR_LANES[car.lane].dir
    const gap = (robot.x - car.x) * dir
    const inLane = Math.abs(robot.y - car.y) < 2.2
    const target = inLane && gap > 0 && gap < CAR_GAP + 4 ? Math.max(0, (gap - CAR_GAP) * 1.5) : car.cruise
    car.speed += Math.max(-8 * dt, Math.min(3 * dt, target - car.speed))
    car.x += dir * car.speed * dt
    if (car.x * dir > CAR_SPAN) car.x = -dir * CAR_SPAN
  }
}

/**
 * What the robot's sensors make of the crowd from `pose`: everyone within
 * `radius`, nearest first, and how far the nearest one straight ahead is
 * (within ±35° of the heading), or null.
 */
export function senseCrowd(crowd: Crowd, pose: DrivePoint & { yaw: number }, radius = 25) {
  const tracked: Tracked[] = []
  let ahead: number | null = null
  const consider = (kind: Tracked['kind'], x: number, y: number) => {
    const distance = Math.hypot(x - pose.x, y - pose.y)
    if (distance > radius) return
    tracked.push({ kind, x, y, distance })
    const off = Math.atan2(y - pose.y, x - pose.x) - pose.yaw
    if (Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) < (35 * Math.PI) / 180 && (ahead === null || distance < ahead)) ahead = distance
  }
  for (const walker of [...crowd.walkers, ...crowd.idlers]) consider('person', walker.x, walker.y)
  for (const car of crowd.cars) consider('car', car.x, car.y)
  tracked.sort((a, b) => a.distance - b.distance)
  return { tracked, ahead: ahead as number | null }
}

/** The campus's one crowd, shared by the map (which moves it) and the robot's sensing (which reads it). */
export const campusCrowd = createCrowd()
