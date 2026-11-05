import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../components/ui/toast-store'
import type { TourActionAvailability, TourDetails, TourStartChecks } from '../../features/administration/tours/types'
import { useAuthStore } from '../../stores/auth-store'
import LiveOperationsPage from './LiveOperationsPage'
import StartCheckPage from './StartCheckPage'
import ToursTodayPage from './ToursTodayPage'
import StaffManageTourDetailPage from './manage/StaffManageTourDetailPage'

const STOP = { poiRevisionId: 'poi-rev-1', sourcePoiVerificationRecordId: 'v-1', stopOrder: 1, dwellSeconds: 60, headSteps: [], name: 'Thư viện', x: 0, y: 0, yaw: 0, cameraPreset: 'FRONT' }
const REVISION = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 2, name: 'Tuyến tầng 6', mapKey: 'tang-6-v1', endMode: 'POSE', isSubmitted: true, verificationStatus: 'PASS', stops: [STOP] }

function detail(state: TourDetails['tour']['state'], overrides: Partial<TourDetails> = {}): TourDetails {
  return {
    tour: { id: 'tour-1', name: 'Tour sáng thứ Hai', description: null, routeId: 'route-1', routeName: 'Tuyến tầng 6', activeRouteId: 'route-1',
      scheduledStartAt: '2026-11-04T02:00:00Z', state, createdByUserId: 'u', createdAt: '2026-10-01T00:00:00Z', updatedAt: null,
      rowVersion: 'AAAAAAAAB9E=', registrationCount: 2, invitationCount: 5, routeRevisionId: 'rev-1' },
    route: null, activeRoute: null, routeRevision: REVISION as unknown as TourDetails['routeRevision'],
    operator: { userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' },
    reservation: { robotCode: 'amr_01', startsAt: '2026-11-04T01:45:00Z', endsAt: '2026-11-04T02:40:00Z', measuredDurationSeconds: 600, expectedDurationSeconds: 900, releasedAt: null },
    fallbackVideoUrl: null, startedAt: null, endedAt: null, endReason: null,
    usage: { hasRegistrations: true, hasAllowedBranches: false, hasOperationalHistory: false, hasRobotOwnership: false },
    permissions: { canEditMetadata: false, canChangeScheduleAndRoute: false, canCancel: true, canMarkReady: false, canReopen: state === 'READY', readyBlockers: [] },
    execution: { state, operationalStatus: null, assistanceReason: null, currentStep: null, currentLegId: null, currentLegKind: null,
      currentRevisionStopId: null, lastArrivedRevisionStopId: null, dwellDeadlineAt: null, command: null },
    allowedActions: { start: { allowed: false, reason: 'Chưa đạt điều kiện Start.', blockedBy: ['commandTransportEnabled'] }, next: { allowed: false, reason: 'Chỉ đi tiếp khi Tour đang chạy bình thường và đang quan sát tại POI.', blockedBy: ['TOUR_STATE_INVALID'] } },
    ...overrides,
  }
}

const check = (id: string, passed: boolean, detailText: string) => ({ id, passed, source: 'DB', detail: detailText })
const BLOCKED_CHECKS: TourStartChecks = {
  canStart: false,
  blockedBy: ['robotDispatchEnabled', 'commandTransportEnabled'],
  checks: [
    check('tourReady', true, 'Tour đang READY.'),
    check('callerIsOperator', true, 'Bạn là người vận hành của Tour.'),
    check('robotDispatchEnabled', false, 'Robot chưa được bật điều phối (IsDispatchEnabled = 0).'),
    check('mapContextMatches', false, 'Chưa kiểm tra vì telemetryFresh chưa đạt.'),
    check('commandTransportEnabled', false, 'FleetCommands:Enabled = false nên backend không tạo lệnh cho robot.'),
    check('batteryInfo', true, 'Robot chưa báo pin (chỉ hiển thị, không chặn Start).'),
  ],
}
const OPEN_CHECKS: TourStartChecks = { canStart: true, blockedBy: [], checks: [check('tourReady', true, 'Tour đang READY.')] }

type Reply = { status: number; body: unknown }
let tour: TourDetails
let checks: TourStartChecks
let writes: Array<{ path: string; body: Record<string, unknown> }>
let writeReply: Reply

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  writes = []
  writeReply = { status: 200, body: { success: true, data: { id: 'tour-1' } } }
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    if (init?.method === 'POST') {
      writes.push({ path: url.pathname, body: JSON.parse(String(init.body)) })
      return json(writeReply.body, writeReply.status)
    }
    if (url.pathname.endsWith('/start-checks')) return json({ success: true, data: checks })
    if (url.pathname === '/api/staff/manage/tours/tour-1') return json({ success: true, data: tour })
    if (url.pathname === '/api/staff/manage/tours') return json({ success: true, data: [tour.tour], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } })
    return json({ success: true, data: [] })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().logout()
  useToastStore.setState({ toasts: [] })
})

