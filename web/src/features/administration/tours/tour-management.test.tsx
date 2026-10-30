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
  reservation: { robotCode: 'amr-01', startsAt: '2099-01-03T01:45:00Z', endsAt: '2099-01-03T02:22:00Z', measuredDurationSeconds: 420, releasedAt: null },
  permissions: { canEditMetadata: true, canChangeScheduleAndRoute: true, canCancel: true } })
const chooseTarget = async () => {
  await screen.findByRole('option', { name: 'Tuyến đã duyệt · phiên bản 3 · 1 điểm dừng' })
  fireEvent.change(screen.getByLabelText('Tuyến đã kiểm chứng'), { target: { value: 'revision-2' } })
  await screen.findByRole('option', { name: 'AMR 01 · amr-01' })
  fireEvent.change(screen.getByLabelText('Robot'), { target: { value: 'amr-01' } })
  await screen.findByRole('option', { name: 'Lan Staff · lan' })
  fireEvent.change(screen.getByLabelText('Người vận hành'), { target: { value: 'staff-1' } })
}

function api(detail: TourDetails = tour(), testedRoutes: unknown[] = [TESTED, { ...TESTED, revisionId: 'revision-untested', name: 'Chưa đạt', verificationStatus: 'NOT_TESTED' }]) {
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      writes.push({ method, path, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return Promise.resolve(json({ success: true, data: { id: 'tour-1' } }))
    }
    if (path === '/api/routes') return Promise.resolve(json({ data: testedRoutes, pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } }))
    if (path === '/api/technical/physical-robots') return Promise.resolve(json({ success: true, data: [{ id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01' }] }))
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
beforeEach(() => useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'admin', username: 'admin', role: 'Admin' } }))
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('live Tour management', () => {
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
    fireEvent.change(screen.getByLabelText(/Thời gian dự kiến/), { target: { value: '2099-01-03T09:00' } })
    await chooseTarget()
    expect(await screen.findByText('1. Thư viện')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await screen.findByRole('heading', { name: 'Tour sáng thứ Bảy' })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/staff/manage/tours', body: {
      configuration: { name: 'Tour sáng thứ Bảy', description: null, routeRevisionId: 'revision-2', robotCode: 'amr-01', operatorUserId: 'staff-1', scheduledStartAt: new Date('2099-01-03T09:00').toISOString(), fallbackVideoUrl: null },
    } })
    expect(writes[0].body.requestId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
  })

  it('refuses a past schedule before calling the API', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour cũ' } })
    fireEvent.change(screen.getByLabelText(/Thời gian dự kiến/), { target: { value: '2020-01-01T09:00' } })
    await chooseTarget()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    expect(await screen.findByText('Giờ dự kiến phải ở tương lai.')).toBeInTheDocument()
    expect(writes).toHaveLength(0)
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
