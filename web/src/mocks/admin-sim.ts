/**
 * The administration half of the mock server: the rules behind
 * `api/contracts/admin.ts`, applied to the SAME world as `staff-sim.ts`, so a
 * Tour Admin finalizes is the Tour Staff can start.
 *
 * Labelled fixture. It plays the server: state checks, the READY checklist,
 * concurrency tokens and the e-mail service's answer. Two scripted demo
 * moments (each fires once, then behaves normally):
 *   - approving/rejecting `reg-14` first meets a roster the representative
 *     has just replaced → 409 StaleData, "Tải lại", then it works;
 *   - the first e-mail to `reg-09` is refused by the mail service → the
 *     registration stays Approved and "Gửi lại" works.
 */
import type {
  AdminErrorBody,
  AdminRegistration,
  AdminRegistrationDetail,
  AdminRoute,
  AdminTour,
  AdminTourDetail,
  AdminTourFilters,
  InvitationPreview,
  RegistrationFilters,
  TourInput,
} from '../api/contracts/admin'
import type { ActionGate } from '../api/contracts/staff'
import * as world from './staff-sim'
import type { SimRegistration, SimTour } from './staff-sim'

/** A refusal the mock server returns; `admin-mock.ts` turns it into an ApiError. */
export class AdminRejection extends Error {
  readonly status: number
  readonly body: AdminErrorBody
  constructor(status: number, body: AdminErrorBody) {
    super(body.message)
    this.status = status
    this.body = body
  }
}

const notAllowed = (message: string) => new AdminRejection(409, { code: 'NotAllowed', message })
const stale = (message = 'Dữ liệu đã thay đổi. Vui lòng tải lại.') => new AdminRejection(409, { code: 'StaleData', message })

const JOIN_BASE = 'https://campustour.example/tham-gia'
/** The student join link of a Tour; the representative area shows the same one. */
export const joinLinkFor = (tourCode: string) => `${JOIN_BASE}/${tourCode}`
const now = () => Date.now()
const iso = (ms: number) => new Date(ms).toISOString()
const gate = (allowed: boolean, reason?: string | null): ActionGate => ({ allowed, reason: allowed ? null : reason ?? null })

const STATE_WORDS: Record<string, string> = {
  Scheduled: 'Đang chuẩn bị',
  Ready: 'Sẵn sàng',
  Running: 'Đang diễn ra',
  Completed: 'Hoàn thành',
  Cancelled: 'Đã hủy',
}

/* ── Lookup ───────────────────────────────────────────────────────────────── */

const allTours = () => [...world.sim.tours, ...world.sim.history]

function requireTour(id: string): SimTour {
  const t = world.tourById(id)
  if (!t) throw new AdminRejection(404, { code: 'NotFound', message: 'Không tìm thấy Tour.' })
  return t
}

function findRegistration(id: string): { t: SimTour; reg: SimRegistration } {
  for (const t of allTours()) {
    const reg = t.registrations.find((item) => item.id === id)
    if (reg) return { t, reg }
  }
  throw new AdminRejection(404, { code: 'NotFound', message: 'Không tìm thấy đăng ký.' })
}

function changed(t: SimTour, reg?: SimRegistration) {
  t.version += 1
  if (reg) reg.version += 1
  world.touchTour(t)
}

/* ── Rules ────────────────────────────────────────────────────────────────── */

function tourActions(t: SimTour) {
  const checks = world.readyChecklist(t)
  const failed = checks.filter((check) => !check.passed)
  const word = STATE_WORDS[t.state]
  return {
    edit: gate(t.state === 'Scheduled', `Chỉ sửa được khi Tour đang chuẩn bị (hiện: ${word}). ${t.state === 'Ready' ? 'Mở lại Tour để sửa.' : ''}`.trim()),
    finalize: gate(t.state === 'Scheduled' && failed.length === 0, t.state !== 'Scheduled' ? `Tour đang ở trạng thái ${word}` : `Chưa đủ điều kiện: ${failed.map((check) => check.label.toLowerCase()).join('; ')}`),
    reopen: gate(t.state === 'Ready', t.state === 'Scheduled' ? 'Tour chưa được chốt' : t.state === 'Running' ? 'Tour đã bắt đầu; không mở lại sau Start' : 'Tour đã kết thúc; không mở lại'),
    cancel: gate(t.state === 'Scheduled' || t.state === 'Ready', t.state === 'Running' ? 'Tour đang diễn ra: Staff dùng Kết thúc sớm' : 'Tour đã kết thúc'),
  }
}

