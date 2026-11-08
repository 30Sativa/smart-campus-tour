import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkQueue } from '../../../features/staff/WorkQueue'
import StaffManagePoisPage from './StaffManagePoisPage'
import SchedulePage from '../SchedulePage'
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
const mapVersion = (id: string, mapKey: string, currentlyDeployedOn: unknown[], areaName = mapKey) => ({ map: { id, mapKey, frameId: 'map', imageFileName: 'map.pgm', packageSha256: 'a'.repeat(64), areaName, areaKey: mapKey.replace(/-v\d+$/, ''), versionNumber: 1 }, currentlyDeployedOn })
const proposal = (id: string, mapVersionId: string, mapKey: string, name: string): PoiProposal => ({
  id, currentRevision: 1, rowVersion: 'version', revision: { id: `${id}-rev`, revisionNumber: 1, mapVersionId, mapKey, name, purpose: 'Tham quan', description: null, narrationText: null, fallbackVideoUrl: null,
    x: 0, y: 0, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-30T00:00:00Z', isSubmitted: true, submittedAt: '2026-10-30T00:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: null },
})
let proposals = [proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), proposal('poi-b', 'map-b', 'test123-v2', 'Điểm B')]
const standardProposals = proposals
const standardMaps = [mapVersion('map-b', 'test123-v2', [{ robotCode: 'amr-01', checkedAt: '2026-10-30T00:00:00Z' }]), mapVersion('map-a', 'test123-v1', [])]
let mapVersions = standardMaps
function respond(data: unknown, total?: number) {
  return new Response(JSON.stringify({ success: true, data, ...(total == null ? {} : { pagination: { page: 1, pageSize: 5, totalItems: total, totalPages: Math.ceil(total / 5) } }) }), { status: 200 })
}
function show(element: React.ReactNode, path = '/staff/manage') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  requests.length = 0; failRegistrations = false; packageFailure = null; proposals = standardProposals; mapVersions = standardMaps
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-ui', username: 'staff', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'https://api.example.test'); requests.push(url)
    if (url.pathname === '/api/staff/poi-proposals') return respond(proposals)
    if (url.pathname === '/api/maps/versions') return respond(mapVersions)
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
  it('uses API totals rather than the number of rows in the queue preview', async () => {
    show(<WorkQueue urgent={false} />)
    const registrations = screen.getByRole('group', { name: 'Đăng ký chờ duyệt' })
    const tours = screen.getByRole('group', { name: 'Tour chưa chốt' })
    expect(await within(registrations).findByText('23')).toBeInTheDocument()
    expect(await within(tours).findByText('37')).toBeInTheDocument()
    expect(requests.some(url => url.searchParams.get('state') === 'SUBMITTED')).toBe(true)
    expect(requests.some(url => url.pathname === '/api/staff/manage/tours' && url.searchParams.get('state') === 'SCHEDULED')).toBe(true)
  })

  it('folds the queue to one line while something needs a person now, and opens on request', async () => {
    show(<WorkQueue urgent />)
    expect(await screen.findByText(/23 đăng ký chờ duyệt · 37 Tour chưa chốt · 0 POI cần hoàn thiện/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Đăng ký chờ duyệt' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mở/ }))
    expect(screen.getByRole('group', { name: 'Đăng ký chờ duyệt' })).toBeInTheDocument()
  })

  it('counts only the POIs Staff still has to finish, not passed or waiting ones', async () => {
    const draft = proposal('poi-c', 'map-a', 'test123-v1', 'Điểm C')
    const failed = proposal('poi-d', 'map-a', 'test123-v1', 'Điểm D')
    const waiting = proposal('poi-e', 'map-a', 'test123-v1', 'Điểm E')
    proposals = [...standardProposals,
      { ...draft, revision: { ...draft.revision, isSubmitted: false, navigationStatus: null } },
      { ...failed, revision: { ...failed.revision, navigationStatus: 'FAIL' } },
      { ...waiting, revision: { ...waiting.revision, navigationStatus: null } }] as PoiProposal[]
    show(<WorkQueue urgent={false} />)
    const section = screen.getByRole('group', { name: 'POI cần hoàn thiện' })
    await waitFor(() => expect(within(section).getByRole('heading')).toHaveTextContent(/POI cần hoàn thiện\s*2/))
    expect(within(section).getByText(/1 POI khác đang chờ kỹ thuật kiểm tra/)).toBeInTheDocument()
  })

  it('keeps failed registration totals unknown while other queue sections load', async () => {
    failRegistrations = true
    show(<WorkQueue urgent={false} />)
    const registrations = screen.getByRole('group', { name: 'Đăng ký chờ duyệt' })
    expect(await within(registrations).findByRole('alert')).toHaveTextContent('Không tải được.')
    expect(within(registrations).getByRole('heading')).toHaveTextContent(/Đăng ký chờ duyệt\s*-/)
    expect(await within(screen.getByRole('group', { name: 'Tour chưa chốt' })).findByText('37')).toBeInTheDocument()
  })

  it('keeps POI rows and map markers on the selected map version and explains empty filters', async () => {
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const picker = await screen.findByRole('combobox', { name: 'Bản đồ' })
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
    expect(within(map).getByRole('button', { name: /Điểm A/ }).querySelector('circle')).toHaveAttribute('cx', '2')
    expect(within(map).getByRole('button', { name: /Điểm A/ }).querySelector('circle')).toHaveAttribute('cy', '16')
  })

  it('changes the image with the map version and downloads each package once', async () => {
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const first = await screen.findByRole('img', { name: 'Bản đồ test123-v1 với 1 POI' })
    const firstUrl = first.querySelector('image')!.getAttribute('href')!
    const picker = screen.getByRole('combobox', { name: 'Bản đồ' })
    fireEvent.change(picker, { target: { value: 'map-b' } })
    const second = await screen.findByRole('img', { name: 'Bản đồ test123-v2 với 1 POI' })
    expect(second.querySelector('image')).toHaveAttribute('width', '40')
    expect(second.querySelector('image')!.getAttribute('href')).not.toBe(firstUrl)
    fireEvent.change(picker, { target: { value: 'map-a' } })
    await screen.findByRole('img', { name: 'Bản đồ test123-v1 với 1 POI' })
    expect(requests.filter(url => url.pathname === '/api/maps/versions/map-a/package')).toHaveLength(1)
  })

  it('distinguishes same-named areas at the same version and keeps their POIs and rasters separate', async () => {
    mapVersions = [mapVersion('map-a', 'tang-6-v1', [], 'Tầng 6'), mapVersion('map-b', 'test123-v1', [], 'Tầng 6')]
    proposals = [proposal('poi-a', 'map-a', 'tang-6-v1', 'Điểm A'), proposal('poi-b', 'map-b', 'test123-v1', 'Điểm B')]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const firstChoice = await screen.findByRole('option', { name: 'Tầng 6 · tang-6-v1' })
    const secondChoice = await screen.findByRole('option', { name: 'Tầng 6 · test123-v1' })
    expect(firstChoice).toHaveValue('map-a')
    expect(secondChoice).toHaveValue('map-b')
    const first = await screen.findByRole('img', { name: 'Bản đồ tang-6-v1 với 1 POI' })
    expect(first.querySelector('image')).toHaveAttribute('width', '10')
    fireEvent.change(screen.getByRole('combobox', { name: 'Bản đồ' }), { target: { value: 'map-b' } })
    const second = await screen.findByRole('img', { name: 'Bản đồ test123-v1 với 1 POI' })
    expect(second.querySelector('image')).toHaveAttribute('width', '40')
    expect(screen.getByRole('button', { name: 'Chọn Điểm B' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chọn Điểm A' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Bản đồ' })).toHaveDisplayValue('Tầng 6 · test123-v1')
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
  })

  it('marks imported POIs that still need narration and names how they were verified', async () => {
    const imported = proposal('poi-c', 'map-a', 'test123-v1', 'POI 02')
    proposals = [
      { ...imported, sourcePoiId: 'POI_02', revision: { ...imported.revision, verificationMethod: 'POSE_CAPTURE' } },
      { ...proposal('poi-d', 'map-a', 'test123-v1', 'Thư viện'), sourcePoiId: 'POI_03', revision: { ...imported.revision, id: 'poi-d-rev', name: 'Thư viện', narrationText: 'Đây là thư viện.', verificationMethod: 'MANUAL_CHECK' } },
    ]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    expect(await screen.findAllByText('POI 02')).not.toHaveLength(0)
    expect(screen.getAllByText('Cần bổ sung nội dung thuyết minh')).toHaveLength(1)
    const list = screen.getByRole('region', { name: 'Danh sách đề xuất POI' })
    expect(within(within(list).getByRole('button', { name: 'Chọn POI 02' })).getByText('Ghi pose trực tiếp trên robot')).toBeInTheDocument()
    expect(within(within(list).getByRole('button', { name: 'Chọn Thư viện' })).getByText('Kiểm tra thủ công')).toBeInTheDocument()
  })

  it('asks Staff to add narration first for a POI imported from a pose file', async () => {
    const imported = proposal('poi-a', 'map-a', 'test123-v1', 'POI 02')
    proposals = [{ ...imported, sourcePoiId: 'POI_02', revision: { ...imported.revision, navigationStatus: 'NOT_TESTED', narrationText: null } } as PoiProposal]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    expect(chosen).toHaveTextContent('Nhập từ tệp ghi pose trên robot. Đặt tên và viết thuyết minh để dùng được trong tuyến. Kỹ thuật vẫn đang kiểm tra vị trí.')
    expect(within(chosen).getByRole('link', { name: 'Bổ sung thuyết minh' })).toHaveAttribute('href', '/staff/manage/pois/poi-a')
  })

  it('draws the chosen pin on top of another pin at the same spot', async () => {
    proposals = [proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), proposal('poi-c', 'map-a', 'test123-v1', 'Điểm C')]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const map = await screen.findByRole('img', { name: /với 2 POI/ })
    const pins = () => within(map).getAllByRole('button').map(pin => pin.getAttribute('aria-label'))
    expect(pins().at(-1)).toMatch(/Điểm A/)
    fireEvent.click(screen.getByRole('button', { name: 'Chọn Điểm C' }))
    expect(pins().at(-1)).toMatch(/Điểm C/)
  })

  it('keeps the map frame when a status tab hides some points', async () => {
    const draft = proposal('poi-c', 'map-a', 'test123-v1', 'Điểm C')
    proposals = [proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), { ...draft, revision: { ...draft.revision, x: 3, y: 6, isSubmitted: false, submittedAt: null } } as PoiProposal]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const before = (await screen.findByRole('img', { name: /với 2 POI/ })).getAttribute('viewBox')
    fireEvent.click(screen.getByRole('button', { name: /^Bản nháp/ }))
    const after = await screen.findByRole('img', { name: /với 1 POI/ })
    expect(after.getAttribute('viewBox')).toBe(before)
  })

  it('opens the chosen point under its own row, one at a time, from the list or the map', async () => {
    const second = proposal('poi-c', 'map-a', 'test123-v1', 'Điểm C')
    proposals = [proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), second]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const list = await screen.findByRole('region', { name: 'Danh sách đề xuất POI' })
    const rowOf = (name: string) => within(list).getByRole('button', { name: `Chọn ${name}` }).closest('li')!
    await within(list).findByRole('button', { name: 'Chọn Điểm A' })
    expect(within(rowOf('Điểm A')).getByRole('region', { name: 'Điểm đang chọn' })).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Chọn Điểm C' }))
    expect(within(rowOf('Điểm C')).getByRole('region', { name: 'Điểm đang chọn' })).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Điểm đang chọn' })).toHaveLength(1)
    const map = await screen.findByRole('img', { name: /với 2 POI/ })
    fireEvent.click(within(map).getByRole('button', { name: /Điểm A/ }))
    expect(within(rowOf('Điểm A')).getByRole('region', { name: 'Điểm đang chọn' })).toBeInTheDocument()
  })

  it('tells Staff the next step for the chosen POI, with one action and no map key noise', async () => {
    const draft = proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A')
    proposals = [{ ...draft, revision: { ...draft.revision, isSubmitted: false, submittedAt: null, navigationStatus: 'NOT_TESTED' } } as PoiProposal]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    expect(chosen).toHaveTextContent('Chưa gửi kiểm chứng. Hoàn tất nội dung rồi gửi để kỹ thuật viên kiểm tra trên robot.')
    expect(within(chosen).getAllByRole('link')).toHaveLength(1)
    expect(within(chosen).getByRole('link', { name: 'Mở để gửi kiểm chứng' })).toHaveAttribute('href', '/staff/manage/pois/poi-a')
    expect(screen.queryByText('test123-v1', { selector: 'span' })).not.toBeInTheDocument()
  })

  it('filters POIs to the maps a robot is running, and shows every POI by default', async () => {
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    await screen.findByRole('combobox', { name: 'Bản đồ' })
    const list = screen.getByRole('region', { name: 'Danh sách đề xuất POI' })
    expect(screen.getByRole('checkbox', { name: 'Chỉ bản đồ đang chạy trên robot' })).not.toBeChecked()
    expect(within(list).getByText('Điểm A')).toBeInTheDocument()
    await waitFor(() => expect(requests.some(url => url.pathname === '/api/maps/versions')).toBe(true))
    await waitFor(() => {
      if (!screen.getByRole('checkbox', { name: 'Chỉ bản đồ đang chạy trên robot' }).matches(':checked')) fireEvent.click(screen.getByRole('checkbox', { name: 'Chỉ bản đồ đang chạy trên robot' }))
      expect(within(list).getByText('Điểm B')).toBeInTheDocument()
    })
    expect(within(list).queryByText('Điểm A')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Bản đồ' })).toHaveValue('map-b')
  })

  it('opens the Tour list on upcoming Tours and asks the API for each tab', async () => {
    show(<SchedulePage />, '/staff/schedule?view=list')
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
    show(<SchedulePage />, '/staff/schedule?view=list')
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái Tour' }), { target: { value: 'ALL' } })
    await waitFor(() => expect(requests.at(-1)!.searchParams.get('phase')).toBeNull())
    expect(requests.at(-1)!.searchParams.get('state')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sắp diễn ra' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('honors the READY dashboard link when opening the Tour list', async () => {
    show(<SchedulePage />, '/staff/schedule?view=list&state=READY')
    expect(screen.getByRole('combobox', { name: 'Trạng thái Tour' })).toHaveValue('READY')
    await screen.findByText('Chưa có Tour phù hợp')
    expect(requests.some(url => url.pathname.endsWith('/tours') && url.searchParams.get('state') === 'READY')).toBe(true)
  })
})