function renderAt(path: string, route: string, element: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /><Route path="*" element={<p>Đã chuyển trang</p>} /></Routes></MemoryRouter>
  </QueryClientProvider>)
}
const tickAll = () => { for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box) }

describe('pre-start check on the real Tour API', () => {
  it('leads with the verdict and only the root causes, says the system may not move a robot yet, and keeps Start disabled', async () => {
    tour = detail('READY'); checks = BLOCKED_CHECKS
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    expect(await screen.findByText('Chưa thể bắt đầu')).toBeInTheDocument()
    const causes = screen.getByRole('list', { name: 'Nguyên nhân chưa bắt đầu được' })
    expect(within(causes).getAllByRole('listitem')).toHaveLength(2)
    expect(within(causes).getAllByText('Giới hạn hệ thống')).toHaveLength(2)
    expect(screen.getByText(/1 kiểm tra chưa chạy vì phụ thuộc các mục trên: Robot báo đúng bản đồ của tuyến/)).toBeInTheDocument()
    expect(screen.getByText(/Hệ thống chưa cho phép robot di chuyển theo Tour/)).toBeInTheDocument()
    // A check skipped behind a failed prerequisite is not reported as a failure of its own.
    expect(screen.getByText('Robot báo đúng bản đồ của tuyến').closest('li')).toHaveAttribute('data-verdict', 'notRun')
    expect(screen.getByText('Pin robot (chỉ hiển thị, không chặn)').closest('li')).toHaveAttribute('data-verdict', 'info')
    tickAll()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Bắt đầu Tour/ })).toBeDisabled()
    expect(screen.getByText('Nút mở khi mọi nguyên nhân bên trái được xử lý.')).toBeInTheDocument()
  })

  it('names the assigned operator when another Staff opens the check', async () => {
    tour = detail('READY'); checks = { ...BLOCKED_CHECKS, blockedBy: ['callerIsOperator', ...BLOCKED_CHECKS.blockedBy] }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    expect(await screen.findByText('Chỉ Lan Staff mới bắt đầu được Tour này.')).toBeInTheDocument()
    // The on-site confirmations are the Operator's; nobody else is asked to tick them.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('sends all four confirmations with the row version, and shows a refusal without claiming success', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    writeReply = { status: 409, body: { success: false, message: 'Start refused.', errors: { code: 'COMMAND_TRANSPORT_DISABLED', checks: BLOCKED_CHECKS.checks, blockedBy: ['commandTransportEnabled'] } } }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    const start = await screen.findByRole('button', { name: /Bắt đầu Tour/ })
    expect(start).toBeDisabled()
    tickAll()
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bắt đầu' }))
    expect(await screen.findByText(/Máy chủ đang tắt kênh lệnh robot/)).toBeInTheDocument()
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe('/api/staff/manage/tours/tour-1/start')
    expect(writes[0].body).toMatchObject({ expectedRowVersion: 'AAAAAAAAB9E=', confirmation: { robotPlaced: true, areaClear: true, attendantPresent: true, previewChecked: true } })
    expect(typeof writes[0].body.requestId).toBe('string')
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(screen.queryByText('Đã chuyển trang')).not.toBeInTheDocument()
  })

  it('opens the console after the server confirms Start', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    await screen.findByRole('button', { name: /Bắt đầu Tour/ })
    tickAll()
    await waitFor(() => expect(screen.getByRole('button', { name: /Bắt đầu Tour/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu Tour/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bắt đầu' }))
    expect(await screen.findByText('Đã chuyển trang')).toBeInTheDocument()
  })
})

describe('live console on the real Tour API', () => {
  const running = (overrides: Partial<TourDetails['execution'] & object> = {}, next: TourActionAvailability = { allowed: false, reason: 'Robot còn lệnh đang mở.', blockedBy: ['noUnresolvedCommand'] }) => detail('RUNNING', {
    startedAt: '2026-11-04T02:01:00Z',
    execution: { state: 'RUNNING', operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', currentLegId: 'leg-1', currentLegKind: 'TO_POI',
      currentRevisionStopId: 'rrs-1', lastArrivedRevisionStopId: null, dwellDeadlineAt: null,
      command: { id: 'cmd-1', kind: 'GoTo', state: 'PENDING', outcome: null, reasonCode: null }, ...overrides },
    allowedActions: { start: { allowed: false, reason: 'Chỉ Start được Tour READY.', blockedBy: ['tourReady'] }, next },
  })

  it('shows the Tour state and the robot command as separate states, with Next held by the server', async () => {
    tour = running()
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    const state = await screen.findByRole('region', { name: 'Trạng thái Tour' })
    expect(within(state).getByText('Đang diễn ra')).toBeInTheDocument()
    expect(within(state).getByText('Đang di chuyển tới POI')).toBeInTheDocument()
    const command = screen.getByRole('region', { name: 'Lệnh robot' })
    expect(within(command).getByText('Chờ robot lấy lệnh')).toBeInTheDocument()
    expect(within(command).getByText(/Robot chưa di chuyển vì lệnh này/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đi tiếp/ })).toBeDisabled()
    expect(screen.getByText(/Chưa đi tiếp được: Robot còn lệnh đang mở/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kết thúc sớm/ })).toBeDisabled()
    expect(screen.getByText(/không phải nút dừng khẩn cấp/)).toBeInTheDocument()
  })

  it('explains a Tour that needs assistance and the robot reason, without offering a fake recovery', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandRejected', command: { id: 'cmd-1', kind: 'GoTo', state: 'REJECTED', outcome: null, reasonCode: 'MAP_MISMATCH' } })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Cần hỗ trợ: Robot từ chối lệnh')).toBeInTheDocument()
    expect(screen.getByText('Lý do: Robot đang dùng bản đồ khác bản đồ của lệnh')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thử lại chặng/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Đối soát lệnh/ })).toBeDisabled()
  })

  it('sends Next with the row version once the server allows it', async () => {
    tour = running({ currentStep: 'OBSERVING', dwellDeadlineAt: '2026-11-04T02:10:00Z', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } }, { allowed: true, reason: null, blockedBy: [] })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText(/Tour không tự đi tiếp/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Đi tiếp/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đi tiếp' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].path).toBe('/api/staff/manage/tours/tour-1/next')
    expect(writes[0].body).toMatchObject({ expectedRowVersion: 'AAAAAAAAB9E=' })
  })
})

