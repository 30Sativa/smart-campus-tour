import { ApiError } from '../../../api/client'
import { tourError } from './tour-messages'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useToastStore } from '../../../components/ui/toast-store'
import { formatDuration, formatTime } from '../../../components/ui/date-time'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageTourCreatePage from '../../../routes/staff/manage/StaffManageTourCreatePage'
import StaffManageTourDetailPage from '../../../routes/staff/manage/StaffManageTourDetailPage'
import StaffManageTourEditPage from '../../../routes/staff/manage/StaffManageTourEditPage'
import { useAuthStore } from '../../../stores/auth-store'
import type { RouteDetails } from '../routes/types'
import type { TourDetails } from './types'

const ROUTE_VERSION = 'A'.repeat(64)
const ROW_VERSION = 'AAAAAAAAAAE='
const ROUTE: RouteDetails = {
  id: 'route-1', name: 'Tuyến thử', description: null, mapKey: 'map2-v1', mapFrame: 'map', isActive: true,
  createdAt: '2026-10-19T00:00:00Z', updatedAt: null, stopCount: 1, version: ROUTE_VERSION,
  startX: 0, startY: 0, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null,
  stops: [{ id: 'stop-1', poiId: 'poi-1', poiName: 'POI 1', stopOrder: 1, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 30 }] }],
  usage: { hasReferences: false, hasReadyOrRunningTours: false, canEditConfiguration: true, canEditMetadataAndAvailability: true, canDelete: true },
  configurationIssues: [], availabilityIssues: [],
}
function tour(overrides: Partial<TourDetails> = {}): TourDetails {
  return {
    tour: { id: 'tour-1', name: 'Tour sáng thứ Bảy', description: null, routeId: 'route-1', routeName: 'Tuyến thử', activeRouteId: 'route-1',
      scheduledStartAt: '2020-01-01T02:00:00.000Z', state: 'SCHEDULED', createdByUserId: 'admin', createdAt: '2019-12-01T00:00:00Z',
      updatedAt: null, rowVersion: ROW_VERSION, registrationCount: 0, invitationCount: 0, routeRevisionId: null },
    route: ROUTE, activeRoute: ROUTE, routeRevision: null, operator: null, reservation: null, fallbackVideoUrl: null, startedAt: null, endedAt: null, endReason: null,
    usage: { hasRegistrations: false, hasAllowedBranches: false, hasOperationalHistory: false, hasRobotOwnership: false },
    permissions: { canEditMetadata: true, canChangeScheduleAndRoute: true, canCancel: true }, ...overrides,
  }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

/** Serves the Route and Tour reads; records every write. */
const STOP = { poiRevisionId: 'poi-rev-1', sourcePoiVerificationRecordId: 'verification-1', stopOrder: 1, dwellSeconds: 30, headSteps: [], name: 'Thư viện', x: 0, y: 0, yaw: 0, cameraPreset: 'FRONT' }
const TESTED = { routeId: 'route-2', revisionId: 'revision-2', revisionNumber: 3, name: 'Tuyến đã duyệt', mapKey: 'library-v1', isSubmitted: true, verificationStatus: 'PASS', stops: [STOP] }
const versionedTour = tour({ route: null, activeRoute: null, routeRevision: TESTED as unknown as TourDetails['routeRevision'],
  operator: { userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' },
  reservation: { robotCode: 'amr-01', startsAt: '2099-01-03T01:45:00Z', endsAt: '2099-01-03T02:22:00Z', measuredDurationSeconds: 420, expectedDurationSeconds: 420, releasedAt: null },
  permissions: { canEditMetadata: true, canChangeScheduleAndRoute: true, canCancel: true } })
const chooseTarget = async () => {
  await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })
  fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })
  await screen.findByRole('option', { name: 'AMR 01 · amr-01' })
  fireEvent.change(screen.getByLabelText('Robot'), { target: { value: 'amr-01' } })
  await screen.findByRole('option', { name: 'Lan Staff · lan' })
  fireEvent.change(screen.getByLabelText('Người vận hành'), { target: { value: 'staff-1' } })
}
const pickDate = () => fireEvent.change(screen.getByLabelText(/Ngày tổ chức/), { target: { value: '03/01/2099' } })
// docs/lich-tour-theo-ca.md §3: the morning shift holds the robot 08:00-10:00 and the Tour starts at 08:15.
const freeSlot = { time: '08:15', startsAt: '2099-01-03T01:15:00Z', available: true, reasonCode: null, reason: null,
  reservationStartsAt: '2099-01-03T01:00:00Z', reservationEndsAt: '2099-01-03T03:00:00Z', registrationClosesAt: '2099-01-01T01:15:00Z',
  shiftCode: 'S1', shiftName: 'Ca sáng', maxDurationSeconds: 5400 }
