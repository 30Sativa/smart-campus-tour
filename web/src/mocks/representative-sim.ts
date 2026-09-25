/**
 * The school-representative half of the mock server: the rules behind
 * `api/contracts/representative.ts`, applied to the SAME world as
 * `staff-sim.ts` and `admin-sim.ts`. A group sent here is the group Admin
 * reviews; Admin's approval is what gives this screen the join link.
 *
 * Labelled fixture. It plays the server: ownership (a representative only
 * ever sees their own registrations), one registration per Tour, the
 * "only while Scheduled" rule, validation and concurrency tokens.
 *
 * Demo account `daidien` represents THPT Trần Phú and is seeded with one
 * registration in each interesting state: Approved on a Scheduled Tour
 * (T-03), Rejected with a reason (T-05), Approved on a Ready Tour (T-02) and
 * Approved on a finished Tour (T-00). T-06 and T-07 are open to register.
 */
import type {
  RegistrationInput,
  RepresentativeErrorBody,
  RepresentativeRegistration,
  RepresentativeRegistrationDetail,
  RepresentativeTour,
} from '../api/contracts/representative'
import type { ActionGate, RosterRow, TourState } from '../api/contracts/staff'
import { joinLinkFor } from './admin-sim'
import * as world from './staff-sim'
import type { SimRegistration, SimTour } from './staff-sim'

export class RepresentativeRejection extends Error {
  readonly status: number
  readonly body: RepresentativeErrorBody
  constructor(status: number, body: RepresentativeErrorBody) {
    super(body.message)
    this.status = status
    this.body = body
  }
}

const notAllowed = (message: string) => new RepresentativeRejection(409, { code: 'NotAllowed', message })
const stale = () =>
  new RepresentativeRejection(409, { code: 'StaleData', message: 'Dữ liệu đã thay đổi từ lúc bạn mở trang. Đã tải lại, vui lòng kiểm tra rồi thử lại.' })
const notFound = (what: string) => new RepresentativeRejection(404, { code: 'NotFound', message: `Không tìm thấy ${what}.` })

const now = () => Date.now()
const iso = (ms: number) => new Date(ms).toISOString()
const gate = (allowed: boolean, reason?: string | null): ActionGate => ({ allowed, reason: allowed ? null : reason ?? null })

/** Limits of the preview build (flow review §10.3); not a pilot-confirmed threshold. */
export const ROSTER_MAX_ROWS = 1000

const STATE_WORDS: Record<TourState, string> = {
  Scheduled: 'Đang nhận đăng ký',
  Ready: 'Đã chốt danh sách',
  Running: 'Đang diễn ra',
  Completed: 'Đã hoàn thành',
  Cancelled: 'Đã hủy',
}

const LOCKED_WHY: Record<TourState, string> = {
  Scheduled: '',
  Ready: 'Buổi đã chốt danh sách. Không sửa, thay danh sách hay hủy được nữa; liên hệ Admin nếu cần mở lại.',
  Running: 'Buổi đang diễn ra; đăng ký chỉ còn để xem.',
  Completed: 'Buổi đã kết thúc; đăng ký chỉ còn để xem.',
  Cancelled: 'Buổi đã bị hủy; đăng ký chỉ còn để xem.',
}

/** Why a Tour takes no new registration, for someone who has none there. */
const CLOSED_WHY: Record<TourState, string> = {
  Scheduled: '',
  Ready: 'Buổi đã chốt danh sách, không nhận đăng ký mới.',
  Running: 'Buổi đang diễn ra.',
  Completed: 'Buổi đã kết thúc.',
  Cancelled: 'Buổi đã bị hủy.',
}

/* ── Who is calling ───────────────────────────────────────────────────────── */

export type RepresentativeProfile = { schoolName: string; representativeName: string; contactEmail: string }

const DEMO_OWNER = 'mock-user-daidien'
const PROFILES: Record<string, RepresentativeProfile> = {
  [DEMO_OWNER]: { schoolName: 'THPT Trần Phú', representativeName: 'Cô Lê Thanh Vy', contactEmail: 'daidien.tranphu@truong-mau.example' },
}

