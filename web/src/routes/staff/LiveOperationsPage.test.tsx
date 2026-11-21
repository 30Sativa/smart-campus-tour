import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TourDetails, TourSummary } from '../../features/administration/tours/types'
import type { TourHeadStatus } from '../../features/staff/operations/live/head-control'
import { useAuthStore } from '../../stores/auth-store'
import LiveOperationsPage from './LiveOperationsPage'

const STOP = { id: 'rrs-1', poiRevisionId: 'poi-rev-1', sourcePoiVerificationRecordId: 'v-1', stopOrder: 1, dwellSeconds: 60, headSteps: [], name: 'Thư viện', x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT' }
const REVISION = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 2, name: 'Tuyến tầng 6', mapVersionId: 'map-1', mapKey: 'tang-6-v1', startX: 0, startY: 0, startYaw: 0,
  endMode: 'POSE', isSubmitted: true, verificationStatus: 'PASS', stops: [STOP] }

function summary(id: string, state: TourSummary['state'], name = 'Tour sáng thứ Hai', scheduledStartAt = '2026-11-04T02:00:00Z'): TourSummary {
  return { id, name, description: null, routeId: 'route-1', routeName: 'Tuyến tầng 6', activeRouteId: 'route-1', scheduledStartAt, state,
    createdByUserId: 'u', createdAt: '2026-10-01T00:00:00Z', updatedAt: null, rowVersion: 'AAAAAAAAB9E=', registrationCount: 2, invitationCount: 5, routeRevisionId: 'rev-1' }
}

function running(): TourDetails {
  return {
    tour: summary('tour-1', 'RUNNING'),
    route: null, activeRoute: null, routeRevision: REVISION as unknown as TourDetails['routeRevision'],
    operator: { userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' },
    reservation: { robotCode: 'amr_01', startsAt: '2026-11-04T01:45:00Z', endsAt: '2026-11-04T02:40:00Z', measuredDurationSeconds: 600, expectedDurationSeconds: 900, releasedAt: null },
    fallbackVideoUrl: null, startedAt: '2026-11-04T02:01:00Z', endedAt: null, endReason: null,
    usage: { hasRegistrations: true, hasAllowedBranches: false, hasOperationalHistory: true, hasRobotOwnership: true },
    permissions: { canEditMetadata: false, canChangeScheduleAndRoute: false, canCancel: false },
    execution: { state: 'RUNNING', operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'OBSERVING', currentLegId: 'leg-1', currentLegKind: 'TO_POI',
      currentRevisionStopId: 'rrs-1', lastArrivedRevisionStopId: 'rrs-1', dwellDeadlineAt: null,
      command: { id: 'cmd-1', kind: 'GoTo', state: 'ARRIVED', outcome: 'ARRIVED', reasonCode: null } },
    allowedActions: {
      start: { allowed: false, reason: 'Chỉ Start được Tour READY.', blockedBy: ['tourReady'] },
      next: { allowed: true, reason: null, blockedBy: [] },
      endEarly: { allowed: true, reason: null, blockedBy: [] },
    },
  }
}

const OK_HEAD: TourHeadStatus = { enabled: true, mode: 'AUTO', robotCode: 'amr_01', connected: true, lastPollAt: '2026-11-04T02:10:00Z',
  head: { state: 'IDLE', referenced: true, panDeg: 12, tiltDeg: 0, observedAt: '2026-11-04T02:10:00Z' } }

type Reply = { status: number; body: unknown }
let tour: TourDetails
let head: TourHeadStatus
let list: TourSummary[]
let headReply: Reply
let sent: Array<{ method: string; path: string; body: unknown }>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const conflict = (code: string) => ({ status: 409, body: { success: false, message: 'refused', errors: { code } } })

beforeEach(() => {
  tour = running()
  head = OK_HEAD
  list = []
  headReply = { status: 200, body: { success: true, data: { seq: 1, robotCode: 'amr_01', issuedAt: '2026-11-04T02:10:00Z' } } }
  sent = []
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    if (method !== 'GET') sent.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.pathname.endsWith('/camera-lease')) return json({ success: true, data: { robotCode: 'amr_01', wanted: true, reason: 'TOUR_RUNNING', robotListening: true, lastPollAt: null, leaseUntil: null,
      stream: { whepUrl: 'https://relay.test/quest/whep', token: 'staff-token', expiresAt: '2099-01-01T00:00:00Z' } } })
    if (url.pathname.endsWith('/head-commands')) return json(headReply.body, headReply.status)
    if (url.pathname.endsWith('/head-mode')) return json({ success: true, data: { tourId: 'tour-1', mode: 'MANUAL' } })
    if (url.pathname.endsWith('/head')) return json({ success: true, data: head })
    if (url.pathname === '/api/staff/manage/tours/tour-1') return json({ success: true, data: tour })
    if (url.pathname === '/api/staff/manage/tours') {
      const phase = url.searchParams.get('phase')
      const rows = phase === 'RUNNING' ? list.filter(row => row.state === 'RUNNING') : phase ? [] : list
      return json({ success: true, data: rows, pagination: { page: 1, pageSize: 100, totalItems: rows.length, totalPages: 1 } })
    }
    return json({ success: true, data: [] })
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.getState().logout()
})

