import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TechnicalMapsPage from '../../routes/technical/TechnicalMapsPage'
import { useAuthStore } from '../../stores/auth-store'
import { useToastStore } from '../../components/ui/toast-store'
import type { MapRetirementImpact, MapVersion, MapVersionItem } from './api/technical'

// ADR-0041: Map Management shows "Đang dùng" and "Ngừng sử dụng"; retiring asks for a reason, lists the routes on the
// version, and names what blocks it with a link to where that is resolved.

const mapVersion = (areaKey: string, areaName: string, versionNumber: number, overrides: Partial<MapVersion> = {}): MapVersion => ({
  id: `${areaKey}-${versionNumber}`, areaKey, areaName, versionNumber, mapKey: `${areaKey}-v${versionNumber}`,
  packageFileName: `${areaKey}-v${versionNumber}.zip`, packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, originX: 0, originY: 0, originYaw: 0, negate: false,
  occupiedThreshold: 0.65, freeThreshold: 0.2, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z',
  status: 'ACTIVE', retiredAt: null, retiredByName: null, retirementReason: null, rowVersion: 'YWN0aXZl', ...overrides,
})
const item = (map: MapVersion): MapVersionItem => ({
  map, latestDeployment: null, technicalCheckStatus: 'PENDING', canUseForPoiPreparation: false,
  preparationBlockReasonCode: 'TECHNICAL_CHECK_PENDING', preparationBlockReason: 'Chưa có kết quả kiểm tra.', preparationEvidence: null,
  currentlyDeployedOn: [], poiClearanceMeters: 0.3, routeMinStops: 2, routeMinStopSeparationMeters: 1,
} as unknown as MapVersionItem)

const emptyImpact = (id: string): MapRetirementImpact => ({ mapVersionId: id, routes: [], assignedRobots: [], pendingPois: [], pendingRoutes: [], upcomingTours: [] })
const envelope = (data: unknown, status = 200, message = 'OK', errors: unknown = null) =>
  new Response(JSON.stringify({ success: status < 400, message, data, errors }), { status, headers: { 'Content-Type': 'application/json' } })

let maps: MapVersionItem[] = []
let impact: MapRetirementImpact
let retireResponse: () => Response
let requests: Array<{ url: URL; init?: RequestInit }> = []

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TechnicalMapsPage /></MemoryRouter></QueryClientProvider>)
}

async function openRetireDialog(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Xem chi tiết ${label}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng phiên bản này' }))
  return screen.findByRole('dialog', { name: `Ngừng sử dụng ${label}?` })
}