/** What the form pre-fills for a new registration. Blank for an unknown account. */
export function profileFor(ownerId: string): RepresentativeProfile {
  return PROFILES[ownerId] ?? { schoolName: '', representativeName: '', contactEmail: '' }
}

/* ── Seed (once per world; `resetSim` clears `fired`, so it re-seeds) ─────── */

const FIRST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi']
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Gia', 'Ngọc', 'Thanh']
const LAST = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Lan', 'Minh', 'Nhi', 'Phúc', 'Quân', 'Trâm', 'Vy']
const demoRoster = (count: number, seed: number, className: string | null): RosterRow[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `${FIRST[(seed + i) % FIRST.length]} ${MIDDLE[(seed * 3 + i) % MIDDLE.length]} ${LAST[(seed * 5 + i * 3) % LAST.length]}`,
    className,
  }))

/** Registration milestones the representative made; Admin's decisions come from the record. */
let ownLog = new Map<string, { at: string; text: string }[]>()
const note = (regId: string, text: string, at = iso(now())) => {
  const list = ownLog.get(regId) ?? []
  list.push({ at, text })
  ownLog.set(regId, list)
}

function newRegistration(id: string, ownerId: string, input: RegistrationInput, extra: Partial<SimRegistration> = {}): SimRegistration {
  return {
    id,
    schoolName: input.schoolName,
    representativeName: input.representativeName,
    contactEmail: input.contactEmail,
    state: 'Submitted',
    studentCount: input.roster.length,
    roster: input.roster,
    invitationSentAt: null,
    submittedAt: iso(now()),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    resubmittedAfterApproval: false,
    invitationFailed: false,
    groupCode: world.groupCodeFor(id),
    version: 1,
    ownerId,
    ...extra,
  }
}

/**
 * Idempotent. Every mock service entry point calls it (admin, staff and this
 * one), so each area sees the same groups whichever is opened first.
 */
export function ensureRepresentativeSeed() {
  ensureSeeded()
}

function ensureSeeded() {
  if (world.sim.fired.has('rep-seed')) return
  world.sim.fired.add('rep-seed')
  ownLog = new Map()
  const profile = PROFILES[DEMO_OWNER]
  const day = 60 * 60_000 * 24

  const t03 = world.tourById('tour-03')
  const reg09 = t03?.registrations.find((reg) => reg.id === 'reg-09')
  if (reg09) {
    reg09.ownerId = DEMO_OWNER
    reg09.contactEmail = profile.contactEmail
    note(reg09.id, 'Gửi đăng ký kèm danh sách học sinh.', reg09.submittedAt)
  }

  const attach = (tourId: string, reg: SimRegistration, sentAt: string) => {
    const t = world.tourById(tourId)
    if (!t) return
    t.registrations.push(reg)
    note(reg.id, 'Gửi đăng ký kèm danh sách học sinh.', sentAt)
  }

  const rejectedAt = iso(now() - day * 0.6)
  attach('tour-05', newRegistration('reg-r1', DEMO_OWNER, { ...profile, roster: [...demoRoster(19, 3, '10A5'), ...demoRoster(3, 9, null)] }, {
    state: 'Rejected',
    submittedAt: iso(now() - day * 1.2),
    reviewedAt: rejectedAt,
    reviewedBy: 'admin',
    rejectionReason: 'Có 3 học sinh thiếu Lớp trong khi các dòng khác đều có lớp. Vui lòng bổ sung cột Lop cho đủ rồi gửi lại.',
  }), iso(now() - day * 1.2))

  attach('tour-02', newRegistration('reg-r2', DEMO_OWNER, { ...profile, roster: demoRoster(24, 5, '11A2') }, {
    state: 'Approved',
    submittedAt: iso(now() - day * 3),
    reviewedAt: iso(now() - day * 2),
    reviewedBy: 'admin',
    invitationSentAt: iso(now() - day * 1.9),
  }), iso(now() - day * 3))

  attach('tour-00', newRegistration('reg-r3', DEMO_OWNER, { ...profile, roster: demoRoster(20, 7, '12A1') }, {
    state: 'Approved',
    submittedAt: iso(now() - day * 6),
    reviewedAt: iso(now() - day * 5),
    reviewedBy: 'admin',
    invitationSentAt: iso(now() - day * 5),
  }), iso(now() - day * 6))
}

