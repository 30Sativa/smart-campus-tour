import { ApiError } from '../../../api/client'
import { tourError } from './tour-messages'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useToastStore } from '../../../components/ui/toast-store'
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
  await screen.findByRole('option', { name: 'Tuyến đã duyệt · phiên bản 3 · 1 điểm dừng' })
  fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })
  await screen.findByRole('option', { name: 'AMR 01 · amr-01' })
  fireEvent.change(screen.getByLabelText('Robot'), { target: { value: 'amr-01' } })
  await screen.findByRole('option', { name: 'Lan Staff · lan' })
  fireEvent.change(screen.getByLabelText('Người vận hành'), { target: { value: 'staff-1' } })
}
const pickDate = () => fireEvent.change(screen.getByLabelText(/Ngày tổ chức/), { target: { value: '2099-01-03' } })
// docs/lich-tour-theo-ca.md §3: the morning shift holds the robot 08:00-10:00 and the Tour starts at 08:15.
const freeSlot = { time: '08:15', startsAt: '2099-01-03T01:15:00Z', available: true, reasonCode: null, reason: null,
  reservationStartsAt: '2099-01-03T01:00:00Z', reservationEndsAt: '2099-01-03T03:00:00Z', registrationClosesAt: '2099-01-01T01:15:00Z',
  shiftCode: 'S1', shiftName: 'Ca sáng', maxDurationSeconds: 5400 }
const lockedSlot = { ...freeSlot, time: '13:15', startsAt: '2099-01-03T06:15:00Z', reservationStartsAt: '2099-01-03T06:00:00Z', reservationEndsAt: '2099-01-03T08:00:00Z',
  shiftCode: 'S2', shiftName: 'Ca chiều 1', available: false, reasonCode: 'RESERVATION_OVERLAP', reason: 'Trùng khung giữ robot của Tour Tour chiều' }
let slotDay = [freeSlot, lockedSlot]
let expectedSeconds = 1320
let refuseCreate: string | null = null

function api(detail: TourDetails = tour(), testedRoutes: unknown[] = [TESTED, { ...TESTED, revisionId: 'revision-untested', name: 'Chưa đạt', verificationStatus: 'NOT_TESTED' }]) {
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const path = url.pathname
    const method = init?.method ?? 'GET'
    if (path === '/api/staff/manage/tours/slots') return Promise.resolve(json({ success: true, data: { routeRevisionId: 'revision-2', robotCode: 'amr-01',
      measuredDurationSeconds: 1200, expectedDurationSeconds: expectedSeconds, recommendedMaxSeconds: 3600,
      days: [{ date: '2099-01-03', slots: slotDay }] } }))
    if (method !== 'GET') {
      writes.push({ method, path, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      if (refuseCreate) return Promise.resolve(json({ success: false, message: 'x', errors: { code: refuseCreate } }, 409))
      return Promise.resolve(json({ success: true, data: { id: 'tour-1' } }))
    }
    if (path === '/api/routes') return Promise.resolve(json({ data: testedRoutes, pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } }))
    if (path === '/api/staff/manage/tours/robots') return Promise.resolve(json({ success: true, data: [
      { robotCode: 'amr-01', displayName: 'AMR 01', usable: true, blockReason: null },
      { robotCode: 'amr-02', displayName: 'AMR 02', usable: false, blockReason: 'Robot chưa xác nhận kết nối.' },
    ] }))
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
beforeEach(() => { slotDay = [freeSlot, lockedSlot]; expectedSeconds = 1320; refuseCreate = null })
beforeEach(() => useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'admin', username: 'admin', role: 'Admin' } }))
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