function renderAt(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/staff/live" element={<LiveOperationsPage />} />
      <Route path="/staff/live/:tourId" element={<LiveOperationsPage />} />
      <Route path="*" element={<p>Đã chuyển trang</p>} />
    </Routes></MemoryRouter>
  </QueryClientProvider>)
}

const headPanel = () => screen.findByRole('region', { name: 'Đầu camera' })
const headCommands = () => sent.filter(item => item.path.endsWith('/head-commands'))
const headButtons = (panel: HTMLElement) => [
  ...within(panel).getAllByRole('button', { name: /Xoay đầu camera/ }),
  within(panel).getByRole('button', { name: 'Đưa đầu camera về phía trước' }),
  within(panel).getByRole('button', { name: /Quét xung quanh/ }),
]

describe('live console camera head (ADR-0045)', () => {
  it('lets the Operator turn the head with one tap per step, the front and the sweep, without any confirmation', async () => {
    renderAt('/staff/live/tour-1')
    const panel = await headPanel()
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Xoay đầu camera: Trái' })).toBeEnabled())
    expect(within(panel).getByText(/ngang trái 12°/)).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: 'Xoay đầu camera: Trái' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Xoay đầu camera: Lên' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Đưa đầu camera về phía trước' }))
    fireEvent.click(within(panel).getByRole('button', { name: /Quét xung quanh/ }))
    await waitFor(() => expect(headCommands()).toHaveLength(4))
    expect(headCommands().map(item => item.body)).toEqual([
      { kind: 'STEP', panSteps: 15, tiltSteps: 0 },
      { kind: 'STEP', panSteps: 0, tiltSteps: 15 },
      { kind: 'ANGLE', panDeg: 0, tiltDeg: 0 },
      { kind: 'SWEEP' },
    ])
    expect(headCommands()[0].path).toBe('/api/staff/manage/tours/tour-1/head-commands')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps turning while a button is held and releases it on let go', async () => {
    renderAt('/staff/live/tour-1')
    const panel = await headPanel()
    const right = within(panel).getByRole('button', { name: 'Xoay đầu camera: Phải' })
    await waitFor(() => expect(right).toBeEnabled())
    fireEvent.pointerDown(right, { button: 0 })
    await waitFor(() => expect(headCommands().filter(item => (item.body as { kind: string }).kind === 'JOG').length).toBeGreaterThanOrEqual(2), { timeout: 2000 })
    fireEvent.pointerUp(right)
    fireEvent.click(right, { detail: 1 })
    await waitFor(() => expect(headCommands().at(-1)?.body).toEqual({ kind: 'JOG', panDir: 0, tiltDir: 0 }))
    expect(headCommands().every(item => (item.body as { kind: string }).kind === 'JOG')).toBe(true)
    expect(headCommands()[0].body).toEqual({ kind: 'JOG', panDir: -1, tiltDir: 0 })
  })

  it('switches the automatic head mode for the Operator', async () => {
    renderAt('/staff/live/tour-1')
    const toggle = within(await headPanel()).getByRole('switch', { name: /Đầu camera tự quay tại điểm dừng/ })
    await waitFor(() => expect(toggle).toBeChecked())
    fireEvent.click(toggle)
    await waitFor(() => expect(sent.find(item => item.path.endsWith('/head-mode'))).toEqual({ method: 'PUT', path: '/api/staff/manage/tours/tour-1/head-mode', body: { mode: 'MANUAL' } }))
  })

  it('locks every head control for a Staff who is not the Operator, naming who can press', async () => {
    useAuthStore.getState().setAuth('test-token', { userId: 'staff-2', username: 'minh', role: 'Staff' })
    renderAt('/staff/live/tour-1')
    const panel = await headPanel()
    expect(within(panel).getByText('Chỉ Lan Staff mới xoay được đầu camera.')).toBeInTheDocument()
    for (const button of headButtons(panel)) expect(button).toBeDisabled()
    expect(within(panel).getByRole('switch')).toBeDisabled()
    expect(headCommands()).toHaveLength(0)
  })

  it.each([
    ['HEAD_CONTROL_DISABLED', 'Máy chủ đang tắt chức năng xoay đầu camera. Báo Kỹ thuật nếu cần dùng.'],
    ['HEAD_ROBOT_NOT_CONNECTED', 'Robot chưa kết nối kênh đầu camera, nên nút tạm khóa. Kiểm tra robot đang bật và có mạng.'],
  ])('locks the buttons with a Vietnamese reason when the server answers %s', async (code, reason) => {
    headReply = conflict(code)
    renderAt('/staff/live/tour-1')
    const panel = await headPanel()
    const left = within(panel).getByRole('button', { name: 'Xoay đầu camera: Trái' })
    await waitFor(() => expect(left).toBeEnabled())
    fireEvent.click(left)
    expect(await within(panel).findByText(reason)).toBeInTheDocument()
    for (const button of headButtons(panel)) expect(button).toBeDisabled()
    expect(panel.textContent).not.toMatch(/HEAD_|Fleet Head/)
  })

  it('locks the buttons before any press when the head status says the robot is not listening', async () => {
    head = { ...OK_HEAD, connected: false, head: null }
    renderAt('/staff/live/tour-1')
    const panel = await headPanel()
    expect(await within(panel).findByText(/Robot chưa kết nối kênh đầu camera/)).toBeInTheDocument()
    for (const button of headButtons(panel)) expect(button).toBeDisabled()
    expect(within(panel).getByText('Robot chưa báo vị trí đầu camera.')).toBeInTheDocument()
  })

  it('unlocks once a newer head status says the control is back', async () => {
    headReply = conflict('HEAD_ROBOT_NOT_CONNECTED')
    head = { ...OK_HEAD, connected: false }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/live/tour-1']}>
      <Routes><Route path="/staff/live/:tourId" element={<LiveOperationsPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    const panel = await headPanel()
    expect(await within(panel).findByText(/Robot chưa kết nối kênh đầu camera/)).toBeInTheDocument()
    head = OK_HEAD
    await act(() => client.refetchQueries({ queryKey: ['staff', 'tour-head', 'tour-1'] }))
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Xoay đầu camera: Trái' })).toBeEnabled())
  })
})