/* ── Lookup ───────────────────────────────────────────────────────────────── */

const allTours = () => [...world.sim.tours, ...world.sim.history]

function requireTour(id: string): SimTour {
  const t = world.tourById(id) ?? world.sim.history.find((item) => item.id === id)
  if (!t) throw notFound('buổi tham quan')
  return t
}

function mine(t: SimTour, ownerId: string) {
  return t.registrations.find((reg) => reg.ownerId === ownerId) ?? null
}

/** Someone else's registration answers "not found": its existence is not theirs to learn. */
function requireOwn(id: string, ownerId: string): { t: SimTour; reg: SimRegistration } {
  for (const t of allTours()) {
    const reg = t.registrations.find((item) => item.id === id)
    if (reg) {
      if (reg.ownerId !== ownerId) break
      return { t, reg }
    }
  }
  throw notFound('đăng ký')
}

function changed(t: SimTour, reg: SimRegistration) {
  t.version += 1
  reg.version += 1
  world.touchTour(t)
}

/* ── Rules ────────────────────────────────────────────────────────────────── */

function registerGate(t: SimTour, reg: SimRegistration | null): ActionGate {
  if (t.state !== 'Scheduled') return gate(false, reg && reg.state !== 'Cancelled' ? LOCKED_WHY[t.state] : CLOSED_WHY[t.state])
  if (reg && reg.state !== 'Cancelled') return gate(false, 'Bạn đã có đăng ký cho buổi này. Mở đăng ký để sửa hoặc thay danh sách.')
  return gate(true)
}

function actions(t: SimTour, reg: SimRegistration) {
  const open = t.state === 'Scheduled'
  const locked = LOCKED_WHY[t.state]
  return {
    edit: gate(open && (reg.state === 'Submitted' || reg.state === 'Rejected'), !open ? locked : reg.state === 'Approved' ? 'Đã duyệt: dùng "Thay danh sách" để gửi danh sách mới.' : 'Đăng ký đã hủy: dùng "Đăng ký lại".'),
    replaceRoster: gate(open && reg.state === 'Approved', !open ? locked : 'Chỉ dùng khi đăng ký đã được duyệt.'),
    cancel: gate(open && reg.state !== 'Cancelled', !open ? locked : 'Đăng ký đã hủy.'),
    reRegister: gate(open && reg.state === 'Cancelled', !open ? locked : 'Chỉ dùng khi đăng ký đã hủy.'),
  }
}