describe('Map version retirement', () => {
  beforeEach(() => {
    requests = []
    const tang6 = mapVersion('tang-6', 'Tầng 6', 2)
    maps = [item(tang6), item(mapVersion('tang-6', 'Tầng 6', 1)), item(mapVersion('test123', 'Tầng 6', 1)),
      item(mapVersion('thu-vien', 'Thư viện', 3, { status: 'RETIRED', retiredAt: '2026-11-10T03:00:00Z', retiredByName: 'Kỹ thuật A', retirementReason: 'Quét lại', rowVersion: 'cmV0aXJlZA==' }))]
    impact = { ...emptyImpact(tang6.id), routes: [{ routeId: 'route-1', name: 'Tuyến tầng 6', isActive: true }] }
    retireResponse = () => envelope({ ...tang6, status: 'RETIRED', retiredAt: '2026-11-15T03:00:00Z', retirementReason: 'Quét lại' })
    useToastStore.setState({ toasts: [] })
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return envelope(maps)
      if (url.pathname.endsWith('/retirement-impact')) return envelope(impact)
      if (url.pathname.endsWith('/retire') && init?.method === 'POST') return retireResponse()
      if (url.pathname.endsWith('/reopen') && init?.method === 'POST') return envelope({ ...maps[3].map, status: 'ACTIVE', retiredAt: null })
      if (url.pathname === '/api/technical/physical-robots') return envelope([])
      return envelope(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); useAuthStore.getState().logout() })

  it('splits the page into Đang dùng and Ngừng sử dụng, asking the API for retired versions too', async () => {
    renderPage()
    const active = await screen.findByRole('button', { name: 'Đang dùng' })
    expect(active).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('button', { name: 'Xem chi tiết Tầng 6 · tang-6 · v2' })
    expect(requests.some(request => request.url.pathname === '/api/maps/versions' && request.url.searchParams.get('includeRetired') === 'true')).toBe(true)
    expect(screen.queryByText('Thư viện')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng (1)' }))
    const retired = screen.getByRole('region', { name: 'Phiên bản bản đồ ngừng sử dụng' })
    expect(retired).toHaveTextContent('Thư viện')
        expect(retired).toHaveTextContent('Thư viện · v3')
    expect(retired).toHaveTextContent('Kỹ thuật A')
    expect(retired).toHaveTextContent('Lý do: Quét lại')
  })

  it('shows both the area name and its key on every row, so two "Tầng 6" areas stay apart', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Xem chi tiết Tầng 6 · tang-6 · v2' })
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringMatching(/^Tầng 6 tang-6/), expect.stringMatching(/^Tầng 6 test123/),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng (1)' }))
    expect(screen.getByRole('region', { name: 'Phiên bản bản đồ ngừng sử dụng' })).toHaveTextContent(/Thư viện · v3/)
  })

  it('needs a reason, lists the routes on the version, and posts the reason with the version it saw', async () => {
    renderPage()
    const dialog = await openRetireDialog('Tầng 6 · tang-6 · v2')
    expect(await within(dialog).findByText('1 tuyến dùng phiên bản này, vẫn giữ nguyên:')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Tuyến tầng 6')
    const confirm = within(dialog).getByRole('button', { name: 'Ngừng sử dụng' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Lý do ngừng sử dụng (bắt buộc)'), { target: { value: 'Quét lại' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const post = requests.find(request => request.url.pathname === '/api/technical/map-versions/tang-6-2/retire')!
    expect(JSON.parse(String(post.init?.body))).toEqual({ reason: 'Quét lại', expectedRowVersion: 'YWN0aXZl' })
    expect(useToastStore.getState().toasts[0]?.title).toBe('Đã ngừng sử dụng Tầng 6 · tang-6 · v2')
  })

  it('names each blocker with a link to the robot, the waiting item or the Tour, and keeps the reason and confirm disabled', async () => {
    impact = {
      ...impact,
      assignedRobots: [{ robotId: 'robot-7', robotCode: 'amr_07' }],
      pendingPois: [{ proposalId: 'proposal-1', name: 'Hội trường', revisionNumber: 2 }],
      pendingRoutes: [{ routeId: 'route-2', revisionId: 'revision-2', name: 'Tuyến mới', revisionNumber: 1 }],
      upcomingTours: [{ tourId: 'tour-9', name: 'Tour sáng', scheduledStartAt: '2026-11-20T01:15:00Z', state: 'SCHEDULED' }],
    }
    renderPage()
    const dialog = await openRetireDialog('Tầng 6 · tang-6 · v2')
    const blocked = await within(dialog).findByRole('alert', { name: 'Chưa ngừng được' })
    expect(within(blocked).getByRole('link', { name: 'amr_07' })).toHaveAttribute('href', '/technical/robots?robot=robot-7')
    expect(within(blocked).getByRole('link', { name: 'Hội trường · phiên bản 2' })).toHaveAttribute('href', '/technical/pois')
    expect(within(blocked).getByRole('link', { name: 'Tuyến mới · phiên bản 1' })).toHaveAttribute('href', '/technical/route-tests')
    expect(within(blocked).getByRole('link', { name: 'Tour sáng' })).toHaveAttribute('href', '/staff/manage/tours/tour-9')
    expect(within(dialog).getByLabelText('Lý do ngừng sử dụng (bắt buộc)')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Ngừng sử dụng' })).toBeDisabled()
  })

  it('shows the server refusal and reloads what blocks it when something changed after the dialog opened', async () => {
    retireResponse = () => {
      impact = { ...impact, upcomingTours: [{ tourId: 'tour-3', name: 'Tour vừa tạo', scheduledStartAt: '2026-11-21T01:15:00Z', state: 'SCHEDULED' }] }
      return envelope(null, 409, 'Còn Tour đã lên lịch hoặc sẵn sàng dùng tuyến trên phiên bản này.', { code: 'MAP_VERSION_HAS_UPCOMING_TOURS', blockers: [{ code: 'TOUR', message: 'Tour vừa tạo' }] })
    }
    renderPage()
    const dialog = await openRetireDialog('Tầng 6 · tang-6 · v2')
    await within(dialog).findByText('Tuyến tầng 6')
    fireEvent.change(within(dialog).getByLabelText('Lý do ngừng sử dụng (bắt buộc)'), { target: { value: 'Quét lại' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ngừng sử dụng' }))

    expect(await within(dialog).findByText('Còn Tour đã lên lịch hoặc sẵn sàng dùng tuyến trên phiên bản này.')).toBeInTheDocument()
    expect(await within(dialog).findByRole('link', { name: 'Tour vừa tạo' })).toHaveAttribute('href', '/staff/manage/tours/tour-3')
    expect(within(dialog).getByLabelText('Lý do ngừng sử dụng (bắt buộc)')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Ngừng sử dụng' })).toBeDisabled()
  })

  it('reopens a retired version from the Ngừng sử dụng tab', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng sử dụng (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mở lại Thư viện · v3' }))
    await waitFor(() => expect(requests.some(request => request.url.pathname === '/api/technical/map-versions/thu-vien-3/reopen')).toBe(true))
    const post = requests.find(request => request.url.pathname === '/api/technical/map-versions/thu-vien-3/reopen')!
    expect(JSON.parse(String(post.init?.body))).toEqual({ expectedRowVersion: 'cmV0aXJlZA==' })
  })

  it('falls back to the nearest version still in use when the newest one is retired', async () => {
    maps = [item(mapVersion('tang-6', 'Tầng 6', 2, { status: 'RETIRED', retiredAt: '2026-11-10T03:00:00Z', retirementReason: 'Lỗi' })), item(mapVersion('tang-6', 'Tầng 6', 1))]
    renderPage()
    expect(await screen.findByRole('button', { name: 'Xem chi tiết Tầng 6 · v1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xem chi tiết Tầng 6 · tang-6 · v2' })).not.toBeInTheDocument()
  })
})