function registrationActions(t: SimTour, reg: SimRegistration) {
  const tourOpen = t.state === 'Scheduled'
  const lockedWhy = t.state === 'Ready' ? 'Tour đã chốt danh sách. Mở lại Tour để duyệt.' : `Tour đang ở trạng thái ${STATE_WORDS[t.state]}`
  const decide = gate(tourOpen && reg.state === 'Submitted', !tourOpen ? lockedWhy : reg.state === 'Approved' ? 'Đăng ký đã được duyệt' : reg.state === 'Rejected' ? 'Đăng ký đã bị từ chối; chờ đại diện gửi lại' : 'Đại diện đã hủy đăng ký')
  return {
    approve: decide,
    reject: decide,
    sendInvitation: gate(reg.state === 'Approved' && (t.state === 'Scheduled' || t.state === 'Ready'), reg.state !== 'Approved' ? 'Chỉ gửi cho đăng ký đã duyệt' : `Tour đang ở trạng thái ${STATE_WORDS[t.state]}`),
  }
}

/* ── Read models ──────────────────────────────────────────────────────────── */

export function routeView(key: string): AdminRoute | null {
  const def = world.ROUTES[key]
  if (!def) return null
  const issues = world.routeIssues(key)
  return {
    id: key,
    name: def.name,
    description: def.description,
    stops: def.stops.map((stop, index) => ({ id: `stop-${stop.place}`, order: index + 1, name: world.placeOf(stop.place).name, position: { ...world.placeOf(stop.place).position }, dwellSeconds: stop.dwell, headSteps: [...stop.head], narration: stop.narration })),
    startPoint: structuredClone(world.placeOf('start')),
    endPoint: def.endPlace ? structuredClone(world.placeOf(def.endPlace)) : null,
    valid: issues.length === 0,
    issues,
    usedBy: world.sim.tours.filter((t) => t.routeKey === key && (t.state === 'Scheduled' || t.state === 'Ready' || t.state === 'Running')).map((t) => t.code),
  }
}

function registrationView(t: SimTour, reg: SimRegistration): AdminRegistration {
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
    submittedAt: reg.submittedAt,
    reviewedAt: reg.reviewedAt,
    reviewedBy: reg.reviewedBy,
    rejectionReason: reg.rejectionReason,
    resubmittedAfterApproval: reg.resubmittedAfterApproval,
    invitationSentAt: reg.invitationSentAt ?? null,
    invitationFailed: reg.invitationFailed,
    allowedActions: registrationActions(t, reg),
    version: reg.version,
  }
}

function registrationDetailView(t: SimTour, reg: SimRegistration): AdminRegistrationDetail {
  return { ...registrationView(t, reg), roster: structuredClone(reg.roster), groupCode: reg.groupCode, joinLink: `${JOIN_BASE}/${t.code}` }
}

export function tourSummary(t: SimTour): AdminTour {
  const count = (state: string) => t.registrations.filter((reg) => reg.state === state).length
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    scheduledAt: t.scheduledAt,
    routeId: t.routeKey,
    routeName: t.routeName,
    state: t.state,
    counts: { total: t.registrations.length, submitted: count('Submitted'), approved: count('Approved'), rejected: count('Rejected'), cancelled: count('Cancelled') },
    invitationsPending: t.state === 'Scheduled' || t.state === 'Ready' ? t.registrations.filter((reg) => reg.state === 'Approved' && !reg.invitationSentAt).length : 0,
    readyBlockers: world.readyBlockers(t),
    allowedActions: tourActions(t),
    createdAt: t.createdAt,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    endReason: t.endReason,
    version: t.version,
  }
}

export function tourDetail(t: SimTour): AdminTourDetail {
  return {
    ...tourSummary(t),
    route: routeView(t.routeKey),
    readyChecklist: world.readyChecklist(t),
    registrations: t.registrations.map((reg) => registrationView(t, reg)),
    events: structuredClone([...t.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))),
  }
}

/* ── Queries ──────────────────────────────────────────────────────────────── */

const dayKey = (value: string | number) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const inRange = (at: string, from?: string, to?: string) => {
  const day = dayKey(at)
  return (!from || day >= from) && (!to || day <= to)
}
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().trim()