describe('live console layout', () => {
  it('reads camera, situation, head, End Early, map, then route in DOM order, with Next in the situation card', async () => {
    renderAt('/staff/live/tour-1')
    await headPanel()
    const order = ['Camera', 'Tình hình hiện tại', 'Đầu camera', 'Kết thúc sớm', 'Bản đồ', 'Robot', 'Tuyến của Tour']
      .map(name => screen.getByRole('region', { name }))
    for (let index = 1; index < order.length; index++)
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(order[1]).getByRole('button', { name: /Đi tới/ })).toBeInTheDocument()
    // From 1024px: camera and situation in the main column, head, map, robot and End Early in the side column.
    expect(order[0].parentElement?.className).toContain('lg:col-start-1')
    const side = order[2].parentElement as HTMLElement
    expect(side.tagName).toBe('ASIDE')
    expect(side.className).toContain('lg:col-start-2')
    expect([order[2], order[4], order[5], order[3]].map(section => section.className.match(/lg:order-(\d)/)?.[1])).toEqual(['1', '2', '3', '4'])
    // The Staff camera permission brings the relay URL and token (ADR-0055); the video is the shared player.
    expect(await within(order[0]).findByLabelText(/Hình trực tiếp/)).toBeInTheDocument()
    expect(sent.some(item => item.method === 'POST' && item.path === '/api/staff/manage/robots/amr_01/camera-lease')).toBe(true)
  })

  it('opens the Digital Twin on the Tour robot from the mini map', async () => {
    renderAt('/staff/live/tour-1')
    const map = await screen.findByRole('region', { name: 'Bản đồ' })
    expect(within(map).getByRole('link', { name: 'Mở Digital Twin' })).toHaveAttribute('href', '/staff/digital-twin?robot=amr_01')
  })

  it('shows no head control or camera on a Tour that has ended', async () => {
    tour = { ...running(), tour: summary('tour-1', 'COMPLETED'), endedAt: '2026-11-04T02:50:00Z' }
    renderAt('/staff/live/tour-1')
    expect(await screen.findByRole('region', { name: 'Tuyến của Tour' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Đầu camera' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Camera' })).not.toBeInTheDocument()
    expect(sent.filter(item => item.path.endsWith('/camera-lease'))).toHaveLength(0)
  })
})

