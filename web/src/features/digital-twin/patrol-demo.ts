import type { Affine2D } from './map-config'
import { NAV_NODES, PATROL_POIS, distance, findPath, nodePoint, pathGap, segmentGap } from './patrol-routing'
import type { Point } from './patrol-routing'
export { PATROL_POIS, NAV_NODES, findPath, nodePoint } from './patrol-routing'
export const OBSERVE_SECONDS = 60
export const SAFE_DISTANCE = 1.4
export const PATROL_TICK = 0.05
const scale = 20 / (2.14561939 + 97.7707138)
export const PATROL_TRANSFORM: Affine2D = { a: scale, b: 0, c: 0, d: -scale, tx: -35.803092385 * scale, ty: -47.812547205 * scale }
export const PATROL_MODEL_SCALE = scale
export const PATROL_CLEARANCE = 0.6
export const PATROL_FLOOR_Y = scale
export type RobotMode = 'moving' | 'observing' | 'yielding' | 'yielded' | 'paused' | 'fault' | 'charging'
export type PatrolRobot = {
  id: string; number: number; color: string; pose: Point & { yaw: number }; node: number; path: number[]
  target: number; observing: number | null; remaining: number; waiting: boolean; blockedSeconds: number
  mode: RobotMode; yieldTo: number | null; bay: number | null; resumeMode: RobotMode
  visits: number; speed: number; battery: number; travelled: number; waitSeconds: number; moveSeconds: number
  queue: number[]; chargingTrip: boolean; perception: 'CLEAR' | 'SLOWING' | 'STOPPED'; yieldCount: number
  activeTask: number | null
}
export type FleetEvent = { sequence: number; seconds: number; robot: number | null; kind: string; message: string }
export type BlockedZone = { point: number; until: number }
export type FleetTask = { id: number; robot: number; point: number; type: 'patrol' | 'manual'; status: 'queued' | 'running' | 'completed'; created: number; started: number | null; completed: number | null; deadline: number }
export type PatrolState = { seconds: number; seed: number; robots: PatrolRobot[]; events: FleetEvent[]; eventSequence: number; blocked: BlockedZone[]; heat: Record<number, number>; cameraOffline: boolean; decisions: string[]; tasks: FleetTask[]; taskSequence: number; completedCount: number; completionTotal: number; onTimeCount: number; history: { seconds: number; completed: number; waiting: number }[] }
const colors = ['#2563eb', '#d97706', '#0d9488', '#9333ea', '#e11d48', '#4d7c0f']
const cloneRobot = (r: PatrolRobot) => ({ ...r, pose: { ...r.pose }, path: [...r.path], queue: [...r.queue] })
function beginTask(s: PatrolState, r: PatrolRobot) {
  const queued = s.tasks.find(t => t.robot === r.number && t.point === r.target && t.status === 'queued')
  if (queued) { queued.status = 'running'; queued.started ??= s.seconds; r.activeTask = queued.id }
  else { const task: FleetTask = { id: ++s.taskSequence, robot: r.number, point: r.target, type: 'patrol', status: 'running', created: s.seconds, started: s.seconds, completed: null, deadline: s.seconds + 300 }; s.tasks.push(task); r.activeTask = task.id }
  s.tasks = s.tasks.filter(t => t.status !== 'completed').concat(s.tasks.filter(t => t.status === 'completed').slice(-100))
}
function emit(s: PatrolState, robot: number | null, kind: string, message: string) {
  s.events = [{ sequence: ++s.eventSequence, seconds: s.seconds, robot, kind, message }, ...s.events].slice(0, 200)
}
function random(s: PatrolState) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296 }
function chooseTarget(s: PatrolState, r: PatrolRobot) {
  if (r.queue.length) return r.queue.shift()!
  const claimed = new Set(s.robots.filter(other => other.number !== r.number).map(other => other.target))
  let candidates = PATROL_POIS.map((_, i) => i).filter(i => i !== r.target && !claimed.has(i) && !s.blocked.some(b => b.point === i))
  if (!candidates.length) candidates = PATROL_POIS.map((_, i) => i).filter(i => i !== r.target)
  return candidates[Math.floor(random(s) * candidates.length)]
}
function blockedCells(s: PatrolState, r?: PatrolRobot, occupied = false) {
  const blocked = new Set<number>()
  NAV_NODES.forEach((_, i) => {
    const p = nodePoint(i)
    if (s.blocked.some(b => distance(p, PATROL_POIS[b.point]) < 2.3) || occupied && s.robots.some(other => other.number !== r?.number && (distance(p, other.pose) < SAFE_DISTANCE + 0.1 || other.bay !== null && distance(p, nodePoint(other.bay)) < SAFE_DISTANCE + 0.1))) blocked.add(i)
  })
  if (r) blocked.delete(r.node)
  return blocked
}
const goalNode = (r: PatrolRobot) => r.bay ?? PATROL_POIS[r.target].node
function plan(s: PatrolState, r: PatrolRobot, occupied = false) { r.path = findPath(r.node, goalNode(r), blockedCells(s, r, occupied)) }
export function createPatrol(seed = 713): PatrolState {
  const robots = [0, 2, 4, 6, 8, 9].map((poi, i): PatrolRobot => ({
    id: `local_${i + 1}`, number: i + 1, color: colors[i], pose: { ...nodePoint(PATROL_POIS[poi].node), yaw: 0 }, node: PATROL_POIS[poi].node,
    path: [], target: poi, observing: null, remaining: 0, waiting: false, blockedSeconds: 0, mode: 'moving', yieldTo: null, bay: null, resumeMode: 'moving',
    visits: 0, speed: 0.8 + (i % 3) * 0.05, battery: 95 - i * 5, travelled: 0, waitSeconds: 0, moveSeconds: 0, queue: [], chargingTrip: false, perception: 'CLEAR', yieldCount: 0, activeTask: null,
  }))
  const s: PatrolState = { seconds: 0, seed: seed >>> 0, robots, events: [], eventSequence: 0, blocked: [], heat: {}, cameraOffline: false, decisions: [], tasks: [], taskSequence: 0, completedCount: 0, completionTotal: 0, onTimeCount: 0, history: [] }
  for (const r of robots) { r.target = chooseTarget(s, r); plan(s, r); beginTask(s,r); emit(s, r.number, 'assigned', `R${r.number} → Điểm ${r.target + 1} (chọn ngẫu nhiên)` ) }
  return s
}
export const patrolPose = (r: PatrolRobot) => r.pose
export function sweptDistance(a: Point, b: Point, obstacle: Point) { return segmentGap(obstacle, a, b) }
export function robotRoute(r: PatrolRobot, maxLength = Infinity): Point[] {
  const p: Point[] = [r.pose]; let length = 0
  for (const n of r.path) { const next = nodePoint(n); length += distance(p[p.length - 1], next); p.push(next); if (length >= maxLength) break }
  return p
}
/** Find an actual connected, free bay outside the higher-priority route; no sideways teleport. */
function yieldBay(s: PatrolState, low: PatrolRobot, high: PatrolRobot) {
  const route = robotRoute(high), occupied = blockedCells(s, low, true)
  const anchors = onNode(low) ? [low.node] : [...new Set([low.node, low.path[0]].filter((n): n is number => n !== undefined))]
  const anchor = anchors.filter(n => s.robots.every(other => other.number === low.number || segmentGap(other.pose, low.pose, nodePoint(n)) >= SAFE_DISTANCE - 1e-8)).sort((a,b) => distance(nodePoint(b),high.pose)-distance(nodePoint(a),high.pose))[0]
  if (anchor === undefined) return null
  occupied.delete(anchor)
  const queue = [anchor], parents = new Map<number, number>(), lengths = new Map([[anchor, 0]])
  let chosen: number | null = null, score = Infinity
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], length = lengths.get(i)!, p = nodePoint(i)
    const clear = pathGap(p, route) >= SAFE_DISTANCE + 0.35
    const reserved = s.robots.some(other => other.number !== low.number && other.bay !== null && distance(p, nodePoint(other.bay)) < SAFE_DISTANCE)
    if (clear && !reserved && i !== anchor && length + distance(p, low.pose) * 0.05 < score) { chosen = i; score = length + distance(p, low.pose) * 0.05 }
    for (const j of NAV_NODES[i].edges) {
      if (lengths.has(j) || occupied.has(j)) continue
      lengths.set(j, length + distance(p, nodePoint(j))); parents.set(j, i); queue.push(j)
    }
  }
  if (chosen === null) return null
  const path = [chosen]; while (parents.get(path[0]) !== anchor) path.unshift(parents.get(path[0])!)
  return { node: chosen, path: onNode(low) ? path : [anchor, ...path] }
}
const onNode = (r: PatrolRobot) => distance(r.pose, nodePoint(r.node)) < 1e-6
function requestYields(s: PatrolState) {
  for (const high of s.robots) {
    if (high.mode !== 'moving' || !high.path.length) continue
    const route = robotRoute(high, 8)
    for (const low of s.robots) {
      if (low.number <= high.number || low.yieldTo !== null && (high.number > low.yieldTo || high.number === low.yieldTo && low.mode === 'yielding') || ['paused', 'fault', 'charging'].includes(low.mode)) continue
      if (distance(low.pose, high.pose) > 9 || pathGap(low.pose, route) > SAFE_DISTANCE + 0.4) continue
      const bay = yieldBay(s, low, high)
      if (!bay) continue
      if (low.yieldTo === null) low.resumeMode = low.mode
      low.mode = 'yielding'; low.yieldTo = high.number; low.bay = bay.node; low.path = bay.path; low.yieldCount++
      emit(s, low.number, 'yield', `R${low.number} rời tuyến, nhường R${high.number} tại chỗ tránh`)
    }
  }
}
function nextLeg(s: PatrolState, r: PatrolRobot) {
  const task = s.tasks.find(t=>t.id===r.activeTask)
  if(task){task.status='completed';task.completed=s.seconds;s.completedCount++;s.completionTotal+=s.seconds-task.created;if(s.seconds<=task.deadline)s.onTimeCount++}
  r.observing = null; r.remaining = 0; r.mode = 'moving'; r.target = chooseTarget(s, r); plan(s, r)
  beginTask(s,r)
  emit(s, r.number, 'assigned', `R${r.number} → Điểm ${r.target + 1}`)
}
/** Local deterministic fleet engine. All six complete sweeps are checked before moving. */
export function stepPatrol(state: PatrolState, dt = PATROL_TICK): PatrolState {
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new Error('Patrol needs a fixed step of at most 100 ms')
  const s = { ...state, seconds: state.seconds + dt, robots: state.robots.map(cloneRobot), heat: { ...state.heat }, blocked: state.blocked.filter(b => b.until > state.seconds), tasks: state.tasks.map(t=>({...t})), history: [...state.history] }
  const controlTick = Math.round(s.seconds / PATROL_TICK) % 10 === 0
  if (controlTick) requestYields(s)
  for (const r of s.robots) {
    r.waiting = false
    if (r.mode === 'paused' || r.mode === 'fault') continue
    if (r.mode === 'charging') {
      r.battery = Math.min(100, r.battery + dt * 0.5)
      if (r.battery >= 95) { r.chargingTrip = false; emit(s, r.number, 'charged', `R${r.number} đã sạc 95%`); nextLeg(s, r) }
      continue
    }
    if (r.yieldTo !== null) {
      const high = s.robots.find(other => other.number === r.yieldTo)!
      if (r.mode === 'yielded') {
        r.waitSeconds += dt
        if (distance(r.pose, high.pose) > 4 && (high.mode !== 'moving' || pathGap(r.pose, robotRoute(high, 10)) > SAFE_DISTANCE + 0.3)) {
          emit(s, r.number, 'resume', `R${r.number} tiếp tục sau khi R${high.number} đi qua`)
          r.yieldTo = null; r.bay = null; r.mode = 'moving'; plan(s, r, true)
        }
        continue
      }
    }
    if (r.mode === 'observing') {
      r.remaining = Math.max(0, r.remaining - dt)
      if (r.remaining < 1e-8) nextLeg(s, r)
      continue
    }
    if (r.battery < 15 && !r.chargingTrip && r.yieldTo === null && onNode(r)) {
      const task=s.tasks.find(t=>t.id===r.activeTask)
      if(task){task.status='queued';r.queue.unshift(task.point);r.activeTask=null}
      r.chargingTrip = true; r.observing = null; r.remaining = 0
      r.target = [5, 9].reduce((best, i) => distance(r.pose, PATROL_POIS[i]) < distance(r.pose, PATROL_POIS[best]) ? i : best)
      plan(s, r); emit(s, r.number, 'low-battery', `R${r.number} pin ${Math.floor(r.battery)}%, về trạm sạc Điểm ${r.target + 1}`)
    }
    if (!r.path.length && r.node === goalNode(r)) {
      if (r.bay !== null) { r.mode = 'yielded'; emit(s, r.number, 'bay', `R${r.number} đã vào chỗ tránh cho R${r.yieldTo}`) }
      else if (r.chargingTrip) r.mode = 'charging'
      else { r.mode = 'observing'; r.observing = r.target; r.remaining = r.remaining || OBSERVE_SECONDS; r.visits++; emit(s, r.number, 'arrived', `R${r.number} quan sát Điểm ${r.target + 1} trong 60s`) }
      continue
    }
    if (controlTick && onNode(r) && (r.blockedSeconds > 2 || !r.path.length || s.blocked.length)) plan(s, r, r.blockedSeconds > 2)
    if (!r.path.length) { r.waiting = true; r.waitSeconds += dt; r.blockedSeconds += dt; continue }
    // Grant an escape window before advancing into a robot that is clearing our route.
    // Waiting only at bumper distance could prevent that robot from crossing to its bay.
    if (r.mode === 'moving' && s.robots.some(other => other.mode === 'yielding' && other.yieldTo === r.number && pathGap(other.pose, robotRoute(r)) < SAFE_DISTANCE + 0.5)) {
      r.waiting = true; r.waitSeconds += dt; continue
    }
    const target = nodePoint(r.path[0]), gap = distance(r.pose, target)
    const nearest = Math.min(...s.robots.filter(other => other.number !== r.number).map(other => distance(r.pose, other.pose)))
    r.perception = nearest < SAFE_DISTANCE + 0.15 ? 'STOPPED' : nearest < 2.5 ? 'SLOWING' : 'CLEAR'
    const advance = Math.min(gap, r.speed * dt * (r.perception === 'SLOWING' ? 0.65 : 1))
    const to = { x: r.pose.x + (target.x - r.pose.x) * advance / gap, y: r.pose.y + (target.y - r.pose.y) * advance / gap }
    const unsafe = s.robots.some(other => other.number !== r.number && segmentGap(other.pose, r.pose, to) < SAFE_DISTANCE - 1e-8)
      || state.robots.some(other => other.number !== r.number && segmentGap(other.pose, r.pose, to) < SAFE_DISTANCE - 1e-8)
    if (unsafe) { r.waiting = true; r.waitSeconds += dt; r.blockedSeconds += dt; continue }
    r.pose = { ...to, yaw: Math.atan2(target.y - r.pose.y, target.x - r.pose.x) }
    r.travelled += advance; r.moveSeconds += dt; r.battery = Math.max(0, r.battery - advance * 0.012); r.blockedSeconds = 0
    if (gap - advance < 1e-7) { r.node = r.path.shift()!; r.pose = { ...nodePoint(r.node), yaw: r.pose.yaw }; s.heat[r.node] = (s.heat[r.node] ?? 0) + 1 }
  }
  if(Math.floor(s.seconds/10)>Math.floor(state.seconds/10))s.history=[...s.history,{seconds:s.seconds,completed:s.completedCount,waiting:s.robots.filter(r=>r.waiting||r.mode==='yielded').length}].slice(-120)
  return s
}
export type FleetScenario = 'robot-fault' | 'low-battery' | 'block-point' | 'camera-outage' | 'task-burst' | 'recover'
export function injectScenario(state: PatrolState, scenario: FleetScenario, number = 1, point = 0): PatrolState {
  const s = { ...state, robots: state.robots.map(cloneRobot), blocked: [...state.blocked], decisions: [...state.decisions], tasks: state.tasks.map(t=>({...t})) }, r = s.robots.find(robot => robot.number === number)!
  if (scenario === 'robot-fault') { r.resumeMode = r.mode; r.mode = 'fault'; emit(s, number, 'fault', `R${number} gặp lỗi, cần khôi phục`) }
  if (scenario === 'low-battery') { r.battery = 8; emit(s, number, 'low-battery', `R${number} pin thấp: 8%`) }
  if (scenario === 'block-point') { s.blocked.push({ point, until: s.seconds + 90 }); emit(s, null, 'blocked', `Vùng Điểm ${point + 1} bị chặn 90s; đội robot tính lại đường`) }
  if (scenario === 'camera-outage') { s.cameraOffline = !s.cameraOffline; emit(s, null, 'camera', s.cameraOffline ? 'Camera ảo mất kết nối' : 'Camera ảo kết nối lại') }
  if (scenario === 'recover') { r.mode = r.resumeMode === 'fault' || r.resumeMode === 'paused' ? 'moving' : r.resumeMode; r.battery = Math.max(25, r.battery); s.blocked = []; s.cameraOffline = false; emit(s, number, 'recovered', `R${number} khôi phục; vùng chặn và camera trở lại`) }
  if (scenario === 'task-burst') {
    for (let i = 0; i < 6; i++) assignTask(s, (point + i) % PATROL_POIS.length)
  }
  return s
}
function assignTask(s: PatrolState, point: number) {
  const scores = s.robots.filter(r => r.mode !== 'fault' && r.battery >= 20).map(r => ({ r, score: distance(r.pose, PATROL_POIS[point]) + r.queue.length * 15 + (100 - r.battery) * 0.12 }))
  scores.sort((a, b) => a.score - b.score || a.r.number - b.r.number)
  if (!scores.length) { emit(s, null, 'unassigned', `Chưa có robot đủ điều kiện cho Điểm ${point + 1}`); return }
  const selected = scores[0]; selected.r.queue.push(point)
  s.tasks.push({id:++s.taskSequence,robot:selected.r.number,point,type:'manual',status:'queued',created:s.seconds,started:null,completed:null,deadline:s.seconds+300})
  const reason = `Điểm ${point + 1} → R${selected.r.number}: quãng đường ${distance(selected.r.pose, PATROL_POIS[point]).toFixed(1)}m, pin ${selected.r.battery.toFixed(0)}%, ${selected.r.queue.length} việc; điểm ${selected.score.toFixed(1)} thấp nhất`
  s.decisions = [reason, ...s.decisions].slice(0, 20); emit(s, selected.r.number, 'task', reason)
}
export function addTask(state: PatrolState, point: number) { const s = { ...state, robots: state.robots.map(cloneRobot), decisions: [...state.decisions], tasks: state.tasks.map(t=>({...t})) }; assignTask(s, point); return s }
export function toggleRobot(state: PatrolState, number: number) {
  const s = { ...state, robots: state.robots.map(cloneRobot) }, r = s.robots.find(robot => robot.number === number)!
  if (r.mode === 'fault') return state
  if (r.mode === 'paused') r.mode = r.resumeMode
  else { r.resumeMode = r.mode; r.mode = 'paused' }
  emit(s, number, 'pause', `R${number} ${r.mode === 'paused' ? 'tạm dừng' : 'tiếp tục'}`); return s
}
export function fleetMetrics(s: PatrolState) {
  return { visits: s.robots.reduce((n, r) => n + r.visits, 0), distance: s.robots.reduce((n, r) => n + r.travelled, 0), waits: s.robots.reduce((n, r) => n + r.waitSeconds, 0), yields: s.robots.reduce((n, r) => n + r.yieldCount, 0), active: s.robots.filter(r => r.mode === 'moving' || r.mode === 'yielding').length, faults: s.robots.filter(r => r.mode === 'fault').length, averageBattery: s.robots.reduce((n, r) => n + r.battery, 0) / s.robots.length }
}