const lockedSlot = { ...freeSlot, time: '13:15', startsAt: '2099-01-03T06:15:00Z', reservationStartsAt: '2099-01-03T06:00:00Z', reservationEndsAt: '2099-01-03T08:00:00Z',
  shiftCode: 'S2', shiftName: 'Ca chiều 1', available: false, reasonCode: 'RESERVATION_OVERLAP', reason: 'Trùng khung giữ robot của Tour Tour chiều' }
let slotDay = [freeSlot, lockedSlot]
let expectedSeconds = 1320
let refuseCreate: string | null = null
let refuseMessage = 'x'
let shortNoticeMinutes = 30
const BASE_ROBOTS = [
  { robotCode: 'amr-01', displayName: 'AMR 01', usable: true, blockReason: null },
  { robotCode: 'amr-02', displayName: 'AMR 02', usable: false, blockReason: 'Robot chưa xác nhận kết nối.' },
]
let robotRows: Record<string, unknown>[] = BASE_ROBOTS
/** What `/api/routes/route-2/revisions` returns as the route's current revision. */
let currentRevision: Record<string, unknown> = { ...TESTED, revisionHistory: [] }

function api(detail: TourDetails = tour(), testedRoutes: unknown[] = [TESTED, { ...TESTED, revisionId: 'revision-untested', name: 'Chưa đạt', verificationStatus: 'NOT_TESTED' }]) {
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const path = url.pathname
    const method = init?.method ?? 'GET'
    if (path === '/api/staff/manage/tours/shifts') return Promise.resolve(json({ success: true, data: { days: [], recommendedMaxSeconds: 3600, quickTourWaitMinutes: shortNoticeMinutes } }))
    if (path === '/api/staff/manage/tours/slots') return Promise.resolve(json({ success: true, data: { routeRevisionId: 'revision-2', robotCode: 'amr-01',
      measuredDurationSeconds: 1200, expectedDurationSeconds: expectedSeconds, recommendedMaxSeconds: 3600,
      days: [{ date: '2099-01-03', slots: slotDay }] } }))
    if (method !== 'GET') {
      writes.push({ method, path, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      if (refuseCreate) return Promise.resolve(json({ success: false, message: refuseMessage, errors: { code: refuseCreate } }, 409))
      return Promise.resolve(json({ success: true, data: { id: 'tour-1' } }))
    }
    if (path === '/api/routes/route-2/revisions') return Promise.resolve(json({ success: true, data: currentRevision }))
    if (path === '/api/routes') return Promise.resolve(json({ data: testedRoutes, pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } }))
    if (path === '/api/staff/manage/tours/robots') return Promise.resolve(json({ success: true, data: robotRows }))
    if (path === '/api/staff/manage/tours/operators') return Promise.resolve(json({ success: true, data: [{ userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' }] }))
    if (path === '/api/staff/manage/routes') return Promise.resolve(json({ data: [ROUTE], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } }))
    if (path === '/api/staff/manage/routes/route-1') return Promise.resolve(json({ success: true, data: ROUTE }))
    if (path === '/api/staff/manage/tours/tour-1') return Promise.resolve(json({ success: true, data: detail }))
    return Promise.resolve(json({ success: false }, 404))
  }))
  return writes
}
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/manage/tours/new" element={<StaffManageTourCreatePage />} />
    <Route path="/staff/manage/tours/:tourId" element={<StaffManageTourDetailPage />} />
    <Route path="/staff/manage/tours/:tourId/edit" element={<StaffManageTourEditPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => { robotRows = BASE_ROBOTS; slotDay = [freeSlot, lockedSlot]; expectedSeconds = 1320; refuseCreate = null; refuseMessage = 'x'; shortNoticeMinutes = 30; currentRevision = { ...TESTED, revisionHistory: [] } })
beforeEach(() => useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'admin', username: 'admin', role: 'Admin' } }))
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

it('offers only robots the chosen route can use, and says why the others are off', async () => {
  api()
  renderAt('/staff/manage/tours/new?kind=normal')
  await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })
  expect(screen.getByLabelText('Robot')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })

  expect(await screen.findByRole('option', { name: 'AMR 01 · amr-01' })).toBeEnabled()
  expect(screen.getByRole('option', { name: 'AMR 02 · amr-02 (Robot chưa xác nhận kết nối.)' })).toBeDisabled()
})

