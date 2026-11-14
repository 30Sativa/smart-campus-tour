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

describe('opening a Tour on the real Tour API', () => {
  it('leads with the verdict and only the root causes, says the system may not move a robot yet, and keeps Mở Tour disabled', async () => {
    tour = detail('READY'); checks = BLOCKED_CHECKS
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    expect(await screen.findByText('Chưa mở được Tour')).toBeInTheDocument()
    // Both causes are system gates: they sit in their own box, apart from anything the operator can clear.
    expect(screen.getByText(/Còn 2 giới hạn hệ thống chưa mở/)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Giới hạn hệ thống' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('list', { name: 'Robot' })).not.toBeInTheDocument()
    expect(screen.getByText(/1 kiểm tra chưa chạy vì phụ thuộc các mục trên: Robot báo đúng bản đồ của tuyến/)).toBeInTheDocument()
    expect(screen.getByText(/Hệ thống chưa cho phép robot di chuyển theo Tour/)).toBeInTheDocument()
    // A check skipped behind a failed prerequisite is not reported as a failure of its own.
    expect(screen.getByText('Robot báo đúng bản đồ của tuyến').closest('li')).toHaveAttribute('data-verdict', 'notRun')
    expect(screen.getByText('Pin robot (chỉ hiển thị, không chặn)').closest('li')).toHaveAttribute('data-verdict', 'info')
    // Opening moves nothing, so it asks no on-site confirmation: those come with Khởi hành.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /Mở Tour/ })).toBeDisabled()
    expect(screen.getByText('Xử lý các mục ở phần Cần xử lý trước.')).toBeInTheDocument()
  })

  it('asks the server for the checks of opening, without the first leg', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    await screen.findByText('Mở được Tour')
    const asked = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).find(url => url.pathname.endsWith('/start-checks'))
    expect(asked?.searchParams.get('holdAtStart')).toBe('true')
    expect(screen.getByText(/Robot chưa di chuyển khi mở Tour/)).toBeInTheDocument()
  })

  it('shows the viewers still missing for an early Start as a warning that does not lock Mở Tour (ADR-0057)', async () => {
    tour = detail('READY'); tour.tour.scheduledStartAt = new Date(Date.now() + 5 * 60_000).toISOString()
    const opensAt = new Date(Date.now() - 5 * 60_000).toISOString()
    checks = { canStart: true, opensAt, blockedBy: [], checks: [
      check('withinStartWindow', true, 'Đang trong khung Start sớm.'),
      check('allViewersJoined', true, 'Mới có 1/2 điểm xem vào phòng chờ (chỉ cảnh báo, không chặn Start sớm).'),
    ] }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    const open = await screen.findByRole('button', { name: /Mở Tour/ })
    expect((await screen.findByText(/^Điểm xem đã vào phòng chờ \(chỉ cảnh báo, không chặn\)/)).closest('li')).toHaveAttribute('data-verdict', 'info')
    expect(screen.getByText(/Mới có 1\/2 điểm xem/)).toBeInTheDocument()
    await waitFor(() => expect(open).toBeEnabled())
  })

  it('says when a Tour opened ahead of its day can open, and what the robot still has to report', async () => {
    tour = detail('READY'); tour.tour.scheduledStartAt = new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString()
    checks = { canStart: false, blockedBy: ['withinStartWindow', 'telemetryFresh'], checks: [
      check('withinStartWindow', false, 'Chưa tới giờ bắt đầu của Tour.'),
      { id: 'telemetryFresh', passed: false, source: 'TELEMETRY', detail: 'Robot chưa báo telemetry.' },
    ] }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    expect(await screen.findByText('Chưa tới giờ mở Tour')).toBeInTheDocument()
    expect(screen.getByText(/còn 2 ngày 1 giờ\)\. Ngoài giờ, còn 1 việc cần xử lý/)).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Tour và người vận hành' })).getByText(/tự đạt khi tới giờ/)).toBeInTheDocument()
    const robot = screen.getByRole('list', { name: 'Robot' })
    expect(within(robot).getByText('Robot tự báo')).toBeInTheDocument()
    expect(within(robot).getByText(/Bật robot và kiểm tra mạng của robot/)).toBeInTheDocument()
    // Opened straight from a link, back goes to the calendar; the steps say where the Tour is.
    expect(screen.getByRole('link', { name: /Lịch Tour/ })).toHaveAttribute('href', '/staff/schedule')
    expect(within(screen.getByRole('navigation', { name: 'Các bước của Tour' })).getByText('Mở Tour').closest('li')).toHaveAttribute('aria-current', 'step')
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

  it('names the assigned operator when another Staff opens the page', async () => {
    tour = detail('READY'); checks = { ...BLOCKED_CHECKS, blockedBy: ['callerIsOperator', ...BLOCKED_CHECKS.blockedBy] }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    expect(await screen.findByText('Chỉ Lan Staff mới mở được Tour này.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mở Tour/ })).toBeDisabled()
  })

  it('opens without the first leg and with the row version in one press, and shows a refusal without claiming success', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    writeReply = { status: 409, body: { success: false, message: 'Start refused.', errors: { code: 'COMMAND_TRANSPORT_DISABLED', checks: BLOCKED_CHECKS.checks, blockedBy: ['commandTransportEnabled'] } } }
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    const open = await screen.findByRole('button', { name: /Mở Tour/ })
    await waitFor(() => expect(open).toBeEnabled())
    fireEvent.click(open)
    // No dialog: opening moves nothing, the departure is the confirmed step.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText(/Máy chủ đang tắt kênh lệnh robot/)).toBeInTheDocument()
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe('/api/staff/manage/tours/tour-1/start')
    expect(writes[0].body).toMatchObject({ expectedRowVersion: 'AAAAAAAAB9E=', holdAtStart: true, confirmation: null })
    expect(typeof writes[0].body.requestId).toBe('string')
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(screen.queryByText('Đã chuyển trang')).not.toBeInTheDocument()
  })

  it('keeps the checks on screen when a poll fails but locks Mở Tour until they are current again', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/tours/tour-1/start']}>
      <Routes><Route path="/staff/tours/:tourId/start" element={<StartCheckPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: /Mở Tour/ })).toBeEnabled())
    vi.mocked(fetch).mockImplementation(async () => json({ success: false, message: 'down' }, 503))
    await act(() => client.refetchQueries())
    expect(await screen.findByText(/Không cập nhật được điều kiện từ máy chủ/)).toBeInTheDocument()
    expect(screen.getByText('Mở được Tour')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mở Tour/ })).toBeDisabled()
  })

  it('opens the console after the server confirms the opening', async () => {
    tour = detail('READY'); checks = OPEN_CHECKS
    renderAt('/staff/tours/tour-1/start', '/staff/tours/:tourId/start', <StartCheckPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Mở Tour/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Mở Tour/ }))
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
    expect(within(situation).getByText('Đang gửi lệnh cho robot')).toBeInTheDocument()
    expect(within(situation).getByText(/Robot chưa lấy lệnh nên chưa di chuyển/)).toBeInTheDocument()
    // The Tour's execution and the leg's command are for debugging, folded under "Chi tiết kỹ thuật".
    fireEvent.click(screen.getByText('Chi tiết kỹ thuật'))
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
    expect(screen.getByText(/robot không tự rời điểm dừng/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Đi tới/ }))
    confirm('Đi tiếp')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].path).toBe('/api/staff/manage/tours/tour-1/next')
    expect(writes[0].body).toMatchObject({ expectedRowVersion: 'AAAAAAAAB9E=' })
  })

  it('offers Retry after a rejected leg, with the robot reason, and sends it with the row version', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandRejected', command: { id: 'cmd-1', kind: 'GoTo', state: 'REJECTED', outcome: null, reasonCode: 'MAP_MISMATCH' } }, { retryLeg: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Robot đã dừng: Robot từ chối lệnh')).toBeInTheDocument()
    // The robot's own reason leads, not the Tour's generic assistance hint.
    expect(screen.getByText(/^Robot đang dùng bản đồ khác bản đồ của lệnh\. Xử lý tại chỗ/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đối soát lệnh/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cho robot đi lại/ }))
    confirm('Đi lại')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/retry-leg', body: { expectedRowVersion: 'AAAAAAAAB9E=' } })
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe('Đã cho robot đi lại'))
  })

  it('keeps Retry disabled with the failing movement check named', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'NavigationFailed', command: { id: 'cmd-1', kind: 'GoTo', state: 'FAILED', outcome: 'FAILED', reasonCode: null } },
      { retryLeg: refuse('Chưa đủ điều kiện để robot di chuyển.', 'telemetryFresh') })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByRole('button', { name: /Cho robot đi lại/ })).toBeDisabled()
    expect(screen.getByText(/Chưa thực hiện được: Chưa đủ điều kiện để robot di chuyển\. · Robot vừa báo trạng thái/)).toBeInTheDocument()
  })

  it('offers Retry after a leg the robot never took, when the server allows it', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'CommandExpired', command: { id: 'cmd-1', kind: 'GoTo', state: 'EXPIRED', outcome: null, reasonCode: 'EXPIRED' } }, { retryLeg: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Robot đã dừng: Robot không lấy lệnh kịp')).toBeInTheDocument()
    expect(screen.getByText(/robot chưa nhận lệnh này\. Xử lý tại chỗ/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cho robot đi lại/ }))
    confirm('Đi lại')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/retry-leg', body: { expectedRowVersion: 'AAAAAAAAB9E=' } })
  })

  it('says only End Early remains when the server rules out retrying an expired leg', async () => {
    tour = running({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'RobotDisconnected', command: { id: 'cmd-1', kind: 'GoTo', state: 'EXPIRED', outcome: null, reasonCode: 'EXPIRED' } })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText(/robot chưa nhận lệnh này\. Máy chủ không cho thử lại/)).toBeInTheDocument()
    expect(screen.getByText(/Dùng mục Kết thúc sớm/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cho robot đi lại|Đối soát lệnh|Đi tới/ })).not.toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: /Đi tới/ })).toBeEnabled()
    vi.mocked(fetch).mockImplementation(async () => json({ success: false, message: 'down' }, 503))
    await act(() => client.refetchQueries())
    expect(await screen.findByText(/Không cập nhật được từ máy chủ/)).toBeInTheDocument()
    expect(screen.getByText('Đang dừng tại điểm tham quan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đi tới/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Kết thúc sớm Tour/ })).toBeEnabled()
  })

  it('cannot confirm an open Next once the server withdraws it', async () => {
    tour = running({ currentStep: 'OBSERVING', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } }, { next: allow })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/live/tour-1']}>
      <Routes><Route path="/staff/live/:tourId" element={<LiveOperationsPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    fireEvent.click(await screen.findByRole('button', { name: /Đi tới/ }))
    tour = running({ currentStep: 'OBSERVING', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } },
      { next: refuse('Chưa đủ điều kiện để robot di chuyển.', 'operatorConsoleConnected') })
    await act(() => client.refetchQueries())
    expect(await within(dialog()).findByText(/không còn được phép: .*Trang của người vận hành đang mở/)).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Đi tiếp' })).toBeDisabled()
    expect(writes).toHaveLength(0)
  })
})

