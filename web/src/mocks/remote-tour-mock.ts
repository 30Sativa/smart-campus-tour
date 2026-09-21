import type { ActionOption, PreparedRoute, Registration, RegistrationInput, RemoteRobot, RemoteTour, StudentSnapshot, TourAction, Workspace } from '../api/contracts/remote-tour'
import { useAuthStore } from '../stores/auth-store'
import { hasOperationalRole, isAdminRole, isRepresentativeRole } from '../auth/roles'
import { isPreviewAccountLocked } from './auth-mock'
import type { VisitorNotification } from '../api/contracts/visitor'

// This in-memory simulator is deliberately separate from UI state. It sends no
// email, robot commands or media, and nothing (including imported rosters) is persisted.
export class RemotePreviewError extends Error {}
const routes: PreparedRoute[] = [{ id: 'indoor', name: 'Khám phá campus trong nhà', pois: [
  { name: 'Sảnh đón tiếp', text: 'Sảnh đón tiếp là nơi bắt đầu chuyến tham quan campus.', x: 15, y: 65 },
  { name: 'Thư viện', text: 'Thư viện là không gian đọc sách và tự học dành cho sinh viên.', x: 50, y: 30 },
  { name: 'Phòng thực hành', text: 'Phòng thực hành phục vụ các buổi học và dự án của sinh viên.', x: 85, y: 65 },
] }]
let tours: RemoteTour[] = []
let registrations: Registration[] = []
let robots: RemoteRobot[] = []
let lastStepAt = Date.now()
let visit = 0
const readNotifications = new Set<string>()
let grant: { tourId: string; registrationId: string; name: string; className: string; expires: number } | null = null
const fail = (message: string): never => { throw new RemotePreviewError(message) }
const copy = <T,>(value: T): T => structuredClone(value)
const actor = () => { const user = useAuthStore.getState().user; return user && !isPreviewAccountLocked(user.userId) ? user : null }
const requireAdmin = () => { if (!isAdminRole(actor()?.role)) fail('Bạn không có quyền quản trị.') }
const requireStaff = () => { if (!hasOperationalRole(actor()?.role)) fail('Thao tác này cần quyền Staff.') }
const requireRepresentative = () => { if (!isRepresentativeRole(actor()?.role)) fail('Thao tác này cần tài khoản đại diện.') }
const tourById = (id: string) => tours.find(t => t.id === id) ?? fail('Không tìm thấy buổi tham quan.')
const registrationById = (id: string) => registrations.find(r => r.id === id) ?? fail('Không tìm thấy đăng ký.')
const checkRevision = (actual: number, expected: number) => { if (actual !== expected) fail('Dữ liệu đã thay đổi. Đã tải lại thông tin; hãy kiểm tra rồi thử lại.') }
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
const classKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const matches = (r: Registration, name: string, className: string) => r.roster.some(row => nameKey(row.name) === nameKey(name) && (!row.className.trim() || classKey(row.className) === classKey(className)))
const terminal = (t: RemoteTour) => t.state === 'COMPLETED' || t.state === 'CANCELLED'
function record(t: RemoteTour, message: string) { t.revision++; t.log.unshift(`${new Date().toLocaleTimeString('vi-VN')} · ${message}`) }
function complete(t: RemoteTour) {
  t.state = 'COMPLETED'
  robots[0].assignedTourId = null
  robots[0].needsInspection = false
  record(t, 'Mô phỏng: về điểm cuối, xác nhận dừng và giải phóng robot.')
}
// Polling advances only synthetic results. Production must consume server events.
function tick() {
  const t = tours.find(t => t.state === 'RUNNING')
  if (!t || t.operation !== 'NORMAL' || t.hold || Date.now() - lastStepAt < 8000) return
  lastStepAt = Date.now()
  if (t.step === 'NAVIGATING') t.step = 'PREPARING'
  else if (t.step === 'PREPARING') { t.step = 'OBSERVING'; visit++ }
  else if (t.step === 'OBSERVING') t.step = 'FRONT'
  else if (t.step === 'FRONT') {
    t.poiIndex++
    t.step = t.poiIndex < routes[0].pois.length ? 'NAVIGATING' : 'RETURNING'
  } else { complete(t); return }
  robots[0].updatedAt = new Date().toISOString()
  record(t, 'Mô phỏng: chuyển bước tự động.')
}
export function resetRemotePreview() {
  tours = ['SCHEDULED', 'READY', 'RUNNING'].map((state, i) => ({
    id: `tour-${i + 1}`, name: ['Campus cùng đoàn của bạn', 'Buổi tham quan đã chốt', 'Khám phá campus trực tuyến'][i],
    scheduledAt: new Date(Date.now() + (i - 1) * 3600000).toISOString(), description: 'Một tuyến, một góc nhìn chung cho các đoàn tham quan từ xa.', routeId: 'indoor',
    state: state as RemoteTour['state'], operation: 'NORMAL', step: 'OBSERVING', poiIndex: 0,
    hold: false, revision: 1, log: ['Dữ liệu mẫu được chuẩn bị cho bản xem trước.'],
  }))
  registrations = tours.map((t, i) => ({ id: `reg-${i + 1}`, tourId: t.id, ownerId: 'mock-user-representative', school: 'Trường Demo', contact: 'Đại diện mẫu', email: 'demo@example.test', roster: [{ name: 'Nguyễn Văn An', className: '12A1' }], state: 'APPROVED', revision: 1, code: `DEMO-${i + 1}` }))
  robots = ['Physical', 'Gazebo', 'Emulator'].map((source, i) => ({ id: `robot_${String(i + 1).padStart(2, '0')}`, source: source as RemoteRobot['source'], connected: true, localized: true, powerReady: true, front: true, streamReady: true, assignedTourId: i === 0 ? 'tour-3' : null, needsInspection: false, updatedAt: new Date().toISOString() }))
  registrations.forEach(r => { r.updatedAt = new Date().toISOString() })
  readNotifications.clear()
  grant = null; lastStepAt = Date.now(); visit = 1
}
resetRemotePreview()