const TERMINAL = new Set(['Completed', 'Cancelled'])

/** Upcoming first (soonest on top), then finished ones (latest on top). */
function adminOrder(a: SimTour, b: SimTour) {
  const ta = TERMINAL.has(a.state)
  const tb = TERMINAL.has(b.state)
  if (ta !== tb) return ta ? 1 : -1
  return ta ? b.scheduledAt.localeCompare(a.scheduledAt) : a.scheduledAt.localeCompare(b.scheduledAt)
}

export function listTours(filters: AdminTourFilters = {}): AdminTour[] {
  const q = filters.q ? fold(filters.q) : ''
  return allTours()
    .filter((t) => (!filters.state || t.state === filters.state) && inRange(t.scheduledAt, filters.from, filters.to) && (!q || fold(`${t.name} ${t.code}`).includes(q)))
    .sort(adminOrder)
    .map(tourSummary)
}

export function getTour(id: string) {
  return tourDetail(requireTour(id))
}

export function listRegistrations(filters: RegistrationFilters = {}): AdminRegistration[] {
  const q = filters.q ? fold(filters.q) : ''
  const rows: AdminRegistration[] = []
  for (const t of allTours()) {
    if (filters.tourId && t.id !== filters.tourId) continue
    if (!inRange(t.scheduledAt, filters.from, filters.to)) continue
    for (const reg of t.registrations) {
      if (filters.state && reg.state !== filters.state) continue
      if (q && !fold(`${reg.schoolName} ${reg.representativeName} ${t.name} ${t.code}`).includes(q)) continue
      rows.push(registrationView(t, reg))
    }
  }
  // Oldest submission first: the queue is worked in arrival order.
  return rows.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
}

export function getRegistration(id: string) {
  const { t, reg } = findRegistration(id)
  return registrationDetailView(t, reg)
}

export function listRoutes(): AdminRoute[] {
  return Object.keys(world.ROUTES).map((key) => routeView(key) as AdminRoute)
}

/* ── Tour commands ────────────────────────────────────────────────────────── */

type FieldErrors = NonNullable<AdminErrorBody['fieldErrors']>

function validate(input: TourInput): FieldErrors {
  const errors: FieldErrors = {}
  if (!input.name?.trim()) errors.name = 'Nhập tên Tour.'
  else if (input.name.trim().length > 120) errors.name = 'Tên Tour tối đa 120 ký tự.'
  const at = input.scheduledAt ? new Date(input.scheduledAt).getTime() : Number.NaN
  if (!input.scheduledAt || !Number.isFinite(at)) errors.scheduledAt = 'Chọn ngày và giờ dự kiến.'
  else if (at <= now()) errors.scheduledAt = 'Giờ dự kiến phải ở tương lai.'
  if (!input.description?.trim()) errors.description = 'Nhập mô tả ngắn cho Tour.'
  else if (input.description.trim().length > 1000) errors.description = 'Mô tả tối đa 1000 ký tự.'
  if (!input.routeId) errors.routeId = 'Chọn một tuyến đã chuẩn bị.'
  else if (!world.ROUTES[input.routeId]) errors.routeId = 'Tuyến không còn trong cấu hình.'
  else if (world.routeIssues(input.routeId).length) errors.routeId = `Tuyến chưa dùng được: ${world.routeIssues(input.routeId).join('; ')}`
  return errors
}

function requireValid(input: TourInput) {
  const fieldErrors = validate(input)
  if (Object.keys(fieldErrors).length) throw new AdminRejection(400, { code: 'Validation', message: 'Vui lòng kiểm tra lại các trường được đánh dấu.', fieldErrors })
}

function requireVersion(actual: number, sent: number) {
  if (actual !== sent) throw stale()
}

/** requestId → created Tour id, so a repeated submit returns the same Tour (UC-01). */
const created = new Map<string, string>()
let tourSeq = 7

export function createTour(input: TourInput, requestId: string, actor: string) {
  const existing = created.get(requestId)
  if (existing) return tourSummary(requireTour(existing))
  requireValid(input)
  tourSeq += 1
  const id = `tour-${String(tourSeq).padStart(2, '0')}`
  const at = new Date(input.scheduledAt).getTime()
  const t = world.tour({ id, code: `T-${String(tourSeq).padStart(2, '0')}`, name: input.name.trim(), state: 'Scheduled', route: input.routeId, at: (at - now()) / 60_000 })
  t.description = input.description.trim()
  t.createdAt = iso(now())
  // No robot, no leg, no auto-READY: a new Tour is Scheduled and waits (scope §3.6).
  world.logEvent(t, 'TourCreated', `Tạo Tour trên ${t.routeName}.`, actor)
  world.sim.addTour(t)
  created.set(requestId, id)
  return tourSummary(t)
}