describe('demo flow on the live console', () => {
  const allow: TourActionAvailability = { allowed: true, reason: null, blockedBy: [] }
  const refuse = (reason: string, ...blockedBy: string[]): TourActionAvailability => ({ allowed: false, reason, blockedBy })
  const STOPS = [{ ...STOP, id: 'rrs-1' }, { ...STOP, id: 'rrs-2', poiRevisionId: 'poi-rev-2', stopOrder: 2, name: 'Phòng lab' }]
  const demo = (execution: Partial<NonNullable<TourDetails['execution']>>, allowed: Partial<NonNullable<TourDetails['allowedActions']>>) => detail('RUNNING', {
    startedAt: '2026-11-04T02:01:00Z',
    routeRevision: { ...REVISION, stops: STOPS } as unknown as TourDetails['routeRevision'],
    execution: { state: 'RUNNING', operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', currentLegId: 'leg-1', currentLegKind: 'TO_POI',
      currentRevisionStopId: 'rrs-1', lastArrivedRevisionStopId: null, dwellDeadlineAt: null,
      command: { id: 'cmd-1', kind: 'GoTo', state: 'ACCEPTED', outcome: null, reasonCode: null }, autoAdvance: { enabled: false, blockedReason: null }, ...execution },
    allowedActions: { start: refuse('Chỉ Start được Tour READY.', 'tourReady'), next: refuse('no', 'TOUR_STATE_INVALID'), endEarly: allow,
      retryLeg: refuse('no', 'TOUR_RETRY_NOT_ALLOWED'), reconcile: refuse('no', 'COMMAND_STATE_INVALID'), pause: refuse('no', 'TOUR_STATE_INVALID'),
      skip: refuse('no', 'TOUR_STATE_INVALID'), ...allowed },
  })
  const confirm = (name: string) => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name }))

  it('departs from the start only with the four on-site ticks, in one press and without a dialog', async () => {
    tour = demo({ currentStep: 'INITIALIZING', currentLegId: null, currentLegKind: null, currentRevisionStopId: null, command: null }, { next: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(within(await screen.findByRole('region', { name: 'Tình hình hiện tại' })).getByText('Chuẩn bị khởi hành')).toBeInTheDocument()
    const depart = screen.getByRole('button', { name: 'Khởi hành tới Thư viện' })
    expect(depart).toBeDisabled()
    for (const box of within(screen.getByRole('group', { name: 'Xác nhận tại chỗ' })).getAllByRole('checkbox')) fireEvent.click(box)
    await waitFor(() => expect(depart).toBeEnabled())
    fireEvent.click(depart)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/next',
      body: { expectedRowVersion: 'AAAAAAAAB9E=', confirmation: { robotPlaced: true, areaClear: true, attendantPresent: true, previewChecked: true } } })
  })

  it('pauses a running leg behind one confirmation, then says it waits for the robot to stop', async () => {
    tour = demo({}, { pause: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Tạm dừng/ }))
    confirm('Tạm dừng')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/pause', body: { expectedRowVersion: 'AAAAAAAAB9E=' } })

    tour = demo({ command: { id: 'cmd-1', kind: 'GoTo', state: 'ACCEPTED', outcome: null, reasonCode: null, cancelRequested: true } }, {})
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Đang dừng…')).toBeInTheDocument()
  })

  it('resumes a paused leg to the same stop, and offers to skip it', async () => {
    tour = demo({ operationalStatus: 'PAUSED', command: { id: 'cmd-1', kind: 'GoTo', state: 'CANCELLED', outcome: 'CANCELLED', reasonCode: null } }, { retryLeg: allow, skip: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText('Đã tạm dừng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bỏ qua Thư viện/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục tới Thư viện/ }))
    confirm('Tiếp tục')
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/retry-leg' })
  })

  it('skips the next stop from a POI, and turns the automatic departure on for the Operator', async () => {
    tour = demo({ currentStep: 'OBSERVING', lastArrivedRevisionStopId: 'rrs-1', command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } },
      { next: allow, skip: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByRole('button', { name: /Đi tới Phòng lab/ })).toBeEnabled()
    const auto = screen.getByRole('switch', { name: /Tự đi tiếp khi hết giờ dừng/ })
    expect(auto).not.toBeChecked()
    fireEvent.click(auto)
    fireEvent.click(screen.getByRole('button', { name: /Bỏ qua Phòng lab/ }))
    confirm('Bỏ qua')
    await waitFor(() => expect(writes.some(write => write.path === '/api/staff/manage/tours/tour-1/skip')).toBe(true))
  })

  it('says why the automatic departure did not leave this stop', async () => {
    tour = demo({ currentStep: 'OBSERVING', lastArrivedRevisionStopId: 'rrs-1', autoAdvance: { enabled: true, blockedReason: 'robotLocalized' },
      command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } }, { next: allow })
    renderAt('/staff/live/tour-1', '/staff/live/:tourId', <LiveOperationsPage />)
    expect(await screen.findByText(/Lần tự đi tại điểm này không thực hiện được: Robot đã định vị/)).toBeInTheDocument()
  })
})

