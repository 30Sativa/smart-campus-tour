import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageDashboardPage from './StaffManageDashboardPage'
import StaffManagePoisPage from './StaffManagePoisPage'
import StaffManageTourListPage from './StaffManageTourListPage'
import type { PoiProposal } from '../../../features/technical/api/technical'
import { OCCUPANCY_MAPS } from '../../../features/administration/pois/map/catalog'
import { useAuthStore } from '../../../stores/auth-store'

const clients: QueryClient[] = []
const requests: URL[] = []
let failRegistrations = false
const proposal = (id: string, mapVersionId: string, mapKey: string, name: string): PoiProposal => ({
  id, currentRevision: 1, rowVersion: 'version', revision: { id: `${id}-rev`, revisionNumber: 1, mapVersionId, mapKey, name, purpose: 'Tham quan', description: null, narrationText: null, fallbackVideoUrl: null,
    x: 0, y: 0, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-30T00:00:00Z', isSubmitted: true, submittedAt: '2026-10-30T00:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: null },
})
const proposals = [proposal('poi-a', 'map-a', OCCUPANCY_MAPS[0].mapKey, 'Điểm A'), proposal('poi-b', 'map-b', OCCUPANCY_MAPS[1].mapKey, 'Điểm B')]
function respond(data: unknown, total?: number) {
  return new Response(JSON.stringify({ success: true, data, ...(total == null ? {} : { pagination: { page: 1, pageSize: 5, totalItems: total, totalPages: Math.ceil(total / 5) } }) }), { status: 200 })
}
function show(element: React.ReactNode, path = '/staff/manage') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  requests.length = 0; failRegistrations = false
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-ui', username: 'staff', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'https://api.example.test'); requests.push(url)
    if (url.pathname === '/api/staff/poi-proposals') return respond(proposals)
    if (url.pathname === '/api/staff/manage/tours') return respond([], url.searchParams.get('state') === 'READY' ? 12 : 37)
    if (url.pathname === '/api/staff/manage/registrations') {
      if (failRegistrations) return new Response('{}', { status: 503 })
      return respond([], 23)
    }
    throw new Error(`Unexpected endpoint: ${url.pathname}`)
  }))
})
afterEach(() => {
  clients.splice(0).forEach(client => client.clear())
  useAuthStore.getState().logout()
  vi.unstubAllGlobals()
})

describe('staff preparation UI', () => {
  it('uses API totals rather than the number of rows in a dashboard preview', async () => {
    show(<StaffManageDashboardPage />)
    const kpis = screen.getByRole('region', { name: 'Số liệu chuẩn bị' })
    expect(await within(kpis).findByText('37')).toBeInTheDocument()
    expect(await within(kpis).findByText('23')).toBeInTheDocument()
    expect(await within(kpis).findByText('12')).toBeInTheDocument()
    expect(requests.some(url => url.searchParams.get('state') === 'SUBMITTED')).toBe(true)
  })

  it('keeps failed registration totals unknown while other dashboard sections load', async () => {
    failRegistrations = true
    show(<StaffManageDashboardPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được đăng ký chờ duyệt.')
    const pending = screen.getByRole('link', { name: /Đoàn chờ duyệt/ })
    expect(pending).toHaveTextContent('-')
    expect(pending).toHaveTextContent('Không tải được')
    expect(await screen.findByText('37')).toBeInTheDocument()
  })

  it('keeps POI rows and map markers on the selected map version and explains empty filters', async () => {
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const picker = await screen.findByRole('combobox', { name: 'Bản đồ / Phiên bản' })
    const list = screen.getByRole('region', { name: 'Danh sách đề xuất POI' })
    expect(within(list).getByText('Điểm A')).toBeInTheDocument()
    expect(within(list).queryByText('Điểm B')).not.toBeInTheDocument()
    fireEvent.change(picker, { target: { value: 'map-b' } })
    expect(within(list).getByText('Điểm B')).toBeInTheDocument()
    expect(within(list).queryByText('Điểm A')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: `Bản đồ ${OCCUPANCY_MAPS[1].mapKey} với 1 POI` })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm POI' }), { target: { value: 'không tồn tại' } })
    expect(within(list).getByText('Không có POI khớp bộ lọc')).toBeInTheDocument()
    const map = screen.getByRole('img', { name: `Bản đồ ${OCCUPANCY_MAPS[1].mapKey} với 0 POI` })
    expect(map.getAttribute('viewBox')).not.toMatch(/Infinity|NaN/)
  })

  it('honors the READY dashboard link when opening the Tour list', async () => {
    show(<StaffManageTourListPage />, '/staff/manage/tours?state=READY')
    expect(screen.getByRole('combobox', { name: 'Trạng thái Tour' })).toHaveValue('READY')
    await screen.findByText('Chưa có Tour phù hợp')
    expect(requests.some(url => url.pathname.endsWith('/tours') && url.searchParams.get('state') === 'READY')).toBe(true)
  })
})
