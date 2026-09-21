/**
 * The mock operations backend: one campus, one physical robot, the day's Tours,
 * moving on its own while the console is open.
 *
 * Labelled fixture, like everything in `src/mocks/`. It plays the SERVER side
 * of `api/contracts/staff.ts` so the console can be demonstrated end to end,
 * and it follows the remote-tour scope (19/09/2026) literally:
 *
 *   Start (Staff, from Ready) → FRONT → leg → arrive → first head angle →
 *   settling → narration + dwell (+ remaining angles) → close visit (timer or
 *   Next, exactly once) → FRONT → next leg … → leg to the end point →
 *   Completed → robot released.
 *
 *   Hold only at a POI; it stops the automatic Next and Staff leaves with Next.
 *   A fault puts the Tour in Running + NeedsAssistance with a reason; old
 *   timers are dropped; recovery is an explicit Staff action with a NEW id
 *   (retry leg / re-run POI / retry FRONT). End Early → Cancelled and the
 *   robot stays held until someone confirms it on site.
 *
 * The rules a backend owns live here, on the "server" side of the boundary;
 * the console never imports this file (it talks to `staff-mock.ts` and
 * `staff-realtime-mock.ts`). Coordinates are ROS-map metres, display-calibrated
 * to the preview campus model, not surveyed.
 */
import type {
  AmrStatus,
  AssistanceReason,
  GroupRegistration,
  HeadPreset,
  MapPose,
  PendingCommand,
  RegistrationState,
  RouteStop,
  StaffActions,
  StaffAlert,
  StartCheck,
  StartConfirmation,
  TourCommand,
  TourEvent,
  TourOperation,
  TourOperationDetail,
  TourState,
  TourStep,
} from '../api/contracts/staff'

/* ── Tunables (demo pace, not measured values) ───────────────────────────── */

const TRAVEL_SPEED = 0.6 // m/s
const HEAD_SECONDS = 1.5
const FIRST_FRONT_SECONDS = 1
const SETTLING_SECONDS = 1.5
const CANCEL_ACK_SECONDS = 2
const STREAM_BACK_SECONDS = 12
const DRAIN_PER_SECOND = 0.03
const OPERATOR = 'Nguyễn Minh Anh'
const LANGUAGE = 'Tiếng Việt'

/* ── Campus ───────────────────────────────────────────────────────────────── */

const PLACES = {
  start: { name: 'Sảnh chính', position: { x: -6.5, y: -4.5 } },
  aiLab: { name: 'AI Lab', position: { x: -1.5, y: -5.5 } },
  library: { name: 'Thư viện trung tâm', position: { x: 4.8, y: -2.2 } },
  innovation: { name: 'Innovation Space', position: { x: 3.5, y: 4.2 } },
  hall: { name: 'Hội trường A', position: { x: -3.5, y: 3.8 } },
  gazeboDock: { name: 'Khu thử Gazebo', position: { x: -8.4, y: 5.6 } },
} satisfies Record<string, { name: string; position: MapPose }>

type PlaceId = keyof typeof PLACES

const ROUTES: Record<string, { name: string; stops: Array<{ place: PlaceId; dwell: number; head: HeadPreset[] }> }> = {
  main: {
    name: 'Tuyến khám phá trọng điểm',
    stops: [
      { place: 'aiLab', dwell: 22, head: ['RIGHT', 'LEFT'] },
      { place: 'library', dwell: 22, head: ['FRONT', 'RIGHT'] },
      { place: 'innovation', dwell: 20, head: ['LEFT', 'RIGHT'] },
    ],
  },
  heritage: {
    name: 'Tuyến lịch sử & học thuật',
    stops: [
      { place: 'hall', dwell: 22, head: ['LEFT'] },
      { place: 'library', dwell: 22, head: ['RIGHT', 'LEFT'] },
      { place: 'aiLab', dwell: 20, head: ['FRONT'] },
    ],
  },
}

/* ── Internal state ───────────────────────────────────────────────────────── */

type Pending = PendingCommand & { left: number; fail?: AssistanceReason; failDetail?: string; then: () => void }

type SimTour = {
  id: string
  code: string
  name: string
  routeName: string
  scheduledAt: string
  estimatedEndAt: string
  state: TourState
  status: 'Normal' | 'NeedsAssistance' | null
  reason: AssistanceReason | null
  reasonDetail: string | null
  readyBlockers: string[]
  registrations: GroupRegistration[]
  robotId: string | null
  startedAt: string | null
  endedAt: string | null
  endReason: string | null
  stops: RouteStop[]
  endPoint: { name: string; position: MapPose }
  step: TourStep | null
  stopIndex: number | null
  legId: string | null
  legActive: boolean
  visitId: string | null
  visitOpen: boolean
  hold: boolean
  settleLeft: number
  dwellLeft: number
  dwellTotal: number
  headPlan: Array<{ preset: HeadPreset; at: number }>
  narration: 'Idle' | 'Playing' | 'Stopped'
  pending: Pending | null
  returnArrived: boolean
  streamDown: boolean
  streamBackLeft: number
  events: TourEvent[]
  revision: number
  seq: number
}

type SimRobot = {
  id: string
  name: string
  source: 'Physical' | 'Gazebo'
  assignable: boolean
  battery: number | null
  pose: MapPose | null
  speed: number
  connection: 'Live' | 'Stale' | 'Disconnected'
  localized: boolean
  head: HeadPreset
  headFault: boolean
  execution: 'Idle' | 'Navigating' | 'Stopped' | 'Unknown'
  tourId: string | null
  needsCheck: boolean
  cancelLeft: number
  lastSeenAt: number
  poseAt: number
}

type SimState = {
  elapsed: number
  robots: SimRobot[]
  tours: SimTour[]
  history: SimTour[]
  alerts: StaffAlert[]
  fired: Set<string>
  revision: number
}

