import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageDashboardPage from './StaffManageDashboardPage'
import StaffManagePoisPage from './StaffManagePoisPage'
import StaffManageTourListPage from './StaffManageTourListPage'
import type { PoiProposal } from '../../../features/technical/api/technical'
import { useAuthStore } from '../../../stores/auth-store'

// jsdom has no canvas; the package itself still goes through the real reader.
vi.mock('../../../features/administration/pois/map/versioned-package', async importActual => ({
  ...await importActual<typeof import('../../../features/administration/pois/map/versioned-package')>(),
  rasterPngBlob: vi.fn(async (raster: { width: number }) => new Blob([`png-${raster.width}`], { type: 'image/png' })),
}))

const clients: QueryClient[] = []
const requests: URL[] = []
let failRegistrations = false
let packageFailure: Response | null = null
/** An uploaded package: 10x20 cells of 0.5m with the map origin at (-1, -2). */
const packageZip = (width: number) => zipSync({
  'map.yaml': strToU8('image: map.pgm\nmode: trinary\nresolution: 0.5\norigin: [-1, -2, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n'),
  'map.pgm': strToU8(`P2\n${width} 20\n255\n${Array(width * 20).fill(255).join(' ')}\n`),
})
const mapVersion = (id: string, mapKey: string, currentlyDeployedOn: unknown[]) => ({ map: { id, mapKey, frameId: 'map', imageFileName: 'map.pgm', packageSha256: 'a'.repeat(64), areaName: mapKey, versionNumber: 1 }, currentlyDeployedOn })
const proposal = (id: string, mapVersionId: string, mapKey: string, name: string): PoiProposal => ({
  id, currentRevision: 1, rowVersion: 'version', revision: { id: `${id}-rev`, revisionNumber: 1, mapVersionId, mapKey, name, purpose: 'Tham quan', description: null, narrationText: null, fallbackVideoUrl: null,
    x: 0, y: 0, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-30T00:00:00Z', isSubmitted: true, submittedAt: '2026-10-30T00:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: null },
})
const proposals = [proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), proposal('poi-b', 'map-b', 'test123-v2', 'Điểm B')]
let proposals = [proposal('poi-a', 'map-a', OCCUPANCY_MAPS[0].mapKey, 'Điểm A'), proposal('poi-b', 'map-b', OCCUPANCY_MAPS[1].mapKey, 'Điểm B')]
const standardProposals = proposals
function respond(data: unknown, total?: number) {
  return new Response(JSON.stringify({ success: true, data, ...(total == null ? {} : { pagination: { page: 1, pageSize: 5, totalItems: total, totalPages: Math.ceil(total / 5) } }) }), { status: 200 })
}
function show(element: React.ReactNode, path = '/staff/manage') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  requests.length = 0; failRegistrations = false; packageFailure = null
  requests.length = 0; failRegistrations = false; proposals = standardProposals
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-ui', username: 'staff', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'https://api.example.test'); requests.push(url)
    if (url.pathname === '/api/staff/poi-proposals') return respond(proposals)
    if (url.pathname === '/api/maps/versions') return respond([mapVersion('map-b', 'test123-v2', [{ robotCode: 'amr-01', checkedAt: '2026-10-30T00:00:00Z' }]), mapVersion('map-a', 'test123-v1', [])])
    if (url.pathname === '/api/maps/versions/map-old') return respond(mapVersion('map-old', 'retired-v1', []))
    if (url.pathname.endsWith('/package')) return packageFailure?.clone() ?? new Response(packageZip(url.pathname.includes('map-b') ? 40 : 10))
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
    expect(await screen.findByRole('img', { name: 'Bản đồ test123-v2 với 1 POI' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm POI' }), { target: { value: 'không tồn tại' } })
    expect(within(list).getByText('Không có POI khớp bộ lọc')).toBeInTheDocument()
    const map = screen.getByRole('img', { name: 'Bản đồ test123-v2 với 0 POI' })
    expect(map.getAttribute('viewBox')).not.toMatch(/Infinity|NaN/)
  })

  it('draws an uploaded map version with POIs placed by its own raster geometry', async () => {
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    await screen.findByLabelText('Đang tải bản đồ')
    const map = await screen.findByRole('img', { name: 'Bản đồ test123-v1 với 1 POI' })
    expect(map.querySelector('image')!.getAttribute('href')).toMatch(/^data:image\/png;base64,/)
    expect(map.querySelector('image')).toHaveAttribute('width', '10')
    // ROS (0, 0) is 1m/2m from the origin: (2, 4) cells, counted up from the 20-cell bottom edge.
    expect(within(map).getByRole('link', { name: /Điểm A/ }).querySelector('circle')).toHaveAttribute('cx', '2')
    expect(within(map).getByRole('link', { name: /Điểm A/ }).querySelector('circle')).toHaveAttribute('cy', '16')
  })

  it('changes the image with the map version and downloads each package once', async () => {
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const first = await screen.findByRole('img', { name: 'Bản đồ test123-v1 với 1 POI' })
    const firstUrl = first.querySelector('image')!.getAttribute('href')!
    const picker = screen.getByRole('combobox', { name: 'Bản đồ / Phiên bản' })
    fireEvent.change(picker, { target: { value: 'map-b' } })
    const second = await screen.findByRole('img', { name: 'Bản đồ test123-v2 với 1 POI' })
    expect(second.querySelector('image')).toHaveAttribute('width', '40')
    expect(second.querySelector('image')!.getAttribute('href')).not.toBe(firstUrl)
    fireEvent.change(picker, { target: { value: 'map-a' } })
    await screen.findByRole('img', { name: 'Bản đồ test123-v1 với 1 POI' })
    expect(requests.filter(url => url.pathname === '/api/maps/versions/map-a/package')).toHaveLength(1)
  })

  it('shows the server message for a failed map download and recovers on retry', async () => {
    packageFailure = new Response(JSON.stringify({ success: false, message: 'Không tìm thấy gói bản đồ.' }), { status: 404 })
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy gói bản đồ.')
    packageFailure = null
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('img', { name: 'Bản đồ test123-v1 với 1 POI' })).toBeInTheDocument()
  })

  it('finds the raster of a proposal whose map version is no longer listed', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => respond([proposal('poi-old', 'map-old', 'retired-v1', 'Điểm cũ')]))
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    expect(await screen.findByRole('img', { name: 'Bản đồ retired-v1 với 1 POI' })).toBeInTheDocument()
    expect(requests.some(url => url.pathname === '/api/maps/versions/map-old/package')).toBe(true)
  })

  it('says there is no map only when no map version is selected', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => respond([]))
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    expect(await screen.findByText('Chưa có bản đồ cho các POI đang lọc.')).toBeInTheDocument()
    expect(requests.some(url => url.pathname.endsWith('/package'))).toBe(false)
  it('marks imported POIs that still need narration and names how they were verified', async () => {
    const imported = proposal('poi-c', 'map-a', OCCUPANCY_MAPS[0].mapKey, 'POI 02')
    proposals = [
      { ...imported, sourcePoiId: 'POI_02', revision: { ...imported.revision, verificationMethod: 'POSE_CAPTURE' } },
      { ...proposal('poi-d', 'map-a', OCCUPANCY_MAPS[0].mapKey, 'Thư viện'), sourcePoiId: 'POI_03', revision: { ...imported.revision, id: 'poi-d-rev', name: 'Thư viện', narrationText: 'Đây là thư viện.', verificationMethod: 'MANUAL_CHECK' } },
    ]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    expect(await screen.findAllByText('POI 02')).not.toHaveLength(0)
    expect(screen.getAllByText('Cần bổ sung nội dung thuyết minh')).toHaveLength(1)
    expect(screen.getByText('Ghi pose trực tiếp trên robot')).toBeInTheDocument()
    expect(screen.getByText('Kiểm tra thủ công')).toBeInTheDocument()
  })

  it('filters POIs to the maps a robot is running, and shows every POI by default', async () => {
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    await screen.findByRole('combobox', { name: 'Bản đồ / Phiên bản' })
    const list = screen.getByRole('region', { name: 'Danh sách đề xuất POI' })
    expect(screen.getByRole('button', { name: 'Tất cả' , pressed: true })).toBeInTheDocument()
    expect(within(list).getByText('Điểm A')).toBeInTheDocument()
    await waitFor(() => expect(requests.some(url => url.pathname === '/api/maps/versions')).toBe(true))
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Trên bản đồ robot đang triển khai' }))
      expect(within(list).getByText('Điểm B')).toBeInTheDocument()
    })
    expect(within(list).queryByText('Điểm A')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Bản đồ / Phiên bản' })).toHaveValue('map-b')
  })

  it('opens the Tour list on upcoming Tours and asks the API for each tab', async () => {
    show(<StaffManageTourListPage />, '/staff/manage/tours')
    expect(screen.getByRole('button', { name: 'Sắp diễn ra' })).toHaveAttribute('aria-pressed', 'true')
    const lastTourRequest = () => requests.filter(url => url.pathname === '/api/staff/manage/tours').at(-1)!.searchParams
    await waitFor(() => expect(lastTourRequest().get('phase')).toBe('UPCOMING'))
    expect(lastTourRequest().get('state')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Đang chạy' }))
    await waitFor(() => expect(lastTourRequest().get('phase')).toBe('RUNNING'))
    fireEvent.click(screen.getByRole('button', { name: 'Đã kết thúc / Đã hủy' }))
    await waitFor(() => expect(lastTourRequest().get('phase')).toBe('FINISHED'))
    expect(lastTourRequest().get('sort')).toBe('-scheduledStartAt')
  })

  it('reaches a Tour past its start that no tab covers through the state filter', async () => {
    show(<StaffManageTourListPage />, '/staff/manage/tours')
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái Tour' }), { target: { value: 'ALL' } })
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('phase')).toBeNull())
    expect(requests.at(-1)!.searchParams.get('state')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sắp diễn ra' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('honors the READY dashboard link when opening the Tour list', async () => {
    show(<StaffManageTourListPage />, '/staff/manage/tours?state=READY')
    expect(screen.getByRole('combobox', { name: 'Trạng thái Tour' })).toHaveValue('READY')
    await screen.findByText('Chưa có Tour phù hợp')
    expect(requests.some(url => url.pathname.endsWith('/tours') && url.searchParams.get('state') === 'READY')).toBe(true)
  })
})