export function updateTour(id: string, input: TourInput, version: number, actor: string) {
  const t = requireTour(id)
  if (t.state !== 'Scheduled') throw notAllowed(tourActions(t).edit.reason ?? 'Không sửa được Tour ở trạng thái này.')
  requireVersion(t.version, version)
  requireValid(input)
  const notes: string[] = []
  if (t.name !== input.name.trim()) notes.push('tên')
  if (t.scheduledAt !== new Date(input.scheduledAt).toISOString()) notes.push('giờ dự kiến')
  if (t.description !== input.description.trim()) notes.push('mô tả')
  if (t.routeKey !== input.routeId) notes.push('tuyến')
  t.name = input.name.trim()
  t.description = input.description.trim()
  const at = new Date(input.scheduledAt).getTime()
  t.scheduledAt = iso(at)
  t.estimatedEndAt = iso(at + 30 * 60_000)
  if (t.routeKey !== input.routeId) {
    t.routeKey = input.routeId
    t.routeName = world.ROUTES[input.routeId].name
    t.stops = world.stopsFor(input.routeId)
  }
  world.logEvent(t, 'TourUpdated', notes.length ? `Sửa ${notes.join(', ')}.` : 'Lưu thông tin Tour (không có thay đổi).', actor)
  changed(t)
  return tourSummary(t)
}

export function finalizeTour(id: string, version: number, actor: string) {
  const t = requireTour(id)
  requireVersion(t.version, version)
  // Evaluated and written in one step: a submission cannot slip in between.
  const verdict = tourActions(t).finalize
  if (!verdict.allowed) throw notAllowed(verdict.reason ?? 'Chưa đủ điều kiện chốt Tour.')
  const approved = t.registrations.filter((reg) => reg.state === 'Approved')
  t.state = 'Ready'
  world.logEvent(t, 'ReadyConfirmed', `Chốt Tour: ${approved.length} đoàn đã duyệt, ${approved.reduce((sum, reg) => sum + reg.roster.length, 0)} học sinh. Khóa thông tin, tuyến và danh sách.`, actor)
  changed(t)
  return tourSummary(t)
}

export function reopenTour(id: string, version: number, actor: string) {
  const t = requireTour(id)
  requireVersion(t.version, version)
  const verdict = tourActions(t).reopen
  if (!verdict.allowed) throw notAllowed(verdict.reason ?? 'Không mở lại được Tour.')
  t.state = 'Scheduled'
  // Approved registrations stay approved (scope §5.2).
  world.logEvent(t, 'TourReopened', 'Mở lại Tour về Đang chuẩn bị; các đoàn đã duyệt giữ nguyên.', actor)
  changed(t)
  return tourSummary(t)
}

export function cancelTour(id: string, reason: string, version: number, actor: string) {
  const t = requireTour(id)
  if (!reason?.trim()) throw new AdminRejection(400, { code: 'Validation', message: 'Hủy Tour cần ghi lý do.' })
  requireVersion(t.version, version)
  const verdict = tourActions(t).cancel
  if (!verdict.allowed) throw notAllowed(verdict.reason ?? 'Không hủy được Tour.')
  t.state = 'Cancelled'
  t.endedAt = iso(now())
  t.endReason = `Admin hủy trước giờ chạy: ${reason.trim()}`
  world.logEvent(t, 'TourCancelled', t.endReason, actor)
  changed(t)
  return tourSummary(t)
}

/* ── Registration commands ────────────────────────────────────────────────── */

/** Scripted once: the representative replaces reg-14's roster as Admin decides. */
function scriptedConcurrentEdit(t: SimTour, reg: SimRegistration) {
  if (reg.id !== 'reg-14' || world.sim.fired.has('conflict:reg-14')) return
  world.sim.fired.add('conflict:reg-14')
  reg.roster = [...reg.roster, { name: 'Trần Gia Hân', className: '12CT' }, { name: 'Lê Minh Khôi', className: '12CT' }]
  reg.studentCount = reg.roster.length
  reg.submittedAt = iso(now())
  world.logEvent(t, 'RosterReplaced', `Đại diện ${reg.schoolName} thay danh sách (${reg.roster.length - 2} → ${reg.roster.length} học sinh).`, 'Đại diện trường')
  changed(t, reg)
}