export type SimChanges = {
  fleet: boolean
  tours: Set<string>
  assistance: Array<{ tourId: string; tourCode: string; reason: AssistanceReason; detail: string | null }>
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const now = () => Date.now()
const iso = (ms: number) => new Date(ms).toISOString()
const minutes = (value: number) => value * 60_000
const distance = (a: MapPose, b: MapPose) => Math.hypot(a.x - b.x, a.y - b.y)

let eventSeq = 0
function log(t: SimTour, type: string, detail: string, actor: string | null = null, when: number = now()) {
  eventSeq += 1
  t.events.push({ id: `evt-${eventSeq}`, type, detail, occurredAt: iso(when), actor })
}

const FIRST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Huỳnh']
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Gia', 'Quốc', 'Ngọc', 'Thanh', 'Hoàng']
const LAST = ['An', 'Bảo', 'Chi', 'Dũng', 'Hà', 'Khánh', 'Linh', 'Nam', 'Phúc', 'Quân', 'Trâm', 'Vy']

/** Openly fake roster rows; no real student data in fixtures (scope §6.3). */
function roster(count: number, seed: number, className: string | null) {
  return Array.from({ length: count }, (_, i) => ({
    name: `${FIRST[(seed + i) % FIRST.length]} ${MIDDLE[(seed * 3 + i) % MIDDLE.length]} ${LAST[(seed * 7 + i * 5) % LAST.length]}`,
    className,
  }))
}

function registration(id: string, school: string, rep: string, count: number, state: RegistrationState, seed: number, className: string | null = '11A1'): GroupRegistration {
  return { id, schoolName: school, representativeName: rep, state, studentCount: count, invitationSentAt: state === 'Approved' ? iso(now() - minutes(600 + seed)) : null, roster: roster(count, seed, className) }
}

function stopsFor(routeKey: keyof typeof ROUTES): RouteStop[] {
  return ROUTES[routeKey].stops.map((stop) => ({
    id: `stop-${stop.place}`,
    name: PLACES[stop.place].name,
    position: { ...PLACES[stop.place].position },
    dwellSeconds: stop.dwell,
    headSteps: stop.head,
    status: 'Upcoming',
    visits: 0,
    arrivedAt: null,
    closedAt: null,
  }))
}

function tour(over: Partial<SimTour> & Pick<SimTour, 'id' | 'code' | 'name' | 'state'> & { route: keyof typeof ROUTES; at: number }): SimTour {
  const { route, at, ...rest } = over
  return {
    routeName: ROUTES[route].name,
    scheduledAt: iso(now() + minutes(at)),
    estimatedEndAt: iso(now() + minutes(at + 30)),
    status: null,
    reason: null,
    reasonDetail: null,
    readyBlockers: [],
    registrations: [],
    robotId: null,
    startedAt: null,
    endedAt: null,
    endReason: null,
    stops: stopsFor(route),
    endPoint: { ...PLACES.start },
    step: null,
    stopIndex: null,
    legId: null,
    legActive: false,
    visitId: null,
    visitOpen: false,
    hold: false,
    settleLeft: 0,
    dwellLeft: 0,
    dwellTotal: 0,
    headPlan: [],
    narration: 'Idle',
    pending: null,
    returnArrived: false,
    streamDown: false,
    streamBackLeft: 0,
    events: [],
    revision: 0,
    seq: 0,
    ...rest,
  }
}

/* ── Seed ─────────────────────────────────────────────────────────────────── */

function seed(): SimState {
  const robots: SimRobot[] = [
    { id: 'robot_01', name: 'robot_01', source: 'Physical', assignable: true, battery: 78, pose: null, speed: 0, connection: 'Live', localized: true, head: 'FRONT', headFault: false, execution: 'Idle', tourId: null, needsCheck: false, cancelLeft: 0, lastSeenAt: now(), poseAt: now() },
    { id: 'robot_gz_01', name: 'robot_gz_01', source: 'Gazebo', assignable: false, battery: null, pose: { ...PLACES.gazeboDock.position, yaw: 0 }, speed: 0, connection: 'Live', localized: true, head: 'FRONT', headFault: false, execution: 'Idle', tourId: null, needsCheck: false, cancelLeft: 0, lastSeenAt: now(), poseAt: now() },
  ]

  const running = tour({
    id: 'tour-01', code: 'T-01', name: 'Tham quan từ xa · Buổi sáng', state: 'Running', route: 'main', at: -4,
    registrations: [
      registration('reg-01', 'THPT Chuyên Lê Hồng Phong', 'Cô Trần Thu Hà', 32, 'Approved', 1),
      registration('reg-02', 'THPT Nguyễn Thị Minh Khai', 'Thầy Lê Quốc Bảo', 28, 'Approved', 2, '12A3'),
      registration('reg-03', 'THCS Trần Đại Nghĩa', 'Cô Phạm Khánh Linh', 19, 'Approved', 3, null),
    ],
    robotId: 'robot_01',
  })
  const started = now() - minutes(4)
  running.startedAt = iso(started)
  log(running, 'TourCreated', 'Admin tạo buổi trên tuyến đã chuẩn bị.', 'Admin', started - minutes(60 * 24 * 3))
  log(running, 'ReadyConfirmed', 'Admin chốt buổi: 3 đoàn đã duyệt, không còn đăng ký chờ.', 'Admin', started - minutes(60 * 20))
  log(running, 'TourStarted', 'Bắt đầu phiên với robot_01. Đã xác nhận robot tại điểm xuất phát, khu vực an toàn, đã xem preview.', OPERATOR, started)
  const first = running.stops[0]
  first.status = 'Completed'
  first.visits = 1
  first.arrivedAt = iso(started + 40_000)
  first.closedAt = iso(started + 70_000)
  log(running, 'LegSucceeded', `Tới ${first.name}.`, null, started + 40_000)
  log(running, 'NarrationStarted', `Thuyết minh ${first.name}.`, null, started + 44_000)
  log(running, 'VisitClosed', `Hết thời gian dừng tại ${first.name}.`, null, started + 70_000)
  running.status = 'Normal'
  running.stopIndex = 1
  running.stops[1].status = 'Current'
  running.step = 'Navigating'
  running.seq = 3
  running.legId = 'leg-003'
  running.legActive = true
  running.visitId = null
  log(running, 'LegSent', `Gửi chặng ${running.legId} tới ${running.stops[1].name}.`, null, started + 75_000)
  const bot = robots[0]
  const a = first.position
  const b = running.stops[1].position
  bot.pose = { x: a.x + (b.x - a.x) * 0.05, y: a.y + (b.y - a.y) * 0.05, yaw: Math.atan2(b.y - a.y, b.x - a.x) }
  bot.tourId = running.id
  bot.execution = 'Navigating'

  const ready = tour({
    id: 'tour-02', code: 'T-02', name: 'Tham quan từ xa · Buổi trưa', state: 'Ready', route: 'heritage', at: 40,
    registrations: [
      registration('reg-04', 'THPT Gia Định', 'Thầy Võ Thành Nam', 35, 'Approved', 4, '10A2'),
      registration('reg-05', 'Trường Quốc tế Á Châu', 'Cô Bùi Ngọc Vy', 22, 'Approved', 5),
    ],
  })
  log(ready, 'TourCreated', 'Admin tạo buổi trên tuyến đã chuẩn bị.', 'Admin', now() - minutes(60 * 24 * 2))
  log(ready, 'ReadyConfirmed', 'Admin chốt buổi: 2 đoàn đã duyệt.', 'Admin', now() - minutes(90))

  const scheduled = tour({
    id: 'tour-03', code: 'T-03', name: 'Tham quan từ xa · Buổi chiều', state: 'Scheduled', route: 'main', at: 180,
    registrations: [
      registration('reg-06', 'THPT Nguyễn Du', 'Thầy Đỗ Minh Quân', 30, 'Approved', 6),
      registration('reg-07', 'THPT Bùi Thị Xuân', 'Cô Huỳnh Gia Chi', 26, 'Submitted', 7),
    ],
    readyBlockers: ['1 đăng ký đang chờ Admin duyệt', 'Admin chưa chốt buổi'],
  })
  log(scheduled, 'TourCreated', 'Admin tạo buổi trên tuyến đã chuẩn bị.', 'Admin', now() - minutes(60 * 24))

  const completed = tour({ id: 'tour-00', code: 'T-00', name: 'Tham quan từ xa · Buổi thử', state: 'Completed', route: 'main', at: -150, registrations: [registration('reg-00', 'THPT Phú Nhuận', 'Cô Đặng Thu Trâm', 24, 'Approved', 8)] })
  finishSeed(completed, now() - minutes(150), 27, null)

  const cancelled = tour({ id: 'tour-04', code: 'T-04', name: 'Tham quan từ xa · Buổi tối', state: 'Cancelled', route: 'heritage', at: 300, registrations: [registration('reg-08', 'THCS Lê Quý Đôn', 'Thầy Phạm Hoàng Phúc', 18, 'Approved', 9)] })
  cancelled.endReason = 'Admin hủy trước giờ chạy: trường báo trùng lịch kiểm tra.'
  cancelled.endedAt = iso(now() - minutes(70))
  log(cancelled, 'TourCancelled', cancelled.endReason, 'Admin', now() - minutes(70))

  const state: SimState = { elapsed: 0, robots, tours: [completed, running, ready, scheduled, cancelled], history: seedHistory(), alerts: seedAlerts(), fired: new Set(), revision: 100 }
  for (const t of state.tours) t.revision = state.revision
  return state
}

function finishSeed(t: SimTour, started: number, durationMinutes: number, endedEarly: string | null) {
  t.robotId = 'robot_01'
  t.startedAt = iso(started)
  t.endedAt = iso(started + minutes(durationMinutes))
  log(t, 'TourStarted', 'Bắt đầu phiên với robot_01.', OPERATOR, started)
  t.stops.forEach((stop, index) => {
    const done = !endedEarly || index < 2
    stop.status = done ? 'Completed' : 'Skipped'
    stop.visits = done ? 1 : 0
    if (done) {
      stop.arrivedAt = iso(started + minutes(index * 8 + 3))
      stop.closedAt = iso(started + minutes(index * 8 + 6))
      log(t, 'LegSucceeded', `Tới ${stop.name}.`, null, started + minutes(index * 8 + 3))
      log(t, 'VisitClosed', `Hết thời gian dừng tại ${stop.name}.`, null, started + minutes(index * 8 + 6))
    }
  })
  if (endedEarly) {
    t.endReason = endedEarly
    log(t, 'TourEndedEarly', endedEarly, OPERATOR, started + minutes(durationMinutes))
  } else {
    t.endReason = 'Hoàn thành tuyến, robot đã về và dừng tại điểm kết thúc.'
    log(t, 'LegSucceeded', `Về ${t.endPoint.name}.`, null, started + minutes(durationMinutes - 1))
    log(t, 'TourCompleted', t.endReason, null, started + minutes(durationMinutes))
  }
}

const HISTORY_SCHOOLS = ['THPT Gia Định', 'THPT Nguyễn Hữu Huân', 'THCS Nguyễn Du', 'THPT Marie Curie', 'THPT Lê Quý Đôn', 'Trường Quốc tế Việt Úc']

function seedHistory(): SimTour[] {
  const rows: SimTour[] = []
  for (let day = 1; day <= 5; day += 1) {
    for (let slot = 0; slot < 2; slot += 1) {
      const index = day * 2 + slot
      const start = new Date()
      start.setDate(start.getDate() - day)
      start.setHours(9 + slot * 5, 0, 0, 0)
      const earlyEnd = index % 5 === 3 ? 'Kết thúc sớm: Nav2 báo thất bại lặp lại tại hành lang Thư viện, đã kiểm tra robot tại chỗ.' : null
      const t = tour({ id: `hist-${day}-${slot}`, code: `T-${String(start.getMonth() + 1).padStart(2, '0')}${String(start.getDate()).padStart(2, '0')}-${slot + 1}`, name: slot === 0 ? 'Tham quan từ xa · Buổi sáng' : 'Tham quan từ xa · Buổi chiều', state: earlyEnd ? 'Cancelled' : 'Completed', route: slot === 0 ? 'main' : 'heritage', at: (start.getTime() - now()) / 60_000, registrations: [registration(`reg-h${index}a`, HISTORY_SCHOOLS[index % HISTORY_SCHOOLS.length], 'Đại diện trường', 20 + (index * 3) % 15, 'Approved', index), registration(`reg-h${index}b`, HISTORY_SCHOOLS[(index + 2) % HISTORY_SCHOOLS.length], 'Đại diện trường', 15 + (index * 5) % 12, 'Approved', index + 11)] })
      finishSeed(t, start.getTime(), earlyEnd ? 19 : 26 + (index % 4), earlyEnd)
      rows.push(t)
    }
  }
  return rows.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
}

function seedAlerts(): StaffAlert[] {
  return [
    { id: 'alert-h1', type: 'NavigationFailed', severity: 'Warning', message: 'Nav2 báo thất bại tại hành lang Thư viện.', amrUnitId: 'robot_01', amrName: 'robot_01', tourSessionId: 'hist-2-1', createdAt: iso(now() - minutes(60 * 24 * 2)), resolvedAt: iso(now() - minutes(60 * 24 * 2 - 4)) },
    { id: 'alert-h2', type: 'StreamUnavailable', severity: 'Warning', message: 'Mất nguồn hình chung 40 giây.', amrUnitId: 'robot_01', amrName: 'robot_01', tourSessionId: 'hist-4-0', createdAt: iso(now() - minutes(60 * 24 * 4)), resolvedAt: iso(now() - minutes(60 * 24 * 4 - 2)) },
  ]
}

/* ── The simulation ───────────────────────────────────────────────────────── */

let state: SimState = seed()

/** Test hook: start again from the seed. */
export function resetSim() {
  state = seed()
}

export function tourById(id: string) {
  return state.tours.find((t) => t.id === id) ?? state.history.find((t) => t.id === id)
}

function robotById(id?: string | null) {
  return id ? state.robots.find((r) => r.id === id) : undefined
}

const physical = () => state.robots.find((r) => r.assignable) as SimRobot

function bump(t: SimTour, changes?: SimChanges) {
  state.revision += 1
  t.revision = state.revision
  changes?.tours.add(t.id)
}

const nextId = (t: SimTour, prefix: string) => {
  t.seq += 1
  return `${prefix}-${String(t.seq).padStart(3, '0')}`
}

function send(t: SimTour, kind: Pending['kind'], label: string, seconds: number, then: () => void, fail?: { reason: AssistanceReason; detail: string }) {
  t.pending = { kind, id: nextId(t, kind === 'GoTo' ? 'leg' : kind === 'Head' ? 'head' : 'cancel'), label, sentAt: iso(now()), left: seconds, then, fail: fail?.reason, failDetail: fail?.detail }
  return t.pending.id
}

/** Enter NeedsAssistance: drop every automatic step that was scheduled. */
function needAssistance(t: SimTour, reason: AssistanceReason, detail: string, changes?: SimChanges) {
  t.status = 'NeedsAssistance'
  t.reason = reason
  t.reasonDetail = detail
  t.hold = false
  if (t.narration === 'Playing') t.narration = 'Stopped'
  t.headPlan = []
  log(t, 'AssistanceRequired', detail)
  const r = robotById(t.robotId)
  state.alerts.unshift({ id: `alert-${t.id}-${nextId(t, 'a')}`, type: reason, severity: reason === 'RobotDisconnected' ? 'Critical' : 'Warning', message: detail, amrUnitId: r?.id ?? null, amrName: r?.name ?? null, tourSessionId: t.id, createdAt: iso(now()) })
  changes?.assistance.push({ tourId: t.id, tourCode: t.code, reason, detail })
  bump(t, changes)
}

function recovered(t: SimTour, action: string) {
  t.status = 'Normal'
  const alert = state.alerts.find((a) => a.tourSessionId === t.id && !a.resolvedAt)
  if (alert) alert.resolvedAt = iso(now())
  log(t, 'Recovered', `${action} (lỗi trước: ${t.reasonDetail ?? t.reason}).`, OPERATOR)
  t.reason = null
  t.reasonDetail = null
}

function startLeg(t: SimTour, changes?: SimChanges) {
  const r = robotById(t.robotId)
  const toEnd = t.stopIndex == null
  const target = toEnd ? t.endPoint : t.stops[t.stopIndex as number]
  t.legId = nextId(t, 'leg')
  t.legActive = true
  t.returnArrived = false
  t.step = toEnd ? 'ReturningToEnd' : 'Navigating'
  if (!toEnd) (target as RouteStop).status = 'Current'
  if (r) r.execution = 'Navigating'
  log(t, 'LegSent', `Gửi chặng ${t.legId} tới ${target.name}.`)
  bump(t, changes)
}

function openVisit(t: SimTour, changes?: SimChanges) {
  const stop = t.stops[t.stopIndex as number]
  t.visitId = nextId(t, 'visit')
  t.visitOpen = true
  t.hold = false
  stop.visits += 1
  stop.arrivedAt ??= iso(now())
  t.step = 'PreparingView'
  const firstPreset = stop.headSteps[0] ?? 'FRONT'
  log(t, 'VisitOpened', `Mở lượt dừng ${t.visitId} tại ${stop.name}; quay ${firstPreset}.`)
  send(t, 'Head', `Quay ${firstPreset}`, HEAD_SECONDS, () => {
    const r = robotById(t.robotId)
    if (r) r.head = firstPreset
    t.settleLeft = SETTLING_SECONDS
  })
  bump(t, changes)
}

function beginObservation(t: SimTour, changes: SimChanges) {
  const stop = t.stops[t.stopIndex as number]
  t.step = 'Observing'
  t.narration = 'Playing'
  t.dwellTotal = stop.dwellSeconds
  t.dwellLeft = stop.dwellSeconds
  const rest = stop.headSteps.slice(1)
  t.headPlan = rest.map((preset, i) => ({ preset, at: ((i + 1) * stop.dwellSeconds) / stop.headSteps.length }))
  log(t, 'NarrationStarted', `Thuyết minh ${stop.name} (${LANGUAGE}), dừng ${stop.dwellSeconds} giây.`)
  bump(t, changes)
}

/** Close the open visit exactly once, whatever asked for it (timer or Staff). */
function closeVisit(t: SimTour, by: 'timer' | 'staff', changes?: SimChanges) {
  if (!t.visitOpen) return false
  const stop = t.stops[t.stopIndex as number]
  t.visitOpen = false
  t.hold = false
  t.narration = 'Stopped'
  t.headPlan = []
  stop.status = 'Completed'
  stop.closedAt = iso(now())
  log(t, 'VisitClosed', by === 'timer' ? `Hết thời gian dừng tại ${stop.name}.` : `Staff cho đi tiếp sớm tại ${stop.name}.`, by === 'staff' ? OPERATOR : null)
  frontThenLeg(t, changes)
  return true
}

function frontThenLeg(t: SimTour, changes?: SimChanges) {
  t.step = 'ReturningFront'
  send(t, 'Head', 'Quay FRONT', HEAD_SECONDS, () => {
    const r = robotById(t.robotId)
    if (r) r.head = 'FRONT'
    t.narration = 'Idle'
    const nextIndex = (t.stopIndex as number) + 1
    t.stopIndex = nextIndex < t.stops.length ? nextIndex : null
    startLeg(t)
  }, scriptFailure(t, 'Head'))
  bump(t, changes)
}

function complete(t: SimTour, changes?: SimChanges) {
  t.state = 'Completed'
  t.status = null
  t.step = 'Finished'
  t.endedAt = iso(now())
  t.endReason = 'Hoàn thành tuyến, robot đã về và dừng tại điểm kết thúc.'
  t.narration = 'Idle'
  t.legActive = false
  log(t, 'TourCompleted', t.endReason)
  const r = robotById(t.robotId)
  if (r) {
    r.tourId = null
    r.execution = 'Idle'
    r.speed = 0
    log(t, 'RobotReleased', `${r.name} sẵn sàng cho buổi khác.`)
  }
  bump(t, changes)
  if (changes) changes.fleet = true
}

/* Scripted faults for the demo, by seconds since the console opened. One of each recovery path. */
function scriptFailure(t: SimTour, kind: 'Head'): { reason: AssistanceReason; detail: string } | undefined {
  if (kind === 'Head' && t.id === 'tour-01' && state.elapsed >= 110 && !state.fired.has('head')) {
    state.fired.add('head')
    return { reason: 'HeadFailure', detail: 'Đầu xoay không xác nhận về FRONT sau khi rời POI.' }
  }
  return undefined
}

function driveLeg(t: SimTour, dt: number, changes: SimChanges) {
  const r = robotById(t.robotId)
  if (!r || !r.pose || !t.legActive || r.connection !== 'Live') return
  const target = t.stopIndex == null ? t.endPoint : t.stops[t.stopIndex]
  const gap = distance(r.pose, target.position)
  const step = TRAVEL_SPEED * dt
  r.poseAt = now()
  if (gap <= step) {
    r.pose = { ...target.position, yaw: r.pose.yaw }
    r.speed = 0
    r.execution = 'Idle'
    t.legActive = false
    log(t, 'LegSucceeded', `Chặng ${t.legId} tới ${target.name}: thành công.`)
    if (t.stopIndex == null) {
      if (t.status === 'NeedsAssistance') {
        t.returnArrived = true
        log(t, 'HeldAtEnd', 'Đã về điểm kết thúc; chờ Staff xác nhận hoàn tất vì phiên đang cần hỗ trợ.')
        bump(t, changes)
      } else complete(t, changes)
    } else if (t.status === 'NeedsAssistance') {
      t.step = 'HeldAtPoi'
      t.stops[t.stopIndex].arrivedAt = iso(now())
      log(t, 'HeldAtPoi', `Đã tới ${target.name}; đứng giữ, chưa quan sát vì phiên đang cần hỗ trợ.`)
      bump(t, changes)
    } else openVisit(t, changes)
    return
  }
  const yaw = Math.atan2(target.position.y - r.pose.y, target.position.x - r.pose.x)
  r.pose = { x: r.pose.x + Math.cos(yaw) * step, y: r.pose.y + Math.sin(yaw) * step, yaw }
  r.speed = TRAVEL_SPEED
  if (r.battery != null) r.battery = Math.max(0, r.battery - DRAIN_PER_SECOND * dt)

  // Scripted: Nav2 gives up on the first leg driven after ~8 s.
  if (t.id === 'tour-01' && state.elapsed >= 8 && !state.fired.has('nav')) {
    state.fired.add('nav')
    t.legActive = false
    r.speed = 0
    r.execution = 'Stopped'
    log(t, 'LegFailed', `Chặng ${t.legId} tới ${target.name}: Nav2 báo thất bại.`)
    needAssistance(t, 'NavigationFailed', `Nav2 báo thất bại trên đường tới ${target.name}: vật cản kéo dài, robot đã dừng.`, changes)
  }
  // Scripted: the shared stream drops while driving, after the navigation fault was handled.
  if (t.id === 'tour-01' && state.elapsed >= 40 && state.fired.has('nav') && t.status === 'Normal' && !state.fired.has('stream')) {
    state.fired.add('stream')
    t.streamDown = true
    t.streamBackLeft = STREAM_BACK_SECONDS
    log(t, 'StreamLost', 'Nguồn livestream chung mất tín hiệu; chặng hiện tại tiếp tục dưới Nav2.')
    needAssistance(t, 'StreamUnavailable', `Mất nguồn livestream chung khi đang tới ${target.name}. Chặng tiếp tục, robot sẽ đứng giữ khi tới nơi.`, changes)
  }
}

/**
 * Advance the world by `dt` seconds. Returns what changed so the push channel
 * can announce it, the way the hub will.
 */
export function tick(dt: number): SimChanges {
  const changes: SimChanges = { fleet: true, tours: new Set(), assistance: [] }
  state.elapsed += dt

  for (const t of state.tours) {
    if (t.state !== 'Running') continue

    if (t.streamDown) {
      t.streamBackLeft -= dt
      if (t.streamBackLeft <= 0) {
        t.streamDown = false
        log(t, 'StreamRestored', 'Nguồn livestream chung có hình trở lại (phiên vẫn chờ Staff xác nhận).')
        bump(t, changes)
      }
    }

    if (t.pending) {
      t.pending.left -= dt
      if (t.pending.left <= 0) {
        const done = t.pending
        t.pending = null
        if (done.fail) {
          const r = robotById(t.robotId)
          if (r && done.fail === 'HeadFailure') r.headFault = true
          log(t, 'CommandFailed', `${done.label} (${done.id}) thất bại.`)
          needAssistance(t, done.fail, done.failDetail ?? done.label, changes)
        } else {
          log(t, 'CommandSucceeded', `${done.label} (${done.id}) hoàn tất.`)
          done.then()
          bump(t, changes)
        }
      }
      continue
    }

    if (t.step === 'Navigating' || t.step === 'ReturningToEnd') driveLeg(t, dt, changes)

    if (t.status !== 'Normal') continue

    if (t.step === 'PreparingView' && t.settleLeft > 0) {
      t.settleLeft -= dt
      if (t.settleLeft <= 0) beginObservation(t, changes)
    } else if (t.step === 'Observing') {
      t.dwellLeft -= dt
      const elapsed = t.dwellTotal - t.dwellLeft
      const due = t.headPlan[0]
      if (due && elapsed >= due.at) {
        t.headPlan.shift()
        const r = robotById(t.robotId)
        if (r) r.head = due.preset
        log(t, 'HeadStep', `Quay ${due.preset} trong lúc quan sát.`)
        bump(t, changes)
      }
      if (t.dwellLeft <= 0 && !t.hold) closeVisit(t, 'timer', changes)
    }
  }

  for (const r of state.robots) {
    if (r.connection !== 'Disconnected') r.lastSeenAt = now()
    if (r.cancelLeft > 0) {
      r.cancelLeft -= dt
      // The robot's answer to the Cancel: only now is it known to have stopped.
      if (r.cancelLeft <= 0 && r.execution === 'Unknown') r.execution = 'Stopped'
    }
  }
  return changes
}

/* ── Server rules: what Staff may do now, and why not ─────────────────────── */

const STEP_WORDS: Partial<Record<TourStep, string>> = {
  Navigating: 'Robot đang di chuyển',
  ReturningFront: 'Đang chờ xác nhận FRONT',
  ReturningToEnd: 'Robot đang về điểm kết thúc',
  PreparingView: 'Đang chuẩn bị góc quan sát',
  PreparingStart: 'Đang quay FRONT trước chặng đầu',
}

const gate = (allowed: boolean, reason?: string | null) => ({ allowed, reason: allowed ? null : reason ?? null })

function startChecks(t: SimTour): StartCheck[] {
  const r = physical()
  const approved = t.registrations.filter((reg) => reg.state === 'Approved' && reg.studentCount > 0).length
  const free = !r.tourId && !r.needsCheck
  return [
    { id: 'groupsApproved', passed: approved > 0, detail: approved > 0 ? `${approved} đoàn đã duyệt` : 'Không còn đoàn nào được duyệt' },
    { id: 'robotConnected', passed: r.connection === 'Live', detail: r.connection === 'Live' ? `${r.name} đang kết nối` : `${r.name} không phản hồi` },
    { id: 'robotLocalized', passed: r.localized, detail: r.localized ? 'Đã định vị trên bản đồ' : 'Chưa định vị' },
    { id: 'robotFree', passed: free, detail: r.tourId ? `Đang phục vụ ${tourById(r.tourId)?.code ?? 'buổi khác'}` : r.needsCheck ? 'Chờ xác nhận kiểm tra sau buổi trước' : 'Không phục vụ buổi nào' },
    { id: 'headAtFront', passed: r.head === 'FRONT' && !r.headFault, detail: r.headFault ? 'Đầu xoay đang báo lỗi' : r.head === 'FRONT' ? 'Đầu ở FRONT' : `Đầu đang ở ${r.head}` },
    { id: 'batteryMeasured', passed: r.battery == null || r.battery >= 40, detail: r.battery == null ? 'Robot không đo pin — kiểm tra nguồn tại chỗ' : `${Math.round(r.battery)}% (tối thiểu 40%)` },
    { id: 'streamLive', passed: free && r.connection === 'Live', detail: free ? 'Nguồn hình có tín hiệu' : 'Nguồn hình đang dùng cho buổi khác' },
  ]
}

function actions(t: SimTour): StaffActions {
  const running = t.state === 'Running'
  const normal = running && t.status === 'Normal'
  const assist = running && t.status === 'NeedsAssistance'
  const r = robotById(t.robotId)
  const checks = t.state === 'Ready' ? startChecks(t) : []
  const failed = checks.find((check) => !check.passed)
  const atPoi = t.step === 'Observing' && t.visitOpen
  const busyReason = t.pending ? `Đang chờ kết quả: ${t.pending.label}` : STEP_WORDS[t.step as TourStep] ?? 'Không ở POI'
  const notRunning = t.state === 'Scheduled' ? 'Buổi chưa được Admin chốt' : t.state === 'Ready' ? 'Buổi chưa bắt đầu' : 'Buổi đã kết thúc'
  const assistReason = `Đang cần hỗ trợ: ${t.reasonDetail ?? ''}`.trim()
  const robotOk = Boolean(r && r.connection === 'Live')

  return {
    start: gate(t.state === 'Ready' && !failed, t.state === 'Scheduled' ? `Chờ Admin chốt buổi: ${t.readyBlockers.join('; ')}` : t.state !== 'Ready' ? notRunning : failed?.detail),
    hold: gate(normal && atPoi && !t.hold, !running ? notRunning : assist ? assistReason : t.hold ? 'Đang giữ tại POI' : !atPoi ? `Chỉ giữ khi robot đã dừng quan sát tại POI (${busyReason.toLowerCase()})` : null),
    next: gate(normal && atPoi && !t.pending, !running ? notRunning : assist ? assistReason : !atPoi ? busyReason : null),
    endEarly: gate(running, notRunning),
    retryLeg: gate(assist && (t.step === 'Navigating' || t.step === 'ReturningToEnd') && !t.legActive && !t.pending && robotOk && t.reason !== 'StreamUnavailable', !assist ? 'Chỉ dùng khi phiên cần hỗ trợ' : t.legActive ? 'Chặng hiện tại vẫn đang chạy' : !robotOk ? 'Robot không kết nối' : t.reason === 'StreamUnavailable' ? 'Chờ robot tới POI rồi chạy lại POI' : 'Không có chặng dừng giữa đường'),
    rerunPoi: gate(assist && (t.step === 'HeldAtPoi' || t.step === 'PreparingView' || t.step === 'Observing') && !t.streamDown && robotOk && !r?.headFault && !t.pending, !assist ? 'Chỉ dùng khi phiên cần hỗ trợ' : t.legActive ? 'Robot chưa tới POI: chờ chặng hiện tại hoàn tất' : t.streamDown ? 'Nguồn livestream chưa có hình' : r?.headFault ? 'Đầu xoay đang lỗi' : 'Robot không đứng tại POI'),
    retryFront: gate(assist && t.reason === 'HeadFailure' && t.step === 'ReturningFront' && !t.pending, !assist ? 'Chỉ dùng khi phiên cần hỗ trợ' : 'Chỉ dùng khi lỗi quay FRONT'),
    confirmComplete: gate(assist && t.step === 'ReturningToEnd' && t.returnArrived && !t.streamDown, !assist ? 'Chỉ dùng khi phiên cần hỗ trợ' : !t.returnArrived ? 'Robot chưa về điểm kết thúc' : 'Nguồn livestream chưa có hình'),
  }
}

/* ── Read models ──────────────────────────────────────────────────────────── */

export function robotView(r: SimRobot): AmrStatus {
  const t = r.tourId ? tourById(r.tourId) : undefined
  const age = Math.max(0, Math.round((now() - r.lastSeenAt) / 1000))
  const poseAge = r.pose ? Math.max(0, Math.round((now() - (r.execution === 'Navigating' ? r.poseAt : r.lastSeenAt)) / 1000)) : null
  const nearest = r.pose ? Object.values(PLACES).find((place) => distance(place.position, r.pose as MapPose) < 1.2)?.name ?? null : null
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    assignable: r.assignable,
    operationalState: r.execution === 'Navigating' ? 'Navigating' : r.connection === 'Disconnected' ? 'Offline' : 'Idle',
    connectionState: r.connection,
    batteryPercent: r.battery == null ? null : Math.round(r.battery),
    lastSeenAt: iso(r.lastSeenAt),
    telemetryAgeSeconds: age,
    sensorHealth: r.headFault ? 'Degraded' : 'Healthy',
    currentSessionId: t?.id ?? null,
    currentSessionStatus: t?.state ?? null,
    currentMissionState: t?.step ?? null,
    currentPoi: nearest,
    executionState: r.execution,
    pose: r.pose ? { ...r.pose } : null,
    poseAgeSeconds: poseAge,
    speedMps: r.connection === 'Disconnected' ? null : r.speed,
    localized: r.localized,
    headPreset: r.head,
    headFault: r.headFault,
    needsCheck: r.needsCheck,
    currentTourCode: t?.code ?? null,
  }
}