function actionOptions(t: RemoteTour): ActionOption[] {
  const list: ActionOption[] = []
  const add = (action: TourAction, label: string, reason?: string) => list.push({ action, label, reason })
  if (isAdminRole(actor()?.role)) {
    if (t.state === 'SCHEDULED') {
      const groups = registrations.filter(r => r.tourId === t.id)
      add('ready', 'Chốt READY', groups.some(r => r.state === 'SUBMITTED') ? 'Còn đoàn chờ duyệt.' : !groups.some(r => r.state === 'APPROVED' && r.roster.length) ? 'Cần ít nhất một đoàn đã duyệt.' : undefined)
    }
    if (t.state === 'READY') add('reopen', 'Mở lại đăng ký')
    if (['SCHEDULED', 'READY'].includes(t.state)) add('cancel', 'Hủy buổi')
  }
  if (hasOperationalRole(actor()?.role)) {
    if (t.state === 'READY') {
      const r = robots[0]
      add('start', 'Start', r.assignedTourId || r.needsInspection ? 'Robot đang bận hoặc cần kiểm tra.' : !r.connected || !r.localized || !r.powerReady || !r.front || !r.streamReady ? 'Robot, nguồn, định vị, FRONT hoặc nguồn hình chưa sẵn sàng.' : undefined)
    }
    if (t.state === 'RUNNING') {
      const observing = t.step === 'OBSERVING'
      add('hold', 'Hold tại POI', t.operation !== 'NORMAL' ? 'Cần xử lý sự cố trước.' : !observing ? 'Chỉ giữ khi robot đã dừng, đang quan sát tại POI.' : t.hold ? 'Đang giữ tại POI. Bấm Next để đi tiếp.' : undefined)
      add('next', 'Next', t.operation !== 'NORMAL' ? 'Cần xử lý sự cố trước.' : !observing ? 'Chưa thể chuyển chặng ở bước hiện tại.' : undefined)
      if (t.operation === 'NEEDS_ASSISTANCE' && t.fault !== 'restart') {
        if (t.step === 'RETURNING' && t.returnArrived) add('complete', 'Hoàn tất sau hỗ trợ')
        else {
          const recovery = t.step === 'FRONT' ? 'retry-front' : ['NAVIGATING', 'RETURNING'].includes(t.step) ? 'retry-leg' : 'retry-poi'
          add(recovery, { 'retry-front': 'Thử lại FRONT', 'retry-leg': 'Thử lại chặng', 'retry-poi': 'Chạy lại POI' }[recovery])
        }
      }
      add('end-early', 'Kết thúc sớm')
    }
  }
  return list
}