function decide(id: string, version: number) {
  const { t, reg } = findRegistration(id)
  scriptedConcurrentEdit(t, reg)
  if (reg.version !== version) throw stale('Danh sách đã được cập nhật. Vui lòng tải lại dữ liệu trước khi duyệt.')
  const verdict = registrationActions(t, reg).approve
  if (!verdict.allowed) throw notAllowed(verdict.reason ?? 'Không duyệt được đăng ký này.')
  return { t, reg }
}

export function approveRegistration(id: string, version: number, actor: string) {
  const { t, reg } = decide(id, version)
  reg.state = 'Approved'
  reg.reviewedAt = iso(now())
  reg.reviewedBy = actor
  reg.rejectionReason = null
  reg.resubmittedAfterApproval = false
  // Approving a group never makes the Tour READY; that is a separate decision.
  world.logEvent(t, 'RegistrationApproved', `Duyệt đăng ký ${reg.schoolName} (${reg.roster.length} học sinh).`, actor)
  changed(t, reg)
  return registrationView(t, reg)
}

export function rejectRegistration(id: string, reason: string, version: number, actor: string) {
  if (!reason?.trim()) throw new AdminRejection(400, { code: 'Validation', message: 'Từ chối cần ghi lý do để đại diện sửa lại.' })
  const { t, reg } = decide(id, version)
  reg.state = 'Rejected'
  reg.reviewedAt = iso(now())
  reg.reviewedBy = actor
  reg.rejectionReason = reason.trim()
  reg.resubmittedAfterApproval = false
  world.logEvent(t, 'RegistrationRejected', `Từ chối đăng ký ${reg.schoolName}: ${reason.trim()}`, actor)
  changed(t, reg)
  return registrationView(t, reg)
}

/* ── Invitations ──────────────────────────────────────────────────────────── */

export function invitationPreview(id: string): InvitationPreview {
  const { t, reg } = findRegistration(id)
  const verdict = registrationActions(t, reg).sendInvitation
  if (!verdict.allowed) throw notAllowed(verdict.reason ?? 'Không gửi được thông tin tham gia.')
  const d = new Date(t.scheduledAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const when = `${pad(d.getHours())}:${pad(d.getMinutes())} ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  return {
    registrationId: reg.id,
    recipient: reg.contactEmail,
    subject: `[CampusTour] Thông tin tham gia ${t.name}`,
    tourName: t.name,
    scheduledAt: t.scheduledAt,
    joinLink: `${JOIN_BASE}/${t.code}`,
    groupCode: reg.groupCode,
    instructions: [
      `Buổi tham quan dự kiến bắt đầu lúc ${when}. Giờ trên web luôn là giờ mới nhất.`,
      'Chia sẻ đường dẫn và mã đoàn cho học sinh trong danh sách đã duyệt.',
      'Mỗi học sinh nhập mã đoàn, họ tên và lớp đúng như trong danh sách đã gửi.',
      'Nhắc học sinh vào trước 10 phút để kiểm tra âm thanh và kết nối.',
    ],
  }
}

export function sendInvitation(id: string, actor: string) {
  const { t, reg } = findRegistration(id)
  const verdict = registrationActions(t, reg).sendInvitation
  if (!verdict.allowed) throw notAllowed(verdict.reason ?? 'Không gửi được thông tin tham gia.')
  if (reg.id === 'reg-09' && !world.sim.fired.has('mailfail:reg-09')) {
    world.sim.fired.add('mailfail:reg-09')
    reg.invitationFailed = true
    world.logEvent(t, 'InvitationFailed', `Dịch vụ email từ chối lần gửi tới đại diện ${reg.schoolName}. Đăng ký vẫn Đã duyệt.`, actor)
    changed(t)
    throw new AdminRejection(502, { code: 'EmailFailed', message: 'Không thể gửi email.' })
  }
  reg.invitationSentAt = iso(now())
  reg.invitationFailed = false
  world.logEvent(t, 'InvitationSent', `Gửi thông tin tham gia tới đại diện ${reg.schoolName}.`, actor)
  changed(t)
  return registrationView(t, reg)
}