export function tourView(t: SimTour): TourOperation {
  const running = t.state === 'Running'
  const robot = robotById(t.robotId)
  const free = !physical().tourId && !physical().needsCheck
  return structuredClone({
    id: t.id,
    code: t.code,
    name: t.name,
    routeName: t.routeName,
    scheduledAt: t.scheduledAt,
    estimatedEndAt: t.estimatedEndAt,
    state: t.state,
    operationalStatus: running ? t.status : null,
    reason: running ? t.reason : null,
    reasonDetail: running ? t.reasonDetail : null,
    readyBlockers: t.state === 'Scheduled' ? t.readyBlockers : [],
    language: LANGUAGE,
    registrations: t.registrations,
    robotId: t.robotId,
    robotName: robot?.name ?? t.robotId,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    endReason: t.endReason,
    stops: t.stops,
    endPoint: t.endPoint,
    progress: running
      ? { step: t.step as TourStep, stopIndex: t.stopIndex, legId: t.legId, visitId: t.visitOpen ? t.visitId : null, hold: t.hold, dwellEndsAt: t.step === 'Observing' ? iso(now() + Math.max(0, t.dwellLeft) * 1000) : null, headPreset: robot?.head ?? null, narration: t.narration, pendingCommand: t.pending ? { kind: t.pending.kind, id: t.pending.id, label: t.pending.label, sentAt: t.pending.sentAt } : null }
      : null,
    livestream: running
      ? t.streamDown ? { state: 'Offline' as const, url: null } : { state: 'Live' as const, url: '/videos/home.mp4' }
      : t.state === 'Ready' && free ? { state: 'Live' as const, url: '/videos/home.mp4' } : { state: 'Offline' as const, url: null },
    startChecks: t.state === 'Ready' ? startChecks(t) : [],
    allowedActions: actions(t),
    revision: t.revision,
  })
}