const participationOpen = (t: SimTour) => t.state === 'Scheduled' || t.state === 'Ready' || t.state === 'Running'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function registrationView(t: SimTour, reg: SimRegistration): RepresentativeRegistration {
  const d = new Date(t.scheduledAt)
  const when = `${pad(d.getHours())}:${pad(d.getMinutes())} ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  return {
    id: reg.id,
    tourId: t.id,
    tourCode: t.code,
    tourName: t.name,
    tourState: t.state,
    tourScheduledAt: t.scheduledAt,
    schoolName: reg.schoolName,
    representativeName: reg.representativeName,
    contactEmail: reg.contactEmail,
    state: reg.state,
    studentCount: reg.roster.length,
    withClassCount: reg.roster.filter((row) => row.className?.trim()).length,
    submittedAt: reg.submittedAt,
    reviewedAt: reg.reviewedAt,
    rejectionReason: reg.state === 'Rejected' ? reg.rejectionReason : null,
    resubmittedAfterApproval: reg.resubmittedAfterApproval,
    participation:
      reg.state === 'Approved' && participationOpen(t)
        ? {
            joinLink: joinLinkFor(t.code),
            groupCode: reg.groupCode,
            emailSentAt: reg.invitationSentAt ?? null,
            instructions: [
              `Buổi tham quan dự kiến bắt đầu lúc ${when}. Giờ trên web luôn là giờ mới nhất.`,
              'Gửi đường dẫn và mã đoàn cho học sinh có trong danh sách đã duyệt.',
              'Học sinh nhập mã đoàn, họ tên và lớp đúng như trong danh sách. Không cần tài khoản.',
              'Nhắc học sinh vào trước khoảng 10 phút để kiểm tra âm thanh và kết nối.',
            ],
          }
        : null,
    allowedActions: actions(t, reg),
    version: reg.version,
  }
}

function historyOf(reg: SimRegistration) {
  const list = [...(ownLog.get(reg.id) ?? [])]
  if (reg.reviewedAt && (reg.state === 'Approved' || reg.state === 'Rejected')) {
    list.push({ at: reg.reviewedAt, text: reg.state === 'Approved' ? 'Admin duyệt đăng ký.' : 'Admin từ chối đăng ký. Xem lý do bên trên.' })
  }
  if (reg.invitationSentAt) list.push({ at: reg.invitationSentAt, text: 'Admin gửi email thông tin tham gia tới địa chỉ liên hệ.' })
  return list.sort((a, b) => a.at.localeCompare(b.at))
}

function tourView(t: SimTour, ownerId: string): RepresentativeTour {
  const reg = mine(t, ownerId)
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    scheduledAt: t.scheduledAt,
    routeName: t.routeName,
    stops: t.stops.map((stop) => stop.name),
    state: t.state,
    register: registerGate(t, reg),
    myRegistrationId: reg?.id ?? null,
    myRegistrationState: reg?.state ?? null,
  }
}

/* ── Validation ───────────────────────────────────────────────────────────── */

type FieldErrors = NonNullable<RepresentativeErrorBody['fieldErrors']>
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateInput(input: RegistrationInput): FieldErrors {
  const errors: FieldErrors = {}
  if (!input.schoolName?.trim()) errors.schoolName = 'Nhập tên trường / đoàn.'
  else if (input.schoolName.trim().length > 120) errors.schoolName = 'Tên trường tối đa 120 ký tự.'
  if (!input.representativeName?.trim()) errors.representativeName = 'Nhập họ tên người liên hệ.'
  else if (input.representativeName.trim().length > 80) errors.representativeName = 'Họ tên tối đa 80 ký tự.'
  if (!input.contactEmail?.trim()) errors.contactEmail = 'Nhập email liên hệ.'
  else if (!EMAIL.test(input.contactEmail.trim())) errors.contactEmail = 'Email chưa đúng định dạng.'
  const roster = input.roster ?? []
  if (roster.length === 0) errors.roster = 'Tải lên danh sách có ít nhất một học sinh.'
  else if (roster.length > ROSTER_MAX_ROWS) errors.roster = `Danh sách tối đa ${ROSTER_MAX_ROWS} học sinh.`
  else if (roster.some((row) => !row.name?.trim())) errors.roster = 'Mỗi dòng phải có Họ tên.'
  return errors
}

function clean(input: RegistrationInput): RegistrationInput {
  return {
    schoolName: input.schoolName.trim(),
    representativeName: input.representativeName.trim(),
    contactEmail: input.contactEmail.trim(),
    roster: input.roster.map((row) => ({ name: row.name.trim().replace(/\s+/g, ' '), className: row.className?.trim() || null })),
  }
}

function requireValid(input: RegistrationInput) {
  const fieldErrors = validateInput(input)
  if (Object.keys(fieldErrors).length) {
    throw new RepresentativeRejection(400, { code: 'Validation', message: 'Vui lòng kiểm tra lại các mục được đánh dấu.', fieldErrors })
  }
}

const sameRoster = (a: RosterRow[], b: RosterRow[]) =>
  a.length === b.length && a.every((row, i) => row.name === b[i].name && (row.className ?? null) === (b[i].className ?? null))

/* ── Queries ──────────────────────────────────────────────────────────────── */

const TERMINAL = new Set<TourState>(['Completed', 'Cancelled'])

export function listTours(ownerId: string): RepresentativeTour[] {
  ensureSeeded()
  return allTours()
    .filter((t) => !TERMINAL.has(t.state) || mine(t, ownerId))
    .sort((a, b) => {
      const ta = TERMINAL.has(a.state)
      const tb = TERMINAL.has(b.state)
      if (ta !== tb) return ta ? 1 : -1
      return ta ? b.scheduledAt.localeCompare(a.scheduledAt) : a.scheduledAt.localeCompare(b.scheduledAt)
    })
    .map((t) => tourView(t, ownerId))
}

export function getTour(id: string, ownerId: string): RepresentativeTour {
  ensureSeeded()
  const t = requireTour(id)
  if (TERMINAL.has(t.state) && !mine(t, ownerId)) throw notFound('buổi tham quan')
  return tourView(t, ownerId)
}

export function listRegistrations(ownerId: string): RepresentativeRegistration[] {
  ensureSeeded()
  const rows: RepresentativeRegistration[] = []
  for (const t of allTours()) {
    const reg = mine(t, ownerId)
    if (reg) rows.push(registrationView(t, reg))
  }
  // Upcoming Tours first, then the finished ones.
  return rows.sort((a, b) => {
    const ta = TERMINAL.has(a.tourState)
    const tb = TERMINAL.has(b.tourState)
    if (ta !== tb) return ta ? 1 : -1
    return ta ? b.tourScheduledAt.localeCompare(a.tourScheduledAt) : a.tourScheduledAt.localeCompare(b.tourScheduledAt)
  })
}

export function getRegistration(id: string, ownerId: string): RepresentativeRegistrationDetail {
  ensureSeeded()
  const { t, reg } = requireOwn(id, ownerId)
  return { ...registrationView(t, reg), roster: structuredClone(reg.roster), history: historyOf(reg) }
}

/* ── Commands ─────────────────────────────────────────────────────────────── */

const submitted = new Map<string, string>()
let regSeq = 0

export function submit(tourId: string, raw: RegistrationInput, requestId: string, ownerId: string): RepresentativeRegistration {
  ensureSeeded()
  const repeat = submitted.get(requestId)
  if (repeat) {
    const { t, reg } = requireOwn(repeat, ownerId)
    return registrationView(t, reg)
  }
  const t = requireTour(tourId)
  const existing = mine(t, ownerId)
  // Checked before validation: a locked Tour says why it is locked, not what is missing.
  const verdict = registerGate(t, existing)
  if (!verdict.allowed) throw notAllowed(verdict.reason ?? 'Không đăng ký được buổi này.')
  requireValid(raw)
  const input = clean(raw)

  if (existing) {
    // Register again: the same record goes back to review (flow §4.2).
    Object.assign(existing, {
      schoolName: input.schoolName,
      representativeName: input.representativeName,
      contactEmail: input.contactEmail,
      roster: input.roster,
      studentCount: input.roster.length,
      state: 'Submitted',
      submittedAt: iso(now()),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
      resubmittedAfterApproval: false,
    })
    note(existing.id, `Đăng ký lại với ${input.roster.length} học sinh.`)
    world.logEvent(t, 'RegistrationSubmitted', `Đại diện ${input.schoolName} đăng ký lại (${input.roster.length} học sinh).`, 'Đại diện trường')
    changed(t, existing)
    submitted.set(requestId, existing.id)
    return registrationView(t, existing)
  }

  regSeq += 1
  const reg = newRegistration(`reg-p${String(regSeq).padStart(2, '0')}`, ownerId, input)
  t.registrations.push(reg)
  note(reg.id, `Gửi đăng ký kèm danh sách ${input.roster.length} học sinh.`)
  world.logEvent(t, 'RegistrationSubmitted', `Đại diện ${input.schoolName} gửi đăng ký (${input.roster.length} học sinh).`, 'Đại diện trường')
  changed(t, reg)
  submitted.set(requestId, reg.id)
  return registrationView(t, reg)
}

export function update(id: string, raw: RegistrationInput, version: number, ownerId: string): RepresentativeRegistration {
  ensureSeeded()
  const { t, reg } = requireOwn(id, ownerId)
  if (t.state !== 'Scheduled') throw notAllowed(LOCKED_WHY[t.state])
  if (reg.version !== version) throw stale()
  if (reg.state === 'Cancelled') throw notAllowed('Đăng ký đã hủy: dùng "Đăng ký lại".')
  requireValid(raw)
  const input = clean(raw)

  if (reg.state === 'Approved') {
    // The rule for changing only the e-mail of an approved group is not settled
    // (flow review §10.2): refuse it here and point to Admin.
    const fieldErrors: FieldErrors = {}
    if (input.contactEmail !== reg.contactEmail) fieldErrors.contactEmail = 'Đăng ký đã duyệt: không đổi email tại đây. Liên hệ Admin nếu cần.'
    if (input.schoolName !== reg.schoolName) fieldErrors.schoolName = 'Đăng ký đã duyệt: chỉ thay được danh sách học sinh.'
    if (input.representativeName !== reg.representativeName) fieldErrors.representativeName = 'Đăng ký đã duyệt: chỉ thay được danh sách học sinh.'
    if (Object.keys(fieldErrors).length) throw new RepresentativeRejection(400, { code: 'Validation', message: 'Khi đã duyệt chỉ thay được danh sách học sinh.', fieldErrors })
    if (sameRoster(input.roster, reg.roster)) {
      throw new RepresentativeRejection(400, { code: 'Validation', message: 'Danh sách mới giống hệt danh sách đã duyệt; không có gì để gửi lại.', fieldErrors: { roster: 'Danh sách không thay đổi.' } })
    }
    const before = reg.roster.length
    Object.assign(reg, { roster: input.roster, studentCount: input.roster.length, state: 'Submitted', submittedAt: iso(now()), reviewedAt: null, reviewedBy: null, resubmittedAfterApproval: true })
    note(reg.id, `Thay danh sách (${before} → ${input.roster.length} học sinh); đăng ký về Chờ duyệt.`)
    world.logEvent(t, 'RosterReplaced', `Đại diện ${reg.schoolName} thay danh sách (${before} → ${input.roster.length} học sinh); đăng ký về Chờ duyệt.`, 'Đại diện trường')
    changed(t, reg)
    return registrationView(t, reg)
  }

  const wasRejected = reg.state === 'Rejected'
  Object.assign(reg, {
    schoolName: input.schoolName,
    representativeName: input.representativeName,
    contactEmail: input.contactEmail,
    roster: input.roster,
    studentCount: input.roster.length,
    state: 'Submitted',
    submittedAt: iso(now()),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  })
  note(reg.id, wasRejected ? `Sửa và gửi lại sau khi bị từ chối (${input.roster.length} học sinh).` : `Cập nhật đăng ký (${input.roster.length} học sinh).`)
  world.logEvent(t, wasRejected ? 'RegistrationResubmitted' : 'RegistrationUpdated', `Đại diện ${reg.schoolName} ${wasRejected ? 'gửi lại đăng ký' : 'cập nhật đăng ký'} (${input.roster.length} học sinh).`, 'Đại diện trường')
  changed(t, reg)
  return registrationView(t, reg)
}

export function cancel(id: string, version: number, ownerId: string): RepresentativeRegistration {
  ensureSeeded()
  const { t, reg } = requireOwn(id, ownerId)
  if (t.state !== 'Scheduled') throw notAllowed(LOCKED_WHY[t.state])
  if (reg.version !== version) throw stale()
  if (reg.state === 'Cancelled') throw notAllowed('Đăng ký đã hủy.')
  reg.state = 'Cancelled'
  note(reg.id, 'Đại diện hủy đăng ký.')
  world.logEvent(t, 'RegistrationCancelled', `Đại diện ${reg.schoolName} hủy đăng ký.`, 'Đại diện trường')
  changed(t, reg)
  return registrationView(t, reg)
}

export { STATE_WORDS as TOUR_STATE_WORDS }