describe('READY and Reopen on Tour preparation', () => {
  it('lists every READY blocker in the server words and keeps Chốt disabled', async () => {
    tour = detail('SCHEDULED', { permissions: { canEditMetadata: true, canChangeScheduleAndRoute: true, canCancel: true, canMarkReady: false, canReopen: false,
      readyBlockers: [{ code: 'PENDING_DECISIONS', message: 'Còn dòng đăng ký đang chờ Staff duyệt.' }, { code: 'START_TIME_PASSED', message: 'Đã qua giờ bắt đầu.' }] } })
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    const list = await screen.findByRole('list', { name: 'Điều kiện chốt chưa đạt' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('Còn dòng đăng ký đang chờ Staff duyệt.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chốt Tour/ })).toBeDisabled()
    expect(screen.queryByText(/chưa có trên hệ thống thật/)).not.toBeInTheDocument()
  })

  it('marks a Tour READY with its row version and shows a refusal with its blockers', async () => {
    tour = detail('SCHEDULED', { permissions: { canEditMetadata: true, canChangeScheduleAndRoute: true, canCancel: true, canMarkReady: true, canReopen: false, readyBlockers: [] } })
    writeReply = { status: 409, body: { errors: { code: 'READY_PRECONDITION_FAILED', blockers: [{ code: 'RESERVATION_MISSING', message: 'Tour chưa giữ robot.' }] } } }
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Chốt Tour/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Chốt Tour' }))
    expect(await screen.findByText(/Tour chưa đủ điều kiện chốt.*Tour chưa giữ robot\./)).toBeInTheDocument()
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/ready', body: { expectedRowVersion: 'AAAAAAAAB9E=' } })
  })

  it('reopens a READY Tour only with a reason, and links to the pre-start check', async () => {
    tour = detail('READY')
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    expect(await screen.findByRole('link', { name: /Kiểm tra trước khi bắt đầu/ })).toHaveAttribute('href', '/staff/tours/tour-1/start')
    fireEvent.click(screen.getByRole('button', { name: /Mở lại/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Cần thêm một đoàn' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mở lại' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/reopen', body: { reason: 'Cần thêm một đoàn', expectedRowVersion: 'AAAAAAAAB9E=' } })
  })
})

describe('today list', () => {
  it('reads today from the Tour API and offers the next step by state', async () => {
    tour = detail('READY')
    renderAt('/staff/tours', '/staff/tours', <ToursTodayPage />)
    expect(await screen.findByRole('link', { name: 'Kiểm tra trước khi bắt đầu' })).toHaveAttribute('href', '/staff/tours/tour-1/start')
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
    const list = calls.find(url => url.pathname === '/api/staff/manage/tours')
    expect(list?.searchParams.get('from')).toBeTruthy()
    expect(list?.searchParams.get('to')).toBeTruthy()
  })
})