describe('live console without a running Tour', () => {
  it('shows the next confirmed Tour with its opening and the schedule', async () => {
    list = [summary('tour-9', 'SCHEDULED', 'Tour chưa chốt'), summary('tour-7', 'READY', 'Tour chiều thứ Ba', '2026-11-05T07:00:00Z')]
    renderAt('/staff/live')
    const next = await screen.findByRole('region', { name: 'Tour đã chốt kế tiếp' })
    expect(await within(next).findByText('Tour chiều thứ Ba')).toBeInTheDocument()
    expect(within(next).getByText(/05\/11\/2026 14:00/)).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Mở Tour' })).toHaveAttribute('href', '/staff/tours/tour-7/start')
    expect(within(next).getByRole('link', { name: /Xem lịch/ })).toHaveAttribute('href', '/staff/schedule')
    expect(screen.queryByText('Tour chưa chốt')).not.toBeInTheDocument()
  })

  it('offers the schedule when no Tour is confirmed', async () => {
    renderAt('/staff/live')
    expect(await screen.findByText('Chưa có Tour nào đã chốt trong 7 ngày tới')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem lịch/ })).toHaveAttribute('href', '/staff/schedule')
  })
})

describe('Viewers choose the next stop (ADR-0065)', () => {
  const stops = [STOP, { ...STOP, id: 'rrs-2', poiRevisionId: 'poi-rev-2', stopOrder: 2, name: 'Phòng B', x: 3 }, { ...STOP, id: 'rrs-3', poiRevisionId: 'poi-rev-3', stopOrder: 3, name: 'Phòng C', x: 5 }]
  let lockReply: Reply | null
  let retryReply: Reply | null
  function voting(patch: Partial<TourDetails> = {}): TourDetails {
    const base = running()
    return {
      ...base,
      routeRevision: { ...REVISION, viewerChoosesNextStop: true, endX: 0, endY: 0, endYaw: 0, stops } as unknown as TourDetails['routeRevision'],
      execution: { ...base.execution!, dwellDeadlineAt: new Date(Date.now() + 65_000).toISOString(), autoAdvance: { enabled: false, blockedReason: null } },
      allowedActions: { ...base.allowedActions!, skip: { allowed: false, reason: 'SKIP_NOT_ALLOWED', blockedBy: [] } },
      ballot: { stopVisitId: 'visit-1', open: true, closesAt: new Date(Date.now() + 65_000).toISOString(), myVote: null, locked: [], decision: null,
        candidates: [{ stopId: 'rrs-2', poiId: 'p2', name: 'Phòng B', votes: 1 }, { stopId: 'rrs-3', poiId: 'p3', name: 'Phòng C', votes: 3 }] },
      leadingStopId: 'rrs-3',
      nextTarget: { kind: 'POI', stopId: 'rrs-3', name: 'Phòng C' },
      stopProgress: [{ stopId: 'rrs-1', progress: 'CURRENT' }, { stopId: 'rrs-2', progress: 'REMAINING' }, { stopId: 'rrs-3', progress: 'REMAINING' }],
      ...patch,
    }
  }
  beforeEach(() => {
    lockReply = null
    retryReply = null
    const base = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const reply = /\/stops\/[^/]+\/(lock|unlock)$/.test(path) ? lockReply : path.endsWith('/retry-leg') ? retryReply : null
      if (reply) {
        sent.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : null })
        return json(reply.body, reply.status)
      }
      return base(input, init)
    })
  })
  const panel = async () => within(await screen.findByRole('region', { name: 'Viewer chọn điểm tiếp theo' }))
  const situation = async () => within(await screen.findByRole('region', { name: 'Tình hình hiện tại' }))
  /** On the leg to Phòng C (rrs-3), after Thư viện; `execution` says whether the robot is still driving it. */
  function onLeg(execution: Partial<NonNullable<TourDetails['execution']>>, patch: Partial<TourDetails> = {}): TourDetails {
    const base = voting()
    return voting({
      ballot: null, leadingStopId: null, nextTarget: null,
      execution: { ...base.execution!, currentStep: 'NAVIGATING', currentRevisionStopId: 'rrs-3', dwellDeadlineAt: null,
        command: { id: 'cmd-2', kind: 'GoTo', state: 'ACCEPTED', outcome: null, reasonCode: null }, ...execution },
      stopProgress: [{ stopId: 'rrs-1', progress: 'VISITED', order: 1 }, { stopId: 'rrs-2', progress: 'REMAINING' }, { stopId: 'rrs-3', progress: 'NEXT' }],
      ...patch,
    })
  }
  const stoppedLeg = { operationalStatus: 'PAUSED' as const, command: { id: 'cmd-2', kind: 'GoTo' as const, state: 'CANCELLED' as const, outcome: 'CANCELLED', reasonCode: null } }
  const retryAllowed = { ...running().allowedActions!, next: { allowed: false, reason: null, blockedBy: ['TOUR_STATE_INVALID'] }, retryLeg: { allowed: true, reason: null, blockedBy: [] } }

  it('offers no lock for the POI the robot is really driving to, and says why', async () => {
    tour = onLeg({})
    renderAt('/staff/live/tour-1')
    const list = await panel()
    expect(list.getByText('Robot đang tới điểm này, chỉ khóa được khi robot đã dừng')).toBeInTheDocument()
    expect(list.queryByRole('button', { name: 'Khóa Phòng C' })).not.toBeInTheDocument()
    expect(list.getByRole('button', { name: 'Khóa Phòng B' })).toBeInTheDocument()
  })

  it('offers the lock for the leg target once its leg has stopped, saying where the robot then goes', async () => {
    tour = onLeg(stoppedLeg, { allowedActions: retryAllowed })
    renderAt('/staff/live/tour-1')
    expect((await situation()).getByRole('button', { name: /Tiếp tục tới Phòng C/ })).toBeInTheDocument()
    const list = await panel()
    expect(list.queryByText(/Robot đang tới điểm này/)).not.toBeInTheDocument()
    fireEvent.click(list.getByRole('button', { name: 'Khóa Phòng C' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Khóa Phòng C?' }))
    expect(dialog.getByText(/Robot sẽ đi tới điểm được bầu nhiều kế tiếp khi bạn cho đi tiếp\./)).toBeInTheDocument()
    // Another POI's lock does not say so.
    fireEvent.click(dialog.getByRole('button', { name: 'Quay lại' }))
    fireEvent.click(list.getByRole('button', { name: 'Khóa Phòng B' }))
    expect(within(screen.getByRole('dialog', { name: 'Khóa Phòng B?' })).queryByText(/Robot sẽ đi tới/)).not.toBeInTheDocument()
  })

  it('names the POI the server re-chose on Resume after the leg target was locked', async () => {
    tour = onLeg(stoppedLeg, {
      allowedActions: retryAllowed,
      retryTarget: { kind: 'POI', stopId: 'rrs-2', name: 'Phòng B' },
      stopProgress: [{ stopId: 'rrs-1', progress: 'VISITED', order: 1 }, { stopId: 'rrs-2', progress: 'NEXT' }, { stopId: 'rrs-3', progress: 'REMAINING', lockReason: 'Có lớp' }],
    })
    renderAt('/staff/live/tour-1')
    const actions = await situation()
    expect(actions.getByRole('button', { name: /Tiếp tục tới Phòng B/ })).toBeInTheDocument()
    expect(actions.getByText(/lệnh mới tới Phòng B/)).toBeInTheDocument()
    const list = await panel()
    expect(list.getByText('Lý do: Có lớp')).toBeInTheDocument()
    expect(list.getByRole('button', { name: 'Mở khóa Phòng C' })).toBeInTheDocument()
  })

  it('says every POI ahead is locked when the server refuses Retry for it, and offers Skip', async () => {
    const allLocked = [{ stopId: 'rrs-1', progress: 'VISITED', order: 1 }, { stopId: 'rrs-2', progress: 'REMAINING', lockReason: 'Đang sửa' }, { stopId: 'rrs-3', progress: 'REMAINING', lockReason: 'Có lớp' }]
    tour = onLeg({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'NavigationFailed', command: { id: 'cmd-2', kind: 'GoTo', state: 'FAILED', outcome: 'FAILED', reasonCode: null } }, {
      stopProgress: allLocked,
      allowedActions: { ...retryAllowed, retryLeg: { allowed: false, reason: 'Mọi điểm tham quan còn lại đều đang bị khóa.', blockedBy: ['ALL_REMAINING_STOPS_LOCKED'] }, skip: { allowed: true, reason: null, blockedBy: [] } },
    })
    renderAt('/staff/live/tour-1')
    const actions = await situation()
    expect(actions.getByRole('button', { name: /Cho robot đi lại tới Phòng C/ })).toBeDisabled()
    expect(actions.getByText(/Mọi điểm còn lại đang tạm khóa\. Mở khóa một điểm, hoặc bấm Bỏ qua các điểm còn lại để về điểm kết thúc\./)).toBeInTheDocument()
    expect(actions.getByRole('button', { name: /Bỏ qua các điểm còn lại/ })).toBeEnabled()
  })

  it('keeps the Retry dialog open with the same words when the server answers ALL_REMAINING_STOPS_LOCKED', async () => {
    tour = onLeg({ operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: 'NavigationFailed', command: { id: 'cmd-2', kind: 'GoTo', state: 'FAILED', outcome: 'FAILED', reasonCode: null } }, { allowedActions: retryAllowed })
    retryReply = conflict('ALL_REMAINING_STOPS_LOCKED')
    renderAt('/staff/live/tour-1')
    fireEvent.click((await situation()).getByRole('button', { name: /Cho robot đi lại tới Phòng C/ }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: 'Đi lại' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Mọi điểm còn lại đang tạm khóa. Mở khóa một điểm, hoặc bấm Bỏ qua các điểm còn lại để về điểm kết thúc.')
    expect(sent.some(item => item.path === '/api/staff/manage/tours/tour-1/retry-leg')).toBe(true)
  })

  it('labels Next with the server target, shows the ballot, the leader and the dwell left, and keeps the auto switch', async () => {
    tour = voting()
    renderAt('/staff/live/tour-1')
    const situation = within(await screen.findByRole('region', { name: 'Tình hình hiện tại' }))
    // By StopOrder the next POI would be Phòng B; the server says Phòng C.
    expect(situation.getByRole('button', { name: /Đi tới Phòng C/ })).toBeInTheDocument()
    expect(situation.queryByRole('button', { name: /Bỏ qua/ })).not.toBeInTheDocument()
    expect(situation.getByRole('switch', { name: /Tự đi tiếp khi hết giờ dừng/ })).toBeInTheDocument()
    expect(situation.getByText(/Học sinh đang bầu điểm tiếp theo/)).toBeInTheDocument()
    const votes = within((await panel()).getByRole('table', { name: 'Số phiếu' }))
    expect(votes.getByRole('row', { name: /Phòng C/ })).toHaveTextContent(/Phòng C\s*Đang dẫn đầu\s*3 phiếu/)
    expect(votes.getByRole('row', { name: /Phòng B/ })).toHaveTextContent('1 phiếu')
    expect((await panel()).getByRole('timer')).toHaveTextContent(/Còn 1:0\d thời gian dừng/)
  })

  it('locks a POI only after a reason, and sends it to the lock endpoint', async () => {
    tour = voting()
    renderAt('/staff/live/tour-1')
    fireEvent.click((await panel()).getByRole('button', { name: 'Khóa Phòng B' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Khóa Phòng B?' }))
    expect(dialog.getByText(/Mọi học sinh thấy lý do bạn nhập/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Khóa điểm' })).toBeDisabled()
    fireEvent.change(dialog.getByLabelText(/Lý do khóa/), { target: { value: 'Phòng đang có lớp' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Khóa điểm' }))
    await waitFor(() => expect(sent.find(item => item.path.endsWith('/lock'))).toEqual({ method: 'POST', path: '/api/staff/manage/tours/tour-1/stops/rrs-2/lock', body: { reason: 'Phòng đang có lớp' } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog open with the refusal in words when the server refuses the lock', async () => {
    tour = voting()
    lockReply = conflict('STOP_LOCK_INVALID')
    renderAt('/staff/live/tour-1')
    fireEvent.click((await panel()).getByRole('button', { name: 'Khóa Phòng B' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText(/Lý do khóa/), { target: { value: 'Phòng đang có lớp' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Khóa điểm' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Không khóa hoặc mở khóa được điểm này')
  })

  it('offers unlock and Skip of the remaining POIs once every POI ahead is locked', async () => {
    tour = voting({
      ballot: null, leadingStopId: null, nextTarget: null,
      stopProgress: [{ stopId: 'rrs-1', progress: 'CURRENT' }, { stopId: 'rrs-2', progress: 'REMAINING', lockReason: 'Đang sửa' }, { stopId: 'rrs-3', progress: 'REMAINING', lockReason: 'Có lớp' }],
      allowedActions: { ...running().allowedActions!, next: { allowed: false, reason: 'ALL_REMAINING_STOPS_LOCKED', blockedBy: [] }, skip: { allowed: true, reason: null, blockedBy: [] } },
    })
    renderAt('/staff/live/tour-1')
    const situation = within(await screen.findByRole('region', { name: 'Tình hình hiện tại' }))
    expect(situation.getByText('Mọi điểm còn lại đang tạm khóa')).toBeInTheDocument()
    expect(situation.getByRole('button', { name: /Bỏ qua các điểm còn lại/ })).toBeEnabled()
    const list = await panel()
    expect(list.getByText('Lý do: Đang sửa')).toBeInTheDocument()
    fireEvent.click(list.getByRole('button', { name: 'Mở khóa Phòng B' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Mở khóa Phòng B?' }))
    fireEvent.change(dialog.getByLabelText(/Lý do mở khóa/), { target: { value: 'Đã sửa xong' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Mở khóa' }))
    await waitFor(() => expect(sent.some(item => item.path === '/api/staff/manage/tours/tour-1/stops/rrs-2/unlock')).toBe(true))
  })

  it('gives a non-Operator the ballot but no lock buttons', async () => {
    tour = voting()
    useAuthStore.getState().setAuth('test-token', { userId: 'staff-2', username: 'minh', role: 'Staff' })
    renderAt('/staff/live/tour-1')
    expect((await panel()).getByRole('table', { name: 'Số phiếu' })).toBeInTheDocument()
    expect((await panel()).queryByRole('button', { name: /Khóa/ })).not.toBeInTheDocument()
  })

  it('leaves a fixed-order Tour exactly as before', async () => {
    renderAt('/staff/live/tour-1')
    expect(await screen.findByRole('region', { name: 'Tình hình hiện tại' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Viewer chọn điểm tiếp theo' })).not.toBeInTheDocument()
  })
})
