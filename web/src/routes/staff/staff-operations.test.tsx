import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../components/ui/toast-store'
import type { TourActionAvailability, TourDetails, TourStartChecks } from '../../features/administration/tours/types'
import { useAuthStore } from '../../stores/auth-store'
import { useTourOriginStore } from '../../features/staff/operations/tour-origin'
import LiveOperationsPage from './LiveOperationsPage'
import StartCheckPage from './StartCheckPage'
import { TodayTours, UpcomingTours } from '../../features/staff/operations/DayTours'
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
  useTourOriginStore.setState({ origin: null })
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
    // Both causes are system gates: they sit in their own box, apart from anything the operator can clear.
    expect(screen.getByText(/Còn 2 giới hạn hệ thống chưa mở/)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Giới hạn hệ thống' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Robot' })).not.toBeInTheDocument()
    expect(screen.getByText(/1 kiểm tra chưa chạy vì phụ thuộc các mục trên: Robot báo đúng bản đồ của tuyến/)).toBeInTheDocument()
    expect(screen.getByText(/Hệ thống chưa cho phép robot di chuyển theo Tour/)).toBeInTheDocument()
    // A check skipped behind a failed prerequisite is not reported as a failure of its own.
    expect(screen.getByText('Robot báo đúng bản đồ của tuyến').closest('li')).toHaveAttribute('data-verdict', 'notRun')
    expect(screen.getByText('Pin robot (chỉ hiển thị, không chặn)').closest('li')).toHaveAttribute('data-verdict', 'info')
    tickAll()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Bắt đầu Tour/ })).toBeDisabled()
    // The server's part and the operator's part are separate steps: ticking all four does not open Start.
    expect(within(screen.getByRole('group', { name: 'Bước 1: Máy chủ cho phép' })).getByText('Còn 2 mục chặn')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Bước 2: Xác nhận tại chỗ' })).getByText('4/4')).toBeInTheDocument()
    expect(screen.getByText('Bước 2 đã xong. Nút còn khóa vì bước 1: máy chủ chưa cho phép.')).toBeInTheDocument()
  })

  it('shows the viewers still missing for an early Start as a warning that does not lock Start (ADR-0057)', async () => {
    tour = detail('READY'); tour.tour.scheduledStartAt = new Date(Date.now() + 5 * 60_000).toISOString()
    const opensAt = new Date(Date.now() - 5 * 60_000).toISOString()
    checks = { canStart: true, opensAt, blockedBy: [], checks: [
      check('withinStartWindow', true, 'Đang trong khung Start sớm.'),
      check('allViewersJoined', true, 'Mới có 1/2 điểm xem vào phòng chờ (chỉ cảnh báo, không chặn Start sớm).'),
    ] }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    const start = await screen.findByRole('button', { name: /Bắt đầu Tour/ })
    expect((await screen.findByText(/^Điểm xem đã vào phòng chờ \(chỉ cảnh báo, không chặn\)/)).closest('li')).toHaveAttribute('data-verdict', 'info')
    expect(screen.getByText(/Mới có 1\/2 điểm xem/)).toBeInTheDocument()
    tickAll()
    await waitFor(() => expect(start).toBeEnabled())
  })

  it('says when a Tour opened ahead of its day can start, and what the robot still has to report', async () => {
    tour = detail('READY'); tour.tour.scheduledStartAt = new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString()
    checks = { canStart: false, blockedBy: ['withinStartWindow', 'telemetryFresh'], checks: [
      check('withinStartWindow', false, 'Chưa tới giờ bắt đầu của Tour.'),
      { id: 'telemetryFresh', passed: false, source: 'TELEMETRY', detail: 'Robot chưa báo telemetry.' },
    ] }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    expect(await screen.findByText('Chưa tới giờ bắt đầu')).toBeInTheDocument()
    expect(screen.getByText(/còn 2 ngày 1 giờ\)\. Ngoài giờ, còn 1 việc cần xử lý/)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Tour và người vận hành' })).getByText(/tự đạt khi tới giờ/)).toBeInTheDocument()
    const robot = screen.getByRole('list', { name: 'Robot' })
    expect(within(robot).getByText('Robot tự báo')).toBeInTheDocument()
    expect(within(robot).getByText(/Bật robot và cầu nối telemetry/)).toBeInTheDocument()
    // Opened straight from a link, back goes to the calendar; the steps say where the Tour is.
    expect(screen.getByRole('link', { name: /Lịch Tour/ })).toHaveAttribute('href', '/staff/schedule')
    expect(within(screen.getByRole('navigation', { name: 'Các bước của Tour' })).getByText('Kiểm tra & bắt đầu').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('goes back to the list the Tour was opened from', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    useTourOriginStore.setState({ origin: '/staff?view=READY' })
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    expect(await screen.findByRole('link', { name: /Tổng quan/ })).toHaveAttribute('href', '/staff?view=READY')
    // READY: preparation is done and still opens; the console has nothing to show yet.
    const steps = screen.getByRole('navigation', { name: 'Các bước của Tour' })
    expect(within(steps).getByRole('link', { name: /Chuẩn bị & chốt/ })).toHaveAttribute('href', '/staff/manage/tours/tour-1')
    expect(within(steps).queryByRole('link', { name: /Điều hành/ })).not.toBeInTheDocument()
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

  it('keeps the checks on screen when a poll fails but locks Start until they are current again', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/tours/tour-1/start']}>
      <Routes><Route path="/staff/tours/:tourId/start" element={<StartCheckPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    await screen.findByRole('button', { name: /Bắt đầu Tour/ })
    tickAll()
    await waitFor(() => expect(screen.getByRole('button', { name: /Bắt đầu Tour/ })).toBeEnabled())
    vi.mocked(fetch).mockImplementation(async () => json({ success: false, message: 'down' }, 503))
    await act(() => client.refetchQueries())
    expect(await screen.findByText(/Không cập nhật được điều kiện từ máy chủ/)).toBeInTheDocument()
    expect(screen.getByText('Sẵn sàng bắt đầu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bắt đầu Tour/ })).toBeDisabled()
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
  const allow: TourActionAvailability = { allowed: true, reason: null, blockedBy: [] }
  const refuse = (reason: string, ...blockedBy: string[]): TourActionAvailability => ({ allowed: false, reason, blockedBy })
  type Actions = NonNullable<TourDetails['allowedActions']>
  const actions = (overrides: Partial<Actions> = {}): Actions => ({
    start: refuse('Chỉ Start được Tour READY.', 'tourReady'),
    next: refuse('Robot còn lệnh đang mở.', 'noUnresolvedCommand'),
    endEarly: allow,
    retryLeg: refuse('Chỉ thử lại được chặng đã kết thúc thật sự với FAILED hoặc bị từ chối.', 'TOUR_RETRY_NOT_ALLOWED'),
    reconcile: refuse('Chặng hiện tại không có lệnh UNKNOWN.', 'COMMAND_STATE_INVALID'),
    ...overrides,
  })
  const running = (overrides: Partial<TourDetails['execution'] & object> = {}, allowed: Partial<Actions> = {}, state: TourDetails['tour']['state'] = 'RUNNING') => detail(state, {
    startedAt: '2026-11-04T02:01:00Z',
    execution: { state, operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', currentLegId: 'leg-1', currentLegKind: 'TO_POI',
      currentRevisionStopId: 'rrs-1', lastArrivedRevisionStopId: null, dwellDeadlineAt: null,
      command: { id: 'cmd-1', kind: 'GoTo', state: 'PENDING', outcome: null, reasonCode: null }, ...overrides },
    allowedActions: actions(allowed),
  })
  const dialog = () => screen.getByRole('dialog')
  const confirm = (name: string) => fireEvent.click(within(dialog()).getByRole('button', { name }))
  const typeReason = (text: string) => fireEvent.change(within(dialog()).getByRole('textbox'), { target: { value: text } })

  it('keeps the Tour state and the robot command apart, says what is happening, and offers no forward step before the robot takes the command', async () => {
    tour = running()
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    const situation = await screen.findByRole('region', { name: 'Tình hình hiện tại' })
    expect(within(situation).getByText('Chờ robot lấy lệnh')).toBeInTheDocument()
    const state = screen.getByRole('region', { name: 'Trạng thái Tour' })
    expect(within(state).getByText('Đang diễn ra')).toBeInTheDocument()
    expect(within(state).getByText('Đang di chuyển tới POI')).toBeInTheDocument()
    const command = screen.getByRole('region', { name: 'Lệnh robot' })
    expect(within(command).getByText(/Robot chưa di chuyển vì lệnh này/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đi tiếp/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kết thúc sớm Tour/ })).toBeEnabled()
    expect(screen.getByText(/không phải nút dừng khẩn cấp/)).toBeInTheDocument()
    expect(screen.queryByText(/Chưa có trên hệ thống/)).not.toBeInTheDocument()
  })

  describe('route stops', () => {
    const stops = [
      { ...STOP, id: 'RRS-1' },
      { ...STOP, id: 'rrs-2', poiRevisionId: 'poi-rev-2', stopOrder: 2, name: 'Sảnh A' },
      { ...STOP, id: 'rrs-3', poiRevisionId: 'poi-rev-3', stopOrder: 3, name: 'Phòng Lab' },
    ]
    const withStops = (value: TourDetails, list: object[] = stops): TourDetails =>
      ({ ...value, routeRevision: { ...REVISION, stops: list } as unknown as TourDetails['routeRevision'] })
    const stopRow = async (name: RegExp) =>
      (await within(await screen.findByRole('region', { name: 'Tuyến của Tour' })).findByText(name)).closest('li') as HTMLElement

    it('marks the stop the robot is heading to and the last one reached, from the Tour state', async () => {
      tour = withStops(running({ currentRevisionStopId: 'rrs-2', lastArrivedRevisionStopId: 'rrs-1' }))
      renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
      expect(within(await stopRow(/Sảnh A/)).getByText('Robot đang tới')).toBeInTheDocument()
      expect(await stopRow(/Sảnh A/)).toHaveAttribute('aria-current', 'step')
      expect(within(await stopRow(/Thư viện/)).getByText('Đã tới')).toBeInTheDocument()
      expect(within(await stopRow(/Phòng Lab/)).queryByText(/Robot đang tới|Đã tới|Đang dừng/)).not.toBeInTheDocument()
      expect(screen.getByText(/theo trạng thái Tour trên máy chủ, không phải vị trí robot tự báo/)).toBeInTheDocument()
    })

    it('says the robot is stopped at the stop it is observing', async () => {
      tour = withStops(running({ currentStep: 'OBSERVING', currentRevisionStopId: 'rrs-2', lastArrivedRevisionStopId: 'rrs-2', command: null }))
      renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
      const row = await stopRow(/Sảnh A/)
      expect(within(row).getByText('Đang dừng tại đây')).toBeInTheDocument()
      expect(within(row).queryByText('Đã tới')).not.toBeInTheDocument()
    })

    it('marks nothing on an ended Tour or for an older server without stop ids', async () => {
      tour = withStops(running({ currentRevisionStopId: 'rrs-2', lastArrivedRevisionStopId: 'rrs-1' }, {}, 'COMPLETED'))
      const { unmount } = renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
      await stopRow(/Sảnh A/)
      expect(within(screen.getByRole('region', { name: 'Tuyến của Tour' })).queryAllByText(/Robot đang tới|Đã tới|Đang dừng tại đây/)).toHaveLength(0)
      unmount()

      tour = withStops(running({ currentRevisionStopId: 'rrs-2', lastArrivedRevisionStopId: 'rrs-1' }), stops.map(stop => ({ ...stop, id: undefined })))
      renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
      await stopRow(/Sảnh A/)
      expect(within(screen.getByRole('region', { name: 'Tuyến của Tour' })).queryAllByText(/Robot đang tới|Đã tới|Đang dừng tại đây/)).toHaveLength(0)
      expect(screen.queryByText(/không phải vị trí robot tự báo/)).not.toBeInTheDocument()
    })
  })

  it('sends Next with the row version once the server allows it at a stop', async () => {
    tour = running({ currentStep: 'OBSERVING', dwellDeadlineAt: '2026-11-04T02:10:00Z', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } }, { next: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Đang dừng tại điểm tham quan')).toBeInTheDocument()
    expect(screen.getByText(/Tour không tự đi tiếp/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Đi tiếp/ }))
    confirm('Đi tiếp')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].path).toBe('/api/staff/manage/tours/tour-1/next')
    expect(writes[0].body).toMatchObject({ expectedRowVersion: 'AAAAAAAAB9E=' })
  })

  it('offers Retry after a rejected leg, with the robot reason, and sends it with the row version', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandRejected', command: { id: 'cmd-1', kind: 'GoTo', state: 'REJECTED', outcome: null, reasonCode: 'MAP_MISMATCH' } }, { retryLeg: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Cần hỗ trợ: Robot từ chối lệnh')).toBeInTheDocument()
    expect(screen.getByText('Lý do: Robot đang dùng bản đồ khác bản đồ của lệnh')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đối soát lệnh/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Thử lại chặng/ }))
    confirm('Thử lại')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/retry-leg', body: { expectedRowVersion: 'AAAAAAAAB9E=' } })
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe('Đã tạo lệnh mới cho chặng'))
  })

  it('keeps Retry disabled with the failing movement check named', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'NavigationFailed', command: { id: 'cmd-1', kind: 'GoTo', state: 'FAILED', outcome: 'FAILED', reasonCode: null } },
      { retryLeg: refuse('Chưa đủ điều kiện để robot di chuyển.', 'telemetryFresh') })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByRole('button', { name: /Thử lại chặng/ })).toBeDisabled()
    expect(screen.getByText(/Chưa thực hiện được: Chưa đủ điều kiện để robot di chuyển\. · Telemetry robot còn mới/)).toBeInTheDocument()
  })

  it('offers Retry after a leg the robot never took, when the server allows it', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandExpired', command: { id: 'cmd-1', kind: 'GoTo', state: 'EXPIRED', outcome: null, reasonCode: 'EXPIRED' } }, { retryLeg: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Cần hỗ trợ: Robot không lấy lệnh kịp')).toBeInTheDocument()
    expect(screen.getByText(/robot chưa nhận lệnh này\. Xử lý nguyên nhân tại chỗ/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Thử lại chặng/ }))
    confirm('Thử lại')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/retry-leg', body: { expectedRowVersion: 'AAAAAAAAB9E=' } })
  })

  it('says only End Early remains when the server rules out retrying an expired leg', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'RobotDisconnected', command: { id: 'cmd-1', kind: 'GoTo', state: 'EXPIRED', outcome: null, reasonCode: 'EXPIRED' } })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText(/robot chưa nhận lệnh này\. Máy chủ không cho thử lại/)).toBeInTheDocument()
    expect(screen.getByText(/Dùng mục Kết thúc sớm/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Thử lại chặng|Đối soát lệnh|Đi tiếp/ })).not.toBeInTheDocument()
  })

  it('reconciles an UNKNOWN command only with what was seen on site, reusing the request id for the same reason', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandUnknown', command: { id: 'cmd-1', kind: 'GoTo', state: 'UNKNOWN', outcome: null, reasonCode: 'LEG_RESULT_TIMEOUT' } }, { reconcile: allow })
    writeReply = { status: 500, body: { success: false, message: 'Server error' } }
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Chưa rõ robot đã làm gì với lệnh')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Đối soát lệnh/ }))
    expect(within(dialog()).getByRole('button', { name: 'Đối soát' })).toBeDisabled()
    typeReason('Robot đứng yên cạnh phòng 601')
    confirm('Đối soát')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].path).toBe('/api/staff/manage/tours/tour-1/commands/cmd-1/reconcile')
    expect(writes[0].body).toMatchObject({ reason: 'Robot đứng yên cạnh phòng 601' })
    expect(writes[0].body).not.toHaveProperty('expectedRowVersion')
    // A failed or lost answer is retried as the same request, so the server replays instead of acting twice.
    await within(dialog()).findByRole('alert')
    confirm('Đối soát')
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1].body.requestId).toBe(writes[0].body.requestId)
    typeReason('Robot đứng yên ở hành lang')
    confirm('Đối soát')
    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes[2].body.requestId).not.toBe(writes[0].body.requestId)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('ends a Tour early only with a reason, says it is not an emergency stop, and claims nothing on a refusal', async () => {
    tour = running({ command: { id: 'cmd-1', kind: 'GoTo', state: 'ACCEPTED', outcome: null, reasonCode: null } })
    writeReply = { status: 409, body: { success: false, errors: { code: 'TOUR_STATE_INVALID' } } }
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Kết thúc sớm Tour/ }))
    expect(within(dialog()).getByText(/máy chủ xếp một lệnh hủy/)).toBeInTheDocument()
    expect(within(dialog()).getByText(/Đây không phải dừng khẩn cấp/)).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Kết thúc sớm' })).toBeDisabled()
    typeReason('Hành lang bị chặn')
    confirm('Kết thúc sớm')
    expect(await within(dialog()).findByText(/Tour không còn ở trạng thái cho phép thao tác này/)).toBeInTheDocument()
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/end-early', body: { reason: 'Hành lang bị chặn', expectedRowVersion: 'AAAAAAAAB9E=' } })
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('still offers Reconcile on a Tour that ended early with an UNKNOWN command, and no End Early', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandUnknown', command: { id: 'cmd-1', kind: 'GoTo', state: 'UNKNOWN', outcome: null, reasonCode: 'ACK_TIMEOUT' } },
      { reconcile: allow, endEarly: refuse('Chỉ kết thúc sớm được Tour đang chạy.', 'TOUR_STATE_INVALID') }, 'CANCELLED')
    tour.endedAt = '2026-11-04T02:20:00Z'
    tour.endReason = 'Hành lang bị chặn'
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Tour đã kết thúc, lệnh di chuyển cuối chưa rõ kết quả')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đối soát lệnh/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Kết thúc sớm Tour/ })).not.toBeInTheDocument()
    expect(screen.getByText('Hành lang bị chặn')).toBeInTheDocument()
  })

  it('gives another Staff the same picture without any control, naming who operates', async () => {
    useAuthStore.getState().setAuth('test-token', { userId: 'staff-2', username: 'minh', role: 'Staff' })
    tour = running({ currentStep: 'OBSERVING', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } },
      { next: refuse('Chỉ người vận hành được giao cho Tour mới đi tiếp được.', 'callerIsOperator') })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText(/Chỉ Lan Staff mới thao tác được/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đi tiếp|Kết thúc sớm/ })).not.toBeInTheDocument()
  })

  it('keeps the last answer on screen when a poll fails, marks it old and locks the forward step', async () => {
    tour = running({ currentStep: 'OBSERVING', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } }, { next: allow })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/live/tour-1']}>
      <Routes><Route path="/staff/live/:tourId" element={<LiveOperationsPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    expect(await screen.findByRole('button', { name: /Đi tiếp/ })).toBeEnabled()
    vi.mocked(fetch).mockImplementation(async () => json({ success: false, message: 'down' }, 503))
    await act(() => client.refetchQueries())
    expect(await screen.findByText(/Không cập nhật được từ máy chủ/)).toBeInTheDocument()
    expect(screen.getByText('Đang dừng tại điểm tham quan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đi tiếp/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Kết thúc sớm Tour/ })).toBeEnabled()
  })

  it('cannot confirm an open Next once the server withdraws it', async () => {
    tour = running({ currentStep: 'OBSERVING', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } }, { next: allow })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/live/tour-1']}>
      <Routes><Route path="/staff/live/:tourId" element={<LiveOperationsPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    fireEvent.click(await screen.findByRole('button', { name: /Đi tiếp/ }))
    tour = running({ currentStep: 'OBSERVING', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } },
      { next: refuse('Chưa đủ điều kiện để robot di chuyển.', 'operatorConsoleConnected') })
    await act(() => client.refetchQueries())
    expect(await within(dialog()).findByText(/không còn được phép: .*Console của người vận hành đang kết nối/)).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Đi tiếp' })).toBeDisabled()
    expect(writes).toHaveLength(0)
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
    expect(within(list).getAllByRole('link')).toHaveLength(1)
    expect(within(list).getByRole('link', { name: 'Xem đăng ký của Tour' })).toHaveAttribute('href', '/staff/manage/registrations?tourId=tour-1')
    expect(screen.getByRole('button', { name: /Chốt Tour/ })).toBeDisabled()
    expect(screen.queryByText(/chưa có trên hệ thống thật/)).not.toBeInTheDocument()
  })

  it('sends Staff to the registrations when nobody was accepted for the Tour', async () => {
    tour = detail('SCHEDULED', { permissions: { canEditMetadata: true, canChangeScheduleAndRoute: true, canCancel: true, canMarkReady: false, canReopen: false,
      readyBlockers: [{ code: 'NO_ACCEPTED_ROWS', message: 'Tour chưa có dòng đăng ký nào được duyệt.' }] } })
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    const list = await screen.findByRole('list', { name: 'Điều kiện chốt chưa đạt' })
    expect(within(list).getByText('Tour chưa có dòng đăng ký nào được duyệt.')).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'Xem đăng ký của Tour' })).toHaveAttribute('href', '/staff/manage/registrations?tourId=tour-1')
    expect(screen.getByRole('button', { name: /Chốt Tour/ })).toBeDisabled()
  })

  it.each(['CANCELLED', 'COMPLETED'] as const)('does not print seats for a %s Tour', async state => {
    const base = detail(state)
    tour = { ...base, tour: { ...base.tour, capacity: 20, heldSeats: 8 } }
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    await screen.findByRole('region', { name: 'Thông tin Tour' })
    expect(screen.queryByText('Chỗ')).not.toBeInTheDocument()
  })

  it('prints seats for a Tour that can still fill them', async () => {
    const base = detail('SCHEDULED')
    tour = { ...base, tour: { ...base.tour, capacity: 20, heldSeats: 8 } }
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    expect(await screen.findByText('Còn 12/20 chỗ')).toBeInTheDocument()
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
    renderAt('/staff', '/staff', <TodayTours />)
    const today = await screen.findByRole('table', { name: 'Tour hôm nay' })
    expect(within(today).getByRole('link', { name: 'Kiểm tra trước khi bắt đầu' })).toHaveAttribute('href', '/staff/tours/tour-1/start')
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
    const list = calls.find(url => url.pathname === '/api/staff/manage/tours')
    expect(list?.searchParams.get('from')).toBeTruthy()
    expect(list?.searchParams.get('to')).toBeTruthy()
  })

  it('lists the next week under today, so a Tour two days out is reachable from here', async () => {
    tour = detail('READY')
    renderAt('/staff', '/staff', <><TodayTours /><UpcomingTours /></>)
    const ahead = await screen.findByRole('region', { name: 'Tour sắp tới' })
    const table = await within(ahead).findByRole('table', { name: 'Tour sắp tới' })
    expect(within(table).getByRole('columnheader', { name: 'Ngày giờ' })).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: 'Kiểm tra trước khi bắt đầu' })).toHaveAttribute('href', '/staff/tours/tour-1/start')
    const lists = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).filter(url => url.pathname === '/api/staff/manage/tours')
    // Two windows: today, and the seven days after it.
    expect(new Set(lists.map(url => url.searchParams.get('from'))).size).toBe(2)
  })
})