describe('choosing the route of a new Tour', () => {
  const tooLong = { ...TESTED, revisionId: 'revision-old', name: 'Tuyến rất dài', scheduleFit: 'TOO_LONG_FOR_SHIFT' }

  it('shows a route too long for one shift as disabled, with the reason', async () => {
    api(tour(), [TESTED, tooLong])
    renderAt('/staff/manage/tours/new?kind=normal')
    expect(await screen.findByRole('option', { name: 'Tuyến rất dài · 1 điểm dừng (Quá dài cho 1 ca)' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })).toBeEnabled()
  })

  it('explains each route when none can be used', async () => {
    api(tour(), [tooLong, { ...TESTED, revisionId: 'revision-long', name: 'Tuyến dài', scheduleFit: 'TOO_LONG_FOR_SHIFT' }])
    renderAt('/staff/manage/tours/new?kind=normal')
    expect(await screen.findByText('Chưa có tuyến nào dùng được để tạo Tour.')).toBeInTheDocument()
    const reasons = screen.getByRole('list', { name: 'Lý do từng tuyến' })
    expect(within(reasons).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Tuyến rất dài: Quá dài cho 1 ca.',
      'Tuyến dài: Quá dài cho 1 ca.',
    ])
  })

  it('does not show the explanation while a route can be used', async () => {
    api(tour(), [TESTED, tooLong])
    renderAt('/staff/manage/tours/new?kind=normal')
    await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })
    expect(screen.queryByText('Chưa có tuyến nào dùng được để tạo Tour.')).not.toBeInTheDocument()
  })

  it('selects the route named by ?route=, and loads its robots', async () => {
    api()
    renderAt('/staff/manage/tours/new?kind=normal&route=revision-2')
    await waitFor(() => expect(screen.getByLabelText('Tuyến đã kiểm chứng')).toHaveValue('revision-2'))
    expect(await screen.findByRole('option', { name: 'AMR 01 · amr-01' })).toBeEnabled()
  })

  it('does not select a linked route that cannot be used, and says so', async () => {
    api(tour(), [TESTED, tooLong])
    renderAt('/staff/manage/tours/new?kind=normal&route=revision-old')
    expect(await screen.findByText('Tuyến vừa mở chưa dùng được để tạo Tour. Chọn tuyến khác.')).toBeInTheDocument()
    expect(screen.getByLabelText('Tuyến đã kiểm chứng')).toHaveValue('')
  })

  // ADR-0062: create refuses a revision with a retired POI (ROUTE_HAS_RETIRED_POI), so the form does not offer it.
  const retired = { ...TESTED, revisionId: 'revision-retired', name: 'Tuyến có POI cũ', retiredPoiNames: ['Thư viện'] }

  it('shows a route with a retired POI as disabled, naming the POI', async () => {
    api(tour(), [TESTED, retired])
    renderAt('/staff/manage/tours/new?kind=normal')
    expect(await screen.findByRole('option', { name: 'Tuyến có POI cũ · 1 điểm dừng (có POI ngưng dùng: Thư viện)' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })).toBeEnabled()
  })

  it('does not select a linked route with a retired POI, and explains why', async () => {
    api(tour(), [TESTED, retired])
    renderAt('/staff/manage/tours/new?kind=normal&route=revision-retired')
    expect(await screen.findByText(/Tuyến vừa mở \(Tuyến có POI cũ\) có POI đã ngưng dùng: Thư viện\. Không tạo được Tour mới trên tuyến này\./)).toBeInTheDocument()
    expect(screen.getByLabelText('Tuyến đã kiểm chứng')).toHaveValue('')
    expect(screen.queryByText('Tuyến vừa mở chưa dùng được để tạo Tour. Chọn tuyến khác.')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Xem lại trước khi tạo' })).not.toBeInTheDocument()
  })

  it('lets Staff change a linked route', async () => {
    api(tour(), [TESTED, { ...TESTED, revisionId: 'revision-3', name: 'Tuyến khác' }])
    renderAt('/staff/manage/tours/new?kind=normal&route=revision-2')
    await waitFor(() => expect(screen.getByLabelText('Tuyến đã kiểm chứng')).toHaveValue('revision-2'))
    fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-3' } })
    expect(screen.getByLabelText('Tuyến đã kiểm chứng')).toHaveValue('revision-3')
  })
})

