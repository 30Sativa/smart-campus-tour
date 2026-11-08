import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageRouteCatalogPage from '../../../routes/staff/manage/StaffManageRouteCatalogPage'
import StaffManageRouteDetailsPage from '../../../routes/staff/manage/StaffManageRouteDetailsPage'
import { ApiError } from '../../../api/client'
import { useAuthStore } from '../../../stores/auth-store'
import { routeAvailabilityError } from './route-messages'

const route = (overrides: object) => ({ routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 2, name: 'Tuyến Thư viện', mapKey: 'map1', isSubmitted: true, verificationStatus: 'PASS',
  stops: [], revisionHistory: [], eligibilityIssues: [], isActive: true, rowVersion: 'a'.repeat(64), ...overrides })
const SCHEDULED = [{ id: 'tour-9', name: 'Tour sáng thứ Bảy', scheduledStartAt: '2099-01-03T02:00:00Z', state: 'SCHEDULED' }]

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const page = (data: unknown[]) => json({ success: true, data, pagination: { page: 1, pageSize: 100, totalItems: data.length, totalPages: 1 } })
let writes: { path: string; body: Record<string, unknown> }[] = []
let refuseWrite: Response | null = null
let reads: URL[] = []

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><StaffManageRouteCatalogPage /></MemoryRouter></QueryClientProvider>)
}
function showDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/manage/routes/route-1']}><Routes>
    <Route path="/staff/manage/routes/:routeId" element={<StaffManageRouteDetailsPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
const DETAIL = route({ mapVersionId: 'map-1', startX: 0, startY: 0, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, testRuns: [], effectiveTestRunId: null,
  revisionHistory: [{ revisionId: 'rev-1', revisionNumber: 2, isSubmitted: true, verificationStatus: 'PASS', createdAt: '2026-11-01T02:00:00Z' }] })

beforeEach(() => {
  writes = []; refuseWrite = null; reads = []
  useAuthStore.getState().setAuth('test-token', { userId: 'staff', username: 'staff', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://api.example.test')
    if (init?.method === 'POST') {
      writes.push({ path: url.pathname, body: JSON.parse(String(init.body)) as Record<string, unknown> })
      if (refuseWrite) return refuseWrite
      return json({ success: true, data: { routeId: 'route-1', isActive: url.pathname.endsWith('/activate'), scheduledTours: SCHEDULED } })
    }
    reads.push(url)
    if (url.pathname === '/api/routes') return page(url.searchParams.get('isActive') === 'true' ? [route({})] : [route({ routeId: 'route-2', name: 'Tuyến cũ', isActive: false })])
    if (url.pathname === '/api/staff/routes/route-1/scheduled-tours') return json({ success: true, data: SCHEDULED })
    if (url.pathname === '/api/routes/route-1/revisions') return json({ success: true, data: DETAIL })
    if (url.pathname === '/api/maps/versions') return json({ success: true, data: [] })
    throw new Error(`Unexpected endpoint: ${url.pathname}`)
  }))
})
afterEach(() => { useAuthStore.getState().logout(); vi.unstubAllGlobals() })

describe('Versioned route availability', () => {
  it('lists routes in use by default and switches to stopped routes', async () => {
    show()
    expect(await screen.findByText('Tuyến Thư viện')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đang sử dụng' })).toHaveAttribute('aria-pressed', 'true')
    expect(reads[0].searchParams.get('isActive')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng', pressed: false }))
    expect(await screen.findByText('Tuyến cũ')).toBeInTheDocument()
    expect(screen.queryByText('Tuyến Thư viện')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở lại' })).toBeInTheDocument()
  })

  it('offers stopping a route on its detail page, not on the catalog card', async () => {
    show()
    await screen.findByText('Tuyến Thư viện')
    expect(within(screen.getByRole('article')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('confirms with the scheduled Tours linked before stopping a route', async () => {
    showDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng sử dụng' }))
    const dialog = await screen.findByRole('dialog')
    const link = await within(dialog).findByRole('link', { name: 'Tour sáng thứ Bảy' })
    expect(link).toHaveAttribute('href', '/staff/manage/tours/tour-9')
    expect(writes).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ngừng sử dụng' }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].path).toBe('/api/staff/routes/route-1/deactivate')
    expect(writes[0].body).toMatchObject({ expectedRowVersion: 'a'.repeat(64) })
    expect(writes[0].body.requestId).toEqual(expect.any(String))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog and shows the backend reason when stopping is refused', async () => {
    refuseWrite = json({ success: false, message: 'Tuyến vừa được thay đổi. Tải lại danh sách rồi thử lại.', errors: { code: 'STALE_ROUTE' } }, 409)
    showDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng sử dụng' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByRole('link', { name: 'Tour sáng thứ Bảy' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ngừng sử dụng' }))
    expect(await within(dialog).findByText('Tuyến vừa được thay đổi. Tải lại danh sách rồi thử lại.')).toBeInTheDocument()
  })

  it('reopens a stopped route without a confirmation step', async () => {
    show()
    await screen.findByText('Tuyến Thư viện')
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng', pressed: false }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mở lại' }))
    await waitFor(() => expect(writes[0]?.path).toBe('/api/staff/routes/route-2/activate'))
    expect(await screen.findByText('Đã mở lại tuyến Tuyến cũ.')).toBeInTheDocument()
  })

  it('falls back to a plain message when an availability call meets an empty 404', () => {
    expect(routeAvailabilityError(new ApiError(404, ''))).toBe('Không kết nối được chức năng này, có thể máy chủ chưa cập nhật.')
    expect(routeAvailabilityError(new ApiError(404, JSON.stringify({ message: 'Không tìm thấy tuyến.' })))).toBe('Không tìm thấy tuyến.')
  })
})