export function tourDetailView(t: SimTour): TourOperationDetail {
  return { ...tourView(t), events: structuredClone([...t.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) }
}

export const sim = {
  get robots() {
    return state.robots
  },
  get tours() {
    return state.tours
  },
  get history() {
    return state.history
  },
  get alerts() {
    return state.alerts
  },
  robotById,
}

/* ── Commands (the server-side rules) ─────────────────────────────────────── */

export class SimRejection extends Error {}

function requireTour(id: string) {
  const t = state.tours.find((item) => item.id === id)
  if (!t) throw new SimRejection('Không tìm thấy buổi tham quan.')
  return t
}

function requireAllowed(t: SimTour, action: keyof StaffActions) {
  const verdict = actions(t)[action]
  if (!verdict.allowed) throw new SimRejection(verdict.reason ?? 'Thao tác không hợp lệ ở bước hiện tại.')
}

export function startTour(id: string, confirmation: StartConfirmation) {
  const t = requireTour(id)
  requireAllowed(t, 'start')
  if (!confirmation.robotPlaced || !confirmation.areaClear || !confirmation.previewChecked) throw new SimRejection('Cần xác nhận đủ các kiểm tra thực tế trước khi bắt đầu.')
  const r = physical()
  // Take the robot and move to Running in one step: only one Start can win.
  r.tourId = t.id
  r.pose ??= { ...PLACES.start.position, yaw: 0 }
  t.robotId = r.id
  t.state = 'Running'
  t.status = 'Normal'
  t.startedAt = iso(now())
  t.stopIndex = 0
  t.step = 'PreparingStart'
  log(t, 'TourStarted', `Bắt đầu phiên với ${r.name}. Đã xác nhận robot tại điểm xuất phát, khu vực an toàn, đã xem preview.`, OPERATOR)
  send(t, 'Head', 'Quay FRONT', FIRST_FRONT_SECONDS, () => startLeg(t))
  bump(t)
  return t
}

export function command(id: string, cmd: TourCommand, reason?: string) {
  const t = requireTour(id)
  const note = reason?.trim() ? ` Lý do: ${reason.trim()}` : ''
  const r = robotById(t.robotId)
  switch (cmd) {
    case 'hold':
      requireAllowed(t, 'hold')
      t.hold = true
      log(t, 'HoldSet', `Giữ tại ${t.stops[t.stopIndex as number].name}: không tự đi tiếp khi hết thời gian.${note}`, OPERATOR)
      break
    case 'next':
      requireAllowed(t, 'next')
      closeVisit(t, 'staff')
      break
    case 'retryLeg':
      requireAllowed(t, 'retryLeg')
      recovered(t, 'Staff thử lại chặng với mã chặng mới')
      startLeg(t)
      break
    case 'rerunPoi':
      requireAllowed(t, 'rerunPoi')
      recovered(t, 'Staff chạy lại POI với lượt dừng mới')
      t.visitOpen = false
      openVisit(t)
      break
    case 'retryFront':
      requireAllowed(t, 'retryFront')
      if (r) r.headFault = false
      recovered(t, 'Staff thử lại FRONT với mã lệnh mới')
      frontThenLeg(t)
      break
    case 'confirmComplete':
      requireAllowed(t, 'confirmComplete')
      recovered(t, 'Staff xác nhận đủ điều kiện hoàn tất')
      complete(t)
      break
    case 'endEarly': {
      requireAllowed(t, 'endEarly')
      if (!reason?.trim()) throw new SimRejection('Kết thúc sớm cần ghi lý do.')
      const wasMoving = t.legActive
      t.state = 'Cancelled'
      t.status = null
      t.endedAt = iso(now())
      t.endReason = `Kết thúc sớm: ${reason.trim()}`
      t.pending = null
      t.headPlan = []
      t.hold = false
      t.visitOpen = false
      t.legActive = false
      t.narration = 'Idle'
      for (const stop of t.stops) if (stop.status !== 'Completed') stop.status = 'Skipped'
      const alert = state.alerts.find((a) => a.tourSessionId === t.id && !a.resolvedAt)
      if (alert) alert.resolvedAt = iso(now())
      log(t, 'TourEndedEarly', t.endReason, OPERATOR)
      if (r) {
        // The robot stays held: a Cancel is not proof it stopped (scope §5.4, §12.3).
        r.tourId = null
        r.needsCheck = true
        r.speed = 0
        if (wasMoving) {
          log(t, 'CancelSent', `Gửi yêu cầu hủy chặng ${t.legId}; robot giữ chờ kiểm tra.`)
          r.execution = 'Unknown'
          r.cancelLeft = CANCEL_ACK_SECONDS
        } else r.execution = 'Stopped'
      }
      break
    }
  }
  bump(t)
  return t
}

export function confirmRobotReady(robotId: string, note?: string) {
  const r = robotById(robotId)
  if (!r) throw new SimRejection('Không tìm thấy robot.')
  if (r.tourId) throw new SimRejection('Robot đang phục vụ một buổi; không thể giải phóng.')
  if (!r.needsCheck) throw new SimRejection('Robot không ở trạng thái chờ kiểm tra.')
  if (r.execution === 'Unknown') throw new SimRejection('Chưa có xác nhận robot đã dừng.')
  r.needsCheck = false
  r.execution = 'Idle'
  r.headFault = false
  r.head = 'FRONT'
  for (const t of state.tours) if (t.state === 'Ready') bump(t)
  const last = [...state.tours].filter((t) => t.robotId === robotId && t.endedAt).sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))[0]
  if (last) log(last, 'RobotReleased', `Staff xác nhận ${r.name} đã dừng và sẵn sàng.${note?.trim() ? ` Ghi chú: ${note.trim()}` : ''}`, OPERATOR)
  return r
}