describe('live Tour management', () => {
  it('shows the backend message of a JSON 404 and a plain fallback for an empty one', () => {
    expect(tourError(new ApiError(404, JSON.stringify({ success: false, message: 'Không tìm thấy phiên bản tuyến.' })))).toBe('Không tìm thấy phiên bản tuyến.')
    expect(tourError(new ApiError(404, ''))).toBe('Không kết nối được chức năng này, có thể máy chủ chưa cập nhật.')
    expect(tourError(new ApiError(404, '{}'))).toBe('Không tìm thấy Tour hoặc tuyến. Hãy tải lại danh sách.')
    expect(tourError(new ApiError(409, JSON.stringify({ message: 'Lịch đã đổi.', errors: { code: 'SOMETHING_NEW' } })))).toBe('Lịch đã đổi.')
    expect(tourError(new ApiError(500, JSON.stringify({ message: 'chi tiết nội bộ' })))).toBe('Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.')
  })

  it('shows why the slots picker was refused', async () => {
    api()
    const fetchTours = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => new URL(String(input), 'http://localhost').pathname === '/api/staff/manage/tours/slots'
      ? Promise.resolve(json({ success: false, message: 'Tuyến đã ngừng sử dụng nên không dùng được cho Tour mới.', errors: {} }, 404))
      : fetchTours(input, init))
    renderAt('/staff/manage/tours/new?kind=normal')
    await screen.findByRole('option', { name: /Tuyến đã duyệt/ })
    fireEvent.change(screen.getByRole('combobox', { name: 'Tuyến đã kiểm chứng' }), { target: { value: 'revision-2' } })
    await screen.findByRole('option', { name: /amr-01/ })
    fireEvent.change(screen.getByRole('combobox', { name: 'Robot' }), { target: { value: 'amr-01' } })
    pickDate()
    expect(await screen.findByText('Tuyến đã ngừng sử dụng nên không dùng được cho Tour mới.')).toBeInTheDocument()
  })

  it('asks only for routes in use when offering tested routes', async () => {
    api()
    const requested: URL[] = []
    const fetchTours = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => { requested.push(new URL(String(input), 'http://localhost')); return fetchTours(input, init) })
    renderAt('/staff/manage/tours/new?kind=normal')
    await waitFor(() => expect(requested.find(url => url.pathname === '/api/routes')?.searchParams.get('isActive')).toBe('true'))
  })

  it('explains a robot clash instead of a concurrency message', () => {
    const refusal = new ApiError(409, JSON.stringify({ message: 'x', errors: { code: 'ROBOT_RESERVATION_CONFLICT' } }))
    expect(tourError(refusal)).toContain('Robot đã có Tour khác')
  })

  it('shows only tested revisions and reports when none exists', async () => {
    api(tour(), [])
    renderAt('/staff/manage/tours/new?kind=normal')
    expect(await screen.findByText(/Chưa có tuyến nào chạy thử đạt/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeDisabled()
  })

  it('shows a Tour scheduled from a revision with its robot, operator and stops, and offers a metadata-only edit', async () => {
    const writes = api(versionedTour)
    const view = renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText('Tuyến: Tuyến đã duyệt')).toBeInTheDocument()
    expect(screen.getByText('amr-01')).toBeInTheDocument()
    expect(screen.getByText('Lan Staff')).toBeInTheDocument()
    expect(screen.getByText('1. Thư viện')).toBeInTheDocument()
    view.unmount()

    renderAt('/staff/manage/tours/tour-1/edit')
    expect(await screen.findByText('1. Thư viện')).toBeInTheDocument()
    // Its time and route are shown as facts, not as locked inputs that read as if they could change.
    expect(screen.queryByLabelText('Tuyến')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Thời gian dự kiến/)).not.toBeInTheDocument()
    expect(screen.getByText('Đúng bản đã chọn lúc tạo, không đổi theo bản tuyến mới.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tên mới' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ expectedRouteVersion: null, configuration: { name: 'Tên mới', routeId: 'route-1' } })
  })

  it('says when the route of a Tour still to run has a newer revision, which the Tour does not follow', async () => {
    api(versionedTour)
    const view = renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText('1. Thư viện')).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/api/routes/route-2/revisions'))).toBe(true))
    expect(screen.queryByText(/Tuyến đã có bản mới/)).not.toBeInTheDocument()
    view.unmount()

    currentRevision = { ...TESTED, revisionId: 'revision-3', revisionNumber: 4, isSubmitted: true, verificationStatus: 'PASS',
      revisionHistory: [{ revisionId: 'revision-3', revisionNumber: 4, isSubmitted: true, verificationStatus: 'PASS', createdAt: '2099-01-02T08:32:00Z' }] }
    api(versionedTour)
    renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText(/Tuyến đã có bản mới lưu .*, đã chạy thử đạt\. Tour này vẫn chạy bản đã chọn lúc tạo/)).toBeInTheDocument()
    expect(screen.getByText(/Muốn Tour đi theo bản mới, hủy Tour rồi tạo lại\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem bản mới' })).toHaveAttribute('href', '/staff/manage/routes/route-2')
    expect(screen.getByRole('link', { name: 'Xem bản Tour đang dùng' })).toHaveAttribute('href', '/staff/manage/routes/route-2?revisionId=revision-2')
  })

  it('follows the applied result of the Tour\'s save: a FAIL recorded on a newer save with the same path is shown in red', async () => {
    const failed = { id: 'run-9', routeRevisionId: 'revision-3', resultCode: 'FAIL', allStopsReached: false, safelyStopped: true, localizationPassed: true,
      failureReason: 'Kẹt ở cửa', checkedAt: '2026-11-16T12:09:00Z', robotCode: 'amr-01' }
    currentRevision = { ...TESTED, revisionId: 'revision-3', revisionNumber: 4, isSubmitted: true, verificationStatus: 'FAIL',
      revisionHistory: [{ revisionId: 'revision-3', revisionNumber: 4, isSubmitted: true, verificationStatus: 'FAIL', createdAt: '2026-11-16T09:00:00Z' }] }
    api(tour({ ...versionedTour, routeRevision: { ...TESTED, verificationStatus: 'FAIL', effectiveTestRunId: 'run-9', testRuns: [failed] } as unknown as TourDetails['routeRevision'] }))
    renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText(/Đường đi của Tour này vừa chạy thử không đạt lúc 19:09 16\/11 \(lý do: Kẹt ở cửa\)\. Tour không chốt và không bắt đầu được cho tới khi Kỹ thuật ghi một lần chạy đạt\./)).toBeInTheDocument()
    expect(screen.queryByText(/Tuyến đã chạy thử đạt ngày/)).not.toBeInTheDocument()
    expect(await screen.findByText(/bản đó đang có kết quả chạy thử không đạt/)).toBeInTheDocument()
    expect(screen.queryByText(/Tour này vẫn chạy bản đã chọn lúc tạo/)).not.toBeInTheDocument()
  })

  it('does not advise recreating the Tour on a newer save that also has a retired POI', async () => {
    currentRevision = { ...TESTED, revisionId: 'revision-3', revisionNumber: 4, isSubmitted: true, verificationStatus: 'PASS', retiredPoiNames: ['Thư viện'],
      revisionHistory: [{ revisionId: 'revision-3', revisionNumber: 4, isSubmitted: true, verificationStatus: 'PASS', createdAt: '2099-01-02T08:32:00Z' }] }
    api(versionedTour)
    renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText(/Bản mới cũng có POI đã ngưng dùng nên chưa tạo lại Tour theo bản này được\. Dùng lại POI, hoặc lưu một bản tuyến không có POI đó/)).toBeInTheDocument()
    expect(screen.queryByText(/hủy Tour rồi tạo lại\./)).not.toBeInTheDocument()
  })

  it('creates a SCHEDULED Tour from an active Route with its revision and an idempotency key', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=normal')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour sáng thứ Bảy' } })
    await chooseTarget()
    expect(await screen.findByText('1. Thư viện')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeDisabled()
    // The disabled button says what it still waits for.
    expect(screen.getByText('Cần: chọn ngày, chọn ca.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toHaveAccessibleDescription('Cần: chọn ngày, chọn ca.')
    pickDate()
    // Shifts only: no typed time any more (docs/lich-tour-theo-ca.md §3).
    expect(await screen.findByRole('button', { name: /Ca sáng · 08:15-09:45 · Giữ robot 08:00-10:00/ })).toBeEnabled()
    expect(screen.getByText('Cần: chọn ca.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Giờ khác/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ca sáng/ }))
    expect(screen.queryByText(/^Cần:/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeEnabled()
    const review = screen.getByRole('region', { name: 'Xem lại trước khi tạo' })
    expect(within(review).getByText('22 phút (tự tính từ thời gian dừng và quãng đường)')).toBeInTheDocument()
    expect(within(review).queryByText(/Chạy thử đo/)).not.toBeInTheDocument()
    expect(within(review).getByText('08:00 - 10:00')).toBeInTheDocument()
    expect(within(review).getByText('01/01/2099 08:15')).toBeInTheDocument()
    expect(within(review).queryByText(/mức khuyến nghị/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await screen.findByRole('heading', { name: 'Tour sáng thứ Bảy' })
    // The toast only confirms; the Tour page says what comes next.
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'Đã tạo Tour “Tour sáng thứ Bảy”', detail: 'Robot đã được giữ.' })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/staff/manage/tours', body: {
      configuration: { name: 'Tour sáng thứ Bảy', description: null, routeRevisionId: 'revision-2', robotCode: 'amr-01', operatorUserId: 'staff-1', scheduledStartAt: '2099-01-03T01:15:00Z', fallbackVideoUrl: null },
    } })
    expect(writes[0].body.requestId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
  })

  it('asks for the Tour kind before showing the form, and lets Staff change it', async () => {
    shortNoticeMinutes = 60
    api()
    renderAt('/staff/manage/tours/new?route=revision-2')
    expect(screen.queryByLabelText('Tên Tour')).not.toBeInTheDocument()
    expect(await screen.findByText('Chưa bắt đầu sau 60 phút thì tự huỷ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Tour nhanh/ }))
    expect(await screen.findByLabelText(/Lý do tạo gấp/)).toBeInTheDocument()
    // A quick Tour has no date or shift (ADR-0053).
    expect(screen.queryByLabelText(/Ngày tổ chức/)).not.toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tuyến đã kiểm chứng')).toHaveValue('revision-2')
    fireEvent.click(screen.getByRole('button', { name: 'Đổi loại' }))
    fireEvent.click(screen.getByRole('button', { name: /Tour theo ca/ }))
    expect(await screen.findByLabelText('Tên Tour')).toBeInTheDocument()
    expect(screen.getByLabelText(/Ngày tổ chức/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Lý do tạo gấp/)).not.toBeInTheDocument()
  })

  it('marks a robot waiting for its on-site check but still lets it be chosen, in both forms', async () => {
    robotRows = [...BASE_ROBOTS, { robotCode: 'amr-03', displayName: 'AMR 03', usable: true, blockReason: null, needsInspection: true }]
    api()
    for (const kind of ['normal', 'quick']) {
      const view = renderAt(`/staff/manage/tours/new?kind=${kind}`)
      await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })
      fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })
      expect(await screen.findByRole('option', { name: 'AMR 03 · amr-03 (chờ kiểm tra tại chỗ, phải trả robot trước khi bắt đầu)' })).toBeEnabled()
      view.unmount()
    }
  })

  it('disables a robot another Tour holds over the quick hold, and the clash never mentions a shift', async () => {
    robotRows = [{ ...BASE_ROBOTS[0], heldByTourName: 'Trình diễn sáng', heldUntil: '2099-01-03T03:30:00.000Z' },
      { robotCode: 'amr-05', displayName: 'AMR 05', usable: true, blockReason: null }]
    const requested: URL[] = []
    api()
    const fetchTours = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => { requested.push(new URL(String(input), 'http://localhost')); return fetchTours(input, init) })
    renderAt('/staff/manage/tours/new?kind=quick')
    await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })
    fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })
    expect(await screen.findByRole('option', { name: /^AMR 01 · amr-01 \(đang giữ cho Tour Trình diễn sáng tới \d{2}:\d{2}\)$/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'AMR 05 · amr-05' })).toBeEnabled()
    expect(requested.find(url => url.pathname === '/api/staff/manage/tours/robots')?.searchParams.get('quick')).toBe('true')

    const refusal = new ApiError(409, JSON.stringify({ message: 'x', errors: { code: 'ROBOT_RESERVATION_CONFLICT' } }))
    expect(tourError(refusal, { quick: true })).toBe('Robot đang được giữ cho Tour khác trong khoảng thời gian này. Chọn robot khác.')
    expect(tourError(refusal, { quick: true })).not.toMatch(/(^|\s)ca(\s|$)/i)
  })

  it('says the quick hold clash in its own words when create is refused', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=quick')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour trùng' } })
    await chooseTarget()
    fireEvent.change(screen.getByLabelText(/Lý do tạo gấp/), { target: { value: 'Đoàn khách.' } })
    refuseCreate = 'ROBOT_RESERVATION_CONFLICT'
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    expect(await screen.findByText('Robot đang được giữ cho Tour khác trong khoảng thời gian này. Chọn robot khác.')).toBeInTheDocument()
    expect(screen.queryByText(/trong ca này/)).not.toBeInTheDocument()
    expect(writes).toHaveLength(1)
  })

  it('lists what a quick Tour still needs beside the disabled button, in the order of the fields', async () => {
    api()
    renderAt('/staff/manage/tours/new?kind=quick')
    await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })
    expect(screen.getByText('Cần: nhập tên Tour, nhập lý do tạo gấp, chọn tuyến, chọn robot, chọn người vận hành.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour trình diễn' } })
    fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })
    await screen.findByRole('option', { name: 'Lan Staff · lan' })
    fireEvent.change(screen.getByLabelText('Người vận hành'), { target: { value: 'staff-1' } })
    expect(screen.getByText('Cần: nhập lý do tạo gấp, chọn robot.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toHaveAttribute('aria-describedby', 'create-tour-missing')
    await screen.findByRole('option', { name: 'AMR 01 · amr-01' })
    fireEvent.change(screen.getByLabelText('Robot'), { target: { value: 'amr-01' } })
    fireEvent.change(screen.getByLabelText(/Lý do tạo gấp/), { target: { value: 'Đoàn khách.' } })
    expect(screen.queryByText(/^Cần:/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).not.toHaveAttribute('aria-describedby')
  })

  it('previews the expected duration and robot hold the server would give a quick Tour created now (B12)', async () => {
    const quick = { expectedDurationSeconds: 1260, startBy: '2099-01-03T01:30:00.000Z', holdStartsAt: '2099-01-03T01:00:00.000Z', holdEndsAt: '2099-01-03T02:06:00.000Z' }
    robotRows = [{ ...BASE_ROBOTS[0], quick }]
    api()
    renderAt('/staff/manage/tours/new?kind=quick')
    await screen.findByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })
    const how = within(screen.getByRole('region', { name: 'Tour nhanh chạy thế nào' }))
    expect(how.queryByText('Thời lượng dự kiến')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })
    expect(await how.findByText(`${formatDuration(1260)} (tự tính từ thời gian dừng và quãng đường)`)).toBeInTheDocument()
    expect(how.getByText(`Bắt đầu trước ${formatTime(quick.startBy)}, giữ robot ${formatTime(quick.holdStartsAt)} - ${formatTime(quick.holdEndsAt)}`, { exact: false })).toBeInTheDocument()
  })

  it('opens the quick form from an old ?kind=short link', async () => {
    api()
    renderAt('/staff/manage/tours/new?kind=short')
    expect(await screen.findByLabelText(/Lý do tạo gấp/)).toBeInTheDocument()
  })

  it('creates a quick Tour through the same create call, with a reason and no date or shift', async () => {
    shortNoticeMinutes = 60
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=quick')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour trình diễn' } })
    await chooseTarget()
    const how = within(await screen.findByRole('region', { name: 'Tour nhanh chạy thế nào' }))
    expect(how.getByText('Ngay khi Tour đã chốt')).toBeInTheDocument()
    expect(await how.findByText('60 phút sau khi tạo')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Ngày tổ chức/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toHaveAccessibleDescription('Cần: nhập lý do tạo gấp.')
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/tours/slots'))).toBe(false)

    fireEvent.change(screen.getByLabelText(/Lý do tạo gấp/), { target: { value: 'Trình diễn cho đoàn khách.' } })
    expect(screen.queryByText(/^Cần:/)).not.toBeInTheDocument()
    // The Tour keeps its own fallback video (group H removed only the POI one); the label says when it is used.
    fireEvent.change(screen.getByLabelText('Video dự phòng khi Tour bị huỷ giữa chừng (không bắt buộc)'), { target: { value: 'https://cdn.example/tour.mp4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'Đã tạo Tour “Tour trình diễn”', detail: 'Robot đã được giữ.' })
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/staff/manage/tours', body: {
      configuration: { name: 'Tour trình diễn', routeRevisionId: 'revision-2', robotCode: 'amr-01', operatorUserId: 'staff-1', capacity: 20,
        scheduledStartAt: null, shortNoticeReason: 'Trình diễn cho đoàn khách.', fallbackVideoUrl: 'https://cdn.example/tour.mp4' } } })
  })

  it('picks the day and shift from the calendar link and warns when the route is over the recommended length', async () => {
    expectedSeconds = 4000
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=normal&date=2099-01-03&shift=S1')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour từ lịch' } })
    expect(screen.getByLabelText(/Ngày tổ chức/)).toHaveValue('03/01/2099')
    await chooseTarget()
    expect(await screen.findByRole('button', { name: /Ca sáng/ })).toHaveAttribute('aria-pressed', 'true')
    const review = screen.getByRole('region', { name: 'Xem lại trước khi tạo' })
    expect(within(review).getByText("Tuyến dài 67 phút, hơn mức khuyến nghị 60 phút. Vẫn tạo được, nhưng nên cân nhắc tuyến ngắn hơn.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ configuration: { scheduledStartAt: '2099-01-03T01:15:00Z' } })
  })

  it('says in Vietnamese, and in the "Cần" list, that the capacity is over the maximum', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=normal&date=2099-01-03&shift=S1')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour đông' } })
    await chooseTarget()
    await screen.findByRole('button', { name: /Ca sáng/ })
    fireEvent.change(screen.getByLabelText(/^Sức chứa/), { target: { value: '21' } })
    expect(screen.getByText('Sức chứa phải từ 1 đến 20 chỗ.')).toBeInTheDocument()
    expect(screen.getByText('Cần: sức chứa từ 1 đến 20 chỗ.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^Sức chứa/), { target: { value: '20' } })
    expect(screen.queryByText('Sức chứa phải từ 1 đến 20 chỗ.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await waitFor(() => expect(writes).toHaveLength(1))
  })

  it('shows a route too long for one shift but does not let it be chosen', async () => {
    api(tour(), [TESTED, { ...TESTED, revisionId: 'revision-long', name: 'Tuyến dài', scheduleFit: 'TOO_LONG_FOR_SHIFT', expectedDurationSeconds: 6000 }])
    renderAt('/staff/manage/tours/new?kind=normal')
    expect(await screen.findByRole('option', { name: 'Tuyến dài · 1 điểm dừng (Quá dài cho 1 ca)' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Tuyến đã duyệt · 1 điểm dừng' })).toBeEnabled()
  })

  it('locks a taken slot with its reason, so it cannot be chosen', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=normal')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour cũ' } })
    await chooseTarget()
    pickDate()
    const locked = await screen.findByRole('button', { name: /Ca chiều 1 · 13:15-14:45/ })
    expect(locked).toBeDisabled()
    expect(locked).toHaveTextContent('Trùng khung giữ robot của Tour Tour chiều')
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeDisabled()
    expect(writes).toHaveLength(0)
  })

  it('refreshes the slots and says why when create is refused, and drops the lost slot from the review', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=normal')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour trễ' } })
    await chooseTarget()
    pickDate()
    fireEvent.click(await screen.findByRole('button', { name: /Ca sáng/ }))
    refuseCreate = 'ROBOT_RESERVATION_CONFLICT'
    slotDay = [{ ...freeSlot, available: false, reasonCode: 'RESERVATION_OVERLAP', reason: 'Trùng khung giữ robot của Tour Tour khác' }, lockedSlot]
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    expect(await screen.findByText(/Robot đã có Tour khác/)).toBeInTheDocument()
    expect(await screen.findByText('Trùng khung giữ robot của Tour Tour khác')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Xem lại trước khi tạo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeDisabled()
    expect(writes).toHaveLength(1)
  })

  // ADR-0062: a route revision with a retired POI takes no new Tour; the server names the POI, so its words are kept.
  it('shows ROUTE_HAS_RETIRED_POI with the POI the server names when create is refused', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new?kind=normal')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour POI' } })
    await chooseTarget()
    pickDate()
    fireEvent.click(await screen.findByRole('button', { name: /Ca sáng/ }))
    refuseCreate = 'ROUTE_HAS_RETIRED_POI'
    refuseMessage = 'Tuyến có POI đã ngưng dùng: Thư viện. Lưu phiên bản tuyến mới không có POI này, hoặc dùng lại POI.'
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    expect(await screen.findByText(refuseMessage)).toBeInTheDocument()
    expect(writes).toHaveLength(1)
    expect(tourError(new ApiError(409, JSON.stringify({ errors: { code: 'ROUTE_HAS_RETIRED_POI' } }))))
      .toBe('Tuyến có POI đã ngưng dùng. Lưu phiên bản tuyến mới không có POI này, hoặc dùng lại POI.')
  })

  it('warns on a Tour still to run whose route has a retired POI', async () => {
    api({ ...versionedTour, routeRevision: { ...TESTED, retiredPoiNames: ['Thư viện'] } as unknown as TourDetails['routeRevision'] })
    renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText('Tuyến của Tour này có POI đã ngưng dùng: Thư viện.')).toBeInTheDocument()
  })

  it('edits only metadata when schedule and Route are locked, keeping the unchanged past schedule', async () => {
    const writes = api(tour({ permissions: { canEditMetadata: true, canChangeScheduleAndRoute: false, canCancel: true } }))
    renderAt('/staff/manage/tours/tour-1/edit')
    const name = await screen.findByLabelText('Tên Tour')
    expect(screen.getByLabelText(/Thời gian dự kiến/)).toBeDisabled()
    expect(screen.getByLabelText('Tuyến')).toBeDisabled()
    fireEvent.change(name, { target: { value: 'Tên mới' } })
    await screen.findByText('1. POI 1')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ method: 'PUT', path: '/api/staff/manage/tours/tour-1', body: {
      expectedRowVersion: ROW_VERSION, expectedRouteVersion: null,
      configuration: { name: 'Tên mới', routeId: 'route-1', scheduledStartAt: '2020-01-01T02:00:00.000Z' },
    } })
  })

  it('cancels with a required reason and the opened row version', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/tour-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy Tour' }))
    const dialog = await screen.findByRole('dialog', { name: 'Hủy Tour?' })
    const confirm = within(dialog).getByRole('button', { name: 'Hủy Tour' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/Lý do hủy/), { target: { value: 'Trường đổi lịch' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.title).toContain('Đã hủy Tour'))
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/staff/manage/tours/tour-1/cancel', body: { expectedRowVersion: ROW_VERSION, reason: 'Trường đổi lịch' } })
  })

  it('does not offer READY transitions that the live API does not provide', async () => {
    api()
    renderAt('/staff/manage/tours/tour-1')
    await screen.findByRole('heading', { name: 'Tour sáng thứ Bảy' })
    expect(screen.queryByRole('button', { name: /Chốt/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mở lại/ })).toBeNull()
  })
})