it('offers only robots the chosen route can use, and says why the others are off', async () => {
  api()
  renderAt('/staff/manage/tours/new')
  await screen.findByRole('option', { name: 'Tuyến đã duyệt · phiên bản 3 · 1 điểm dừng' })
  expect(screen.getByLabelText('Robot')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })

  expect(await screen.findByRole('option', { name: 'AMR 01 · amr-01' })).toBeEnabled()
  expect(screen.getByRole('option', { name: 'AMR 02 · amr-02 (Robot chưa xác nhận kết nối.)' })).toBeDisabled()
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
    renderAt('/staff/manage/tours/new')
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
    renderAt('/staff/manage/tours/new')
    await waitFor(() => expect(requested.find(url => url.pathname === '/api/routes')?.searchParams.get('isActive')).toBe('true'))
  })

  it('explains a robot clash instead of a concurrency message', () => {
    const refusal = new ApiError(409, JSON.stringify({ message: 'x', errors: { code: 'ROBOT_RESERVATION_CONFLICT' } }))
    expect(tourError(refusal)).toContain('Robot đã có Tour khác')
  })

  it('shows only tested revisions and reports when none exists', async () => {
    api(tour(), [])
    renderAt('/staff/manage/tours/new')
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
    expect(screen.getByLabelText('Tuyến')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tên mới' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ expectedRouteVersion: null, configuration: { name: 'Tên mới', routeId: 'route-1' } })
  })

  it('creates a SCHEDULED Tour from an active Route with its revision and an idempotency key', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour sáng thứ Bảy' } })
    await chooseTarget()
    expect(await screen.findByText('1. Thư viện')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo Tour' })).toBeDisabled()
    pickDate()
    // Shifts only: no typed time any more (docs/lich-tour-theo-ca.md §3).
    expect(await screen.findByRole('button', { name: /Ca sáng · 08:15-09:45 · Giữ robot 08:00-10:00/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Giờ khác/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ca sáng/ }))
    const review = screen.getByRole('region', { name: 'Xem lại trước khi tạo' })
    expect(within(review).getByText('22 phút')).toBeInTheDocument()
    expect(within(review).getByText('08:00 - 10:00')).toBeInTheDocument()
    expect(within(review).getByText('08:15 01/01/2099')).toBeInTheDocument()
    expect(within(review).queryByText(/mức khuyến nghị/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await screen.findByRole('heading', { name: 'Tour sáng thứ Bảy' })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/staff/manage/tours', body: {
      configuration: { name: 'Tour sáng thứ Bảy', description: null, routeRevisionId: 'revision-2', robotCode: 'amr-01', operatorUserId: 'staff-1', scheduledStartAt: '2099-01-03T01:15:00Z', fallbackVideoUrl: null },
    } })
    expect(writes[0].body.requestId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
  })

  it('picks the day and shift from the calendar link and warns when the route is over the recommended length', async () => {
    expectedSeconds = 4000
    const writes = api()
    renderAt('/staff/manage/tours/new?date=2099-01-03&shift=S1')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour từ lịch' } })
    expect(screen.getByLabelText(/Ngày tổ chức/)).toHaveValue('2099-01-03')
    await chooseTarget()
    expect(await screen.findByRole('button', { name: /Ca sáng/ })).toHaveAttribute('aria-pressed', 'true')
    const review = screen.getByRole('region', { name: 'Xem lại trước khi tạo' })
    expect(within(review).getByText("Tuyến dài 66 phút 40 giây, hơn mức khuyến nghị 60 phút. Vẫn tạo được, nhưng nên cân nhắc tuyến ngắn hơn.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].body).toMatchObject({ configuration: { scheduledStartAt: '2099-01-03T01:15:00Z' } })
  })

  it('shows a route too long for one shift but does not let it be chosen', async () => {
    api(tour(), [TESTED, { ...TESTED, revisionId: 'revision-long', name: 'Tuyến dài', scheduleFit: 'TOO_LONG_FOR_SHIFT', expectedDurationSeconds: 6000 }])
    renderAt('/staff/manage/tours/new')
    expect(await screen.findByRole('option', { name: 'Tuyến dài · phiên bản 3 · 1 điểm dừng (Quá dài cho 1 ca)' })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Tuyến đã duyệt · phiên bản 3 · 1 điểm dừng' })).toBeEnabled()
  })

  it('locks a taken slot with its reason, so it cannot be chosen', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new')
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
    renderAt('/staff/manage/tours/new')
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
