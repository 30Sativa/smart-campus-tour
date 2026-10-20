import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminRouteCatalogPage from '../../../routes/admin/AdminRouteCatalogPage'
import AdminRouteDetailsPage from '../../../routes/admin/AdminRouteDetailsPage'
import AdminRouteFormPage from '../../../routes/admin/AdminRouteFormPage'
import { useAuthStore } from '../../../stores/auth-store'
import type { RouteDetails } from './types'

const VERSION = 'A'.repeat(64)
const POIS = [1, 2].map(i => ({ id: `poi-${i}`, name: `POI ${i}`, mapKey: 'map2-v1', mapFrame: 'map', x: i, y: -i, yaw: 0, isActive: true }))
function route(overrides: Partial<RouteDetails> = {}): RouteDetails {
  return {
    id: 'route-1', name: 'Tuyến thử', description: null, mapKey: 'map2-v1', mapFrame: 'map', isActive: false,
    createdAt: '2026-10-19T00:00:00Z', updatedAt: null, stopCount: 2, version: VERSION,
    startX: 1, startY: -1, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null,
    stops: POIS.map((p, i) => ({ id: `stop-${i}`, poiId: p.id, poiName: p.name, stopOrder: i + 1, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 30 }] })),
    usage: { hasReferences: false, hasReadyOrRunningTours: false, canEditConfiguration: true, canEditMetadataAndAvailability: true, canDelete: true },
    configurationIssues: [], availabilityIssues: [], ...overrides,
  }
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}
function detail(data = route()) { return response({ success: true, data }) }
function api(handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname
    if (path === '/api/admin/pois') return Promise.resolve(response({ data: POIS, pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 } }))
    return Promise.resolve(handler(path, init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin/routes" element={<AdminRouteCatalogPage />} />
    <Route path="/admin/routes/new" element={<AdminRouteFormPage />} />
    <Route path="/admin/routes/:routeId" element={<AdminRouteDetailsPage />} />
    <Route path="/admin/routes/:routeId/edit" element={<AdminRouteFormPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'test-token', user: { userId: 'admin', username: 'admin', role: 'Admin' } }))
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('live Route management', () => {
  it('opens the create Route form from the catalog without loading the removed preview', async () => {
    api(() => response({ data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }))
    renderAt('/admin/routes')
    expect(await screen.findByText('Chưa có tuyến phù hợp')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Tạo tuyến' }))
    expect(await screen.findByRole('heading', { name: 'Tạo tuyến' })).toBeInTheDocument()
  })

  it('creates an inactive Route from real API POIs and sends the edited stop order without fixture fields', async () => {
    let posted: Record<string, unknown> | undefined
    api((_, init) => {
      if (init?.method === 'POST') { posted = JSON.parse(String(init.body)) as typeof posted; return response({ data: { id: 'route-1' } }) }
      return detail()
    })
    renderAt('/admin/routes/new')
    fireEvent.change(screen.getByLabelText('Tên tuyến'), { target: { value: 'Tuyến đầu tiên' } })
    await screen.findByRole('option', { name: 'map2-v1 / map · 2 POI' })
    fireEvent.change(screen.getByLabelText('Map'), { target: { value: JSON.stringify(['map2-v1', 'map']) } })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }))
    fireEvent.click(screen.getByLabelText('Chọn POI 1'))
    fireEvent.click(screen.getByLabelText('Chọn POI 2'))
    expect(screen.getByRole('button', { name: 'Tiếp →' })).toBeDisabled()
    for (const i of [1, 2]) {
      fireEvent.change(screen.getByLabelText(`Thời gian dừng ${i} (giây)`), { target: { value: '30' } })
      fireEvent.change(screen.getByLabelText(`Giữ ${i}.1 (giây)`), { target: { value: '30' } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Đưa POI 2 lên' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }))
    expect(screen.getByLabelText('Start x (m)')).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('Lấy pose từ POI'), { target: { value: 'poi-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp →' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tuyến' }))
    await screen.findByRole('heading', { name: 'Tuyến thử' })
    expect(posted).toMatchObject({ name: 'Tuyến đầu tiên', mapKey: 'map2-v1', mapFrame: 'map', startX: 1, startY: -1, endMode: 'LAST_POI', endX: null })
    expect(posted?.stops).toEqual([
      { poiId: 'poi-2', dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 30 }] },
      { poiId: 'poi-1', dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 30 }] },
    ])
    expect(posted).not.toHaveProperty('isActive')
    expect(screen.getByText(/Không khả dụng cho lựa chọn mới/)).toBeInTheDocument()
  })

  it('retains a draft after a stale SQL revision conflict and never automatically retries the write', async () => {
    const fetchMock = api((_, init) => init?.method === 'PUT'
      ? response({ success: false, errors: { code: 'STALE_ROUTE' } }, 409) : detail())
    renderAt('/admin/routes/route-1/edit')
    const name = await screen.findByLabelText('Tên tuyến')
    fireEvent.change(name, { target: { value: 'Nội dung chưa lưu' } })
    fireEvent.click(screen.getByRole('button', { name: /Xem lại & lưu/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tuyến' }))
    expect(await screen.findByText(/^Tuyến đã thay đổi/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Thông tin & map/ }))
    expect(screen.getByLabelText('Tên tuyến')).toHaveValue('Nội dung chưa lưu')
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
    expect(writes).toHaveLength(1)
    expect(JSON.parse(String(writes[0][1]?.body))).toMatchObject({ expectedVersion: VERSION, configuration: { name: 'Nội dung chưa lưu' } })
  })

  it('freezes a referenced itinerary and deletion while allowing metadata correction', async () => {
    api(() => detail(route({ usage: { hasReferences: true, hasReadyOrRunningTours: false, canEditConfiguration: false, canEditMetadataAndAvailability: true, canDelete: false } })))
    renderAt('/admin/routes/route-1/edit')
    expect(await screen.findByLabelText('Tên tuyến')).toBeEnabled()
    expect(await screen.findByLabelText('Map')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Điểm dừng/ }))
    expect(screen.getByRole('button', { name: 'Đưa POI 2 lên' })).toBeDisabled()
  })

  it('copies a referenced active Route into a new editable configuration using POST with no source identities', async () => {
    let posted: Record<string, unknown> | undefined
    api((_, init) => {
      if (init?.method === 'POST') { posted = JSON.parse(String(init.body)) as typeof posted; return response({ data: { id: 'route-2' } }) }
      return detail(route({ isActive: true, usage: { hasReferences: true, hasReadyOrRunningTours: true, canEditConfiguration: false, canEditMetadataAndAvailability: false, canDelete: false } }))
    })
    renderAt('/admin/routes/new?copyFrom=route-1')
    expect(await screen.findByLabelText('Tên tuyến')).toHaveValue('Tuyến thử (bản sao)')
    expect(await screen.findByLabelText('Map')).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /Xem lại & lưu/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tuyến' }))
    await waitFor(() => expect(posted).toBeDefined())
    expect(posted).not.toHaveProperty('id')
    expect(posted).not.toHaveProperty('isActive')
    expect(posted).not.toHaveProperty('expectedVersion')
    expect(posted?.stops).toEqual(route().stops.map(({ poiId, dwellSeconds, headSteps }) => ({ poiId, dwellSeconds, headSteps })))
  })

  it('shows API failure with retry and never serves prepared-route demo data', async () => {
    const fetchMock = api(() => response({ success: false }, 500))
    renderAt('/admin/routes')
    expect(await screen.findByText('Máy chủ chưa xử lý được yêu cầu. Hãy thử lại.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('confirms availability changes and sends the latest detail revision', async () => {
    const fetchMock = api((_, init) => init?.method === 'POST' ? response({ success: true }) : detail())
    renderAt('/admin/routes/route-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Cho phép sử dụng' }))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }))
    await screen.findByText('Đã cho phép chọn tuyến cho Tour mới.')
    const write = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(String(write[0])).toContain('/api/admin/routes/route-1/activate')
    expect(JSON.parse(String(write[1]?.body))).toEqual({ expectedVersion: VERSION })
  })
})
