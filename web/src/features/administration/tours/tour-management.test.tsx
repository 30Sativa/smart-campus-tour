import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      updatedAt: null, rowVersion: ROW_VERSION, registrationCount: 0, invitationCount: 0 },
    route: ROUTE, activeRoute: ROUTE, fallbackVideoUrl: null, startedAt: null, endedAt: null, endReason: null,
    usage: { hasRegistrations: false, hasAllowedBranches: false, hasOperationalHistory: false, hasRobotOwnership: false },
    permissions: { canEditMetadata: true, canChangeScheduleAndRoute: true, canCancel: true }, ...overrides,
  }
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

/** Serves the Route and Tour reads; records every write. */
function api(detail: TourDetails = tour()) {
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      writes.push({ method, path, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return Promise.resolve(json({ success: true, data: { id: 'tour-1' } }))
    }
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
  it('creates a SCHEDULED Tour from an active Route with its revision and an idempotency key', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour sáng thứ Bảy' } })
    fireEvent.change(screen.getByLabelText(/Thời gian dự kiến/), { target: { value: '2099-01-03T09:00' } })
    await screen.findByRole('option', { name: 'Tuyến thử · 1 điểm dừng' })
    fireEvent.change(screen.getByLabelText('Tuyến'), { target: { value: 'route-1' } })
    expect(await screen.findByText('1. POI 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo Tour' }))
    await screen.findByRole('heading', { name: 'Tour sáng thứ Bảy' })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/staff/manage/tours', body: {
      expectedRouteVersion: ROUTE_VERSION,
      configuration: { name: 'Tour sáng thứ Bảy', description: null, routeId: 'route-1', scheduledStartAt: new Date('2099-01-03T09:00').toISOString(), fallbackVideoUrl: null },
    } })
    expect(writes[0].body.requestId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
  })

  it('refuses a past schedule before calling the API', async () => {
    const writes = api()
    renderAt('/staff/manage/tours/new')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour cũ' } })
    fireEvent.change(screen.getByLabelText(/Thời gian dự kiến/), { target: { value: '2020-01-01T09:00' } })
    await screen.findByRole('option', { name: 'Tuyến thử · 1 điểm dừng' })
    fireEvent.change(screen.getByLabelText('Tuyến'), { target: { value: 'route-1' } })
    await screen.findByText('1. POI 1')
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
    expect(await screen.findByText(/Đã hủy Tour/)).toBeInTheDocument()
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