export const remotePreviewApi = {
  async notifications(): Promise<VisitorNotification[]> {
    if (!actor()) fail('Hãy đăng nhập lại.')
    const messages = { SUBMITTED: 'Danh sách đang chờ Admin duyệt.', APPROVED: 'Đăng ký đã duyệt. Mở đăng ký để xem thông tin tham gia.', REJECTED: 'Đăng ký cần chỉnh sửa. Đại diện xem lý do trong đăng ký.', CANCELLED: 'Đăng ký đã hủy. Quyền tham gia của đoàn đã đóng.' }
    return registrations.filter(r => r.ownerId === actor()?.userId).map(r => {
      const id = `${r.id}:${r.revision}`
      return { id, kind: 'Booking', title: tourById(r.tourId).name, body: messages[r.state], createdAt: r.updatedAt!, readAt: readNotifications.has(id) ? r.updatedAt! : null, href: '/visit/bookings' }
    })
  },
  async markNotificationsRead() {
    const items = await this.notifications()
    items.forEach(item => readNotifications.add(item.id))
    return this.notifications()
  },
  async workspace(): Promise<Workspace> {
    if (!actor()) fail('Hãy đăng nhập lại.')
    tick()
    const internal = isAdminRole(actor()?.role) || hasOperationalRole(actor()?.role)
    if (!internal && !isRepresentativeRole(actor()?.role)) fail('Bạn không có quyền truy cập.')
    return copy({ tours, routes, registrations: registrations.filter(r => internal || r.ownerId === actor()?.userId), robots: internal ? robots : [], actions: Object.fromEntries(tours.map(t => [t.id, actionOptions(t)])) })
  },
  async saveTour(input: { id?: string; revision?: number; name: string; scheduledAt: string; description: string; routeId: string }) {
    requireAdmin()
    if (!input.name.trim() || !input.scheduledAt || !routes.some(r => r.id === input.routeId)) fail('Hãy nhập tên, giờ và chọn tuyến hợp lệ.')
    if (input.id) {
      const t = tourById(input.id); checkRevision(t.revision, input.revision ?? -1)
      if (t.state !== 'SCHEDULED') fail('Buổi đã khóa nội dung.')
      Object.assign(t, { name: input.name.trim(), scheduledAt: input.scheduledAt, description: input.description, routeId: input.routeId })
      record(t, 'Đã sửa thông tin buổi.')
    } else tours.push({ ...input, id: crypto.randomUUID(), state: 'SCHEDULED', operation: 'NORMAL', step: 'NAVIGATING', poiIndex: 0, hold: false, revision: 1, log: ['Đã tạo buổi.'] })
  },
  async saveRegistration(input: RegistrationInput, revision?: number) {
    requireRepresentative()
    const t = tourById(input.tourId)
    if (t.state !== 'SCHEDULED') fail('Buổi đã khóa đăng ký. Đã tải lại trạng thái.')
    if (!input.school.trim() || !input.contact.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fail('Hãy nhập thông tin đoàn và email hợp lệ.')
    if (!input.roster.length || input.roster.some(r => !r.name.trim())) fail('Danh sách cần ít nhất một học sinh và không được thiếu họ tên.')
    const old = registrations.find(r => r.tourId === t.id && r.ownerId === actor()?.userId)
    if (old) {
      checkRevision(old.revision, revision ?? -1)
      // Contact-email edits are not silently given the roster's approval rule.
      if (old.state === 'APPROVED' && old.email !== input.email) fail('Đổi email sau duyệt chưa được hỗ trợ. Liên hệ Admin.')
      Object.assign(old, copy(input), { state: 'SUBMITTED', revision: old.revision + 1, rejectionReason: undefined, invitationSentAt: undefined })
    } else registrations.push({ ...copy(input), id: crypto.randomUUID(), ownerId: actor()!.userId, code: crypto.randomUUID(), state: 'SUBMITTED', revision: 1 })
    registrations.find(r => r.tourId === t.id && r.ownerId === actor()?.userId)!.updatedAt = new Date().toISOString()
    record(t, 'Đoàn gửi danh sách chờ duyệt.')
  },
  async registrationAction(id: string, revision: number, action: 'approve' | 'reject' | 'cancel' | 'invite', reason = '') {
    const r = registrationById(id); const t = tourById(r.tourId)
    checkRevision(r.revision, revision)
    if (action === 'cancel') {
      requireRepresentative()
      if (r.ownerId !== actor()?.userId) fail('Bạn không có quyền sửa đoàn này.')
    } else requireAdmin()
    if (action === 'invite') {
      if (r.state !== 'APPROVED' || !['SCHEDULED', 'READY'].includes(t.state)) fail('Không thể gửi lời mời ở trạng thái hiện tại.')
      r.invitationSentAt = new Date().toISOString()
      record(t, 'Mô phỏng gửi lời mời; không gửi email thật.')
    } else {
      if (t.state !== 'SCHEDULED') fail('Buổi đã khóa đăng ký.')
      if (action !== 'cancel' && r.state !== 'SUBMITTED') fail('Đăng ký không còn chờ duyệt. Hãy kiểm tra lại.')
      if (r.state === 'CANCELLED') fail('Đăng ký đã hủy.')
      if (action === 'reject' && !reason.trim()) fail('Nhập lý do từ chối để đại diện biết cách sửa.')
      r.state = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'CANCELLED'
      r.rejectionReason = action === 'reject' ? reason : undefined
      if (['REJECTED', 'CANCELLED'].includes(r.state) && grant?.registrationId === r.id) grant = null
      record(t, action === 'approve' ? 'Đã duyệt đoàn.' : action === 'reject' ? 'Đã từ chối đoàn.' : 'Đại diện hủy đăng ký.')
    }
    r.revision++; r.updatedAt = new Date().toISOString()
  },
  async command(id: string, revision: number, action: TourAction, confirmed = false, reason = '') {
    tick()
    const t = tourById(id); checkRevision(t.revision, revision)
    const option = actionOptions(t).find(o => o.action === action)
    if (!option || option.reason) return fail(option?.reason ?? 'Thao tác không hợp lệ ở trạng thái hoặc quyền hiện tại.')
    if (['start', 'end-early', 'cancel', 'retry-leg', 'retry-poi', 'retry-front', 'complete'].includes(action) && !confirmed) fail('Cần xác nhận thao tác.')
    if (['cancel', 'end-early'].includes(action) && !reason.trim()) fail('Nhập lý do kết thúc/hủy buổi.')
    if (action === 'ready') t.state = 'READY'
    if (action === 'reopen') t.state = 'SCHEDULED'
    if (action === 'cancel' || action === 'end-early') {
      t.state = 'CANCELLED'; t.endReason = reason; t.hold = false
      if (action === 'end-early') robots[0].needsInspection = true
    }
    if (action === 'start') {
      if (!registrations.some(r => r.tourId === id && r.state === 'APPROVED')) fail('Không còn đoàn được duyệt.')
      t.state = 'RUNNING'; t.operation = 'NORMAL'; t.step = 'NAVIGATING'; t.poiIndex = 0; t.hold = false
      robots[0].assignedTourId = t.id; lastStepAt = Date.now()
    }
    if (action === 'hold') t.hold = true
    if (action === 'next') { t.hold = false; t.step = 'FRONT'; lastStepAt = Date.now() }
    if (action.startsWith('retry-')) {
      t.operation = 'NORMAL'; t.fault = undefined; t.hold = false; lastStepAt = Date.now()
      if (action === 'retry-poi') t.step = 'PREPARING'
    }
    if (action === 'complete') { t.operation = 'NORMAL'; t.fault = undefined; complete(t) }
    record(t, option.label)
  },
  async simulateFault(id: string, kind: 'fault' | 'restart' | 'return-stream') {
    requireStaff(); const t = tourById(id)
    if (t.state !== 'RUNNING') fail('Chỉ mô phỏng sự cố khi buổi đang chạy.')
    if (kind === 'return-stream') { t.step = 'RETURNING'; t.poiIndex = routes[0].pois.length; t.returnArrived = true }
    t.operation = 'NEEDS_ASSISTANCE'; t.fault = kind; record(t, kind === 'restart' ? 'Mô phỏng backend restart: chỉ kết thúc sớm.' : kind === 'return-stream' ? 'Mô phỏng: chặng về đã thành công, đang giữ do lỗi nguồn hình.' : 'Mô phỏng sự cố cần hỗ trợ.')
  },
  async releaseRobot(confirmed: boolean) {
    requireStaff(); const r = robots[0]
    if (!confirmed || !r.needsInspection || !r.assignedTourId || !terminal(tourById(r.assignedTourId))) fail('Cần xác nhận robot đã dừng và phiên đã kết thúc.')
    // Synthetic stop evidence only; a real backend must reconcile the controller.
    r.assignedTourId = null; r.needsInspection = false
  },
  async join(tourId: string, code: string, name: string, className: string) {
    const t = tourById(tourId)
    const r = registrations.find(r => r.tourId === t.id && r.code === code.trim() && r.state === 'APPROVED' && matches(r, name, className))
    if (terminal(t) || !r) return fail('Không thể xác nhận quyền tham gia. Vui lòng liên hệ đại diện.')
    grant = { tourId, registrationId: r.id, name, className, expires: Date.now() + 2 * 60 * 60 * 1000 }
  },
  async student(tourId: string): Promise<StudentSnapshot> {
    tick(); const t = tourById(tourId)
    const tour = { id: t.id, name: t.name, scheduledAt: t.scheduledAt, state: t.state, operation: t.operation, step: t.step, poiIndex: t.poiIndex, hold: t.hold }
    if (terminal(t)) return { access: 'ended', tour }
    if (!grant || grant.tourId !== t.id || grant.expires < Date.now()) return { access: 'join', tour }
    const r = registrationById(grant.registrationId)
    if (r.state === 'SUBMITTED') return { access: 'updating', tour }
    if (r.state !== 'APPROVED' || !matches(r, grant.name, grant.className)) {
      grant = null; return { access: 'denied', tour, message: 'Không thể xác nhận quyền tham gia. Vui lòng liên hệ đại diện.' }
    }
    if (t.state !== 'RUNNING') return { access: 'waiting', tour }
    const route = routes.find(r => r.id === t.routeId)!
    const poi = route.pois[Math.min(t.poiIndex, route.pois.length - 1)]
    return copy({ access: 'live', tour, route, visitKey: `${t.id}-${visit}-${t.step}`, pose: { x: poi.x, y: poi.y, updatedAt: robots[0].updatedAt } })
  },
  async ask(tourId: string, poiIndex: number, question: string) {
    const s = await this.student(tourId)
    if (s.access !== 'live' || !question.trim()) fail('Không thể gửi câu hỏi. Hãy kiểm tra quyền tham gia.')
    const poi = s.route?.pois[poiIndex]
    if (!poi) return fail('Không tìm thấy nội dung điểm tham quan.')
    return { text: `Câu trả lời mẫu về ${poi.name}: ${poi.text}`, poi: poi.name }
  },
}