describe('opening from Tour preparation', () => {
  it('opens a READY Tour in place when the server allows it, and goes to the console', async () => {
    tour = detail('READY', { allowedActions: { start: { allowed: false, reason: 'no', blockedBy: ['robotLocalized'] }, next: { allowed: false, reason: 'no', blockedBy: [] },
      open: { allowed: true, reason: null, blockedBy: [] } } })
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: /^Mở Tour$/ }))
    expect(await screen.findByText('Đã chuyển trang')).toBeInTheDocument()
    expect(writes[0]).toMatchObject({ path: '/api/staff/manage/tours/tour-1/start', body: { holdAtStart: true } })
  })

  it('says why a READY Tour cannot open yet and keeps only the link to its conditions', async () => {
    tour = detail('READY', { allowedActions: { start: { allowed: false, reason: 'no', blockedBy: [] }, next: { allowed: false, reason: 'no', blockedBy: [] },
      open: { allowed: false, reason: 'Chưa đạt điều kiện Start.', blockedBy: ['robotDispatchEnabled'] } } })
    renderAt('/staff/manage/tours/tour-1', '/staff/manage/tours/:tourId', <StaffManageTourDetailPage />)
    expect(await screen.findByText(/Chưa mở được: Chưa đạt điều kiện Start\. · Robot được bật điều phối/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Mở Tour$/ })).not.toBeInTheDocument()
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
    expect(await screen.findByRole('link', { name: /Xem điều kiện mở Tour/ })).toHaveAttribute('href', '/staff/tours/tour-1/start')
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
    expect(within(today).getByRole('link', { name: 'Mở Tour' })).toHaveAttribute('href', '/staff/tours/tour-1/start')
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
    expect(within(table).getByRole('link', { name: 'Mở Tour' })).toHaveAttribute('href', '/staff/tours/tour-1/start')
    const lists = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).filter(url => url.pathname === '/api/staff/manage/tours')
    // Two windows: today, and the seven days after it.
    expect(new Set(lists.map(url => url.searchParams.get('from'))).size).toBe(2)
  })
})
