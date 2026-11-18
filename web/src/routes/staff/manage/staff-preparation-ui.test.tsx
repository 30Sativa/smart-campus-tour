import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { strToU8, zipSync } from 'fflate'
import { MemoryRouter, useLocation } from 'react-router'
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
let discardResponse: Response | null = null
/** Verification records the POI history endpoint returns, which carry a FAIL reason. */
let historyRecords: unknown[] = []
const discardBodies: unknown[] = []
const lifecycleCalls: Array<{ path: string; body: { requestId: string; expectedRowVersion: string } }> = []
/** An uploaded package: 10x20 cells of 0.5m with the map origin at (-1, -2). */
const packageZip = (width: number) => zipSync({
  'map.yaml': strToU8('image: map.pgm\nmode: trinary\nresolution: 0.5\norigin: [-1, -2, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n'),
  'map.pgm': strToU8(`P2\n${width} 20\n255\n${Array(width * 20).fill(255).join(' ')}\n`),
})
const mapVersion = (id: string, mapKey: string, currentlyDeployedOn: unknown[], areaName = mapKey) => ({ map: { id, mapKey, frameId: 'map', imageFileName: 'map.pgm', packageSha256: 'a'.repeat(64), areaName, areaKey: mapKey.replace(/-v\d+$/, ''), versionNumber: 1 }, currentlyDeployedOn })
const proposal = (id: string, mapVersionId: string, mapKey: string, name: string): PoiProposal => ({
  id, currentRevision: 1, rowVersion: 'version', revision: { id: `${id}-rev`, revisionNumber: 1, mapVersionId, mapKey, name, purpose: 'Tham quan', description: null,
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

function PoiLocation() {
  return <output aria-label="Địa chỉ danh sách điểm">{useLocation().search}</output>
}
beforeEach(() => {
  requests.length = 0; failRegistrations = false; packageFailure = null; proposals = standardProposals; mapVersions = standardMaps
  discardResponse = null; discardBodies.length = 0; lifecycleCalls.length = 0; historyRecords = []
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-ui', username: 'staff', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://api.example.test'); requests.push(url)
    if (url.pathname.endsWith('/retire') || url.pathname.endsWith('/reactivate')) {
      lifecycleCalls.push({ path: url.pathname, body: JSON.parse(String(init?.body)) })
      const retire = url.pathname.endsWith('/retire')
      proposals = proposals.map(item => url.pathname.includes(`/${item.id}/`)
        ? { ...item, retiredAt: retire ? '2026-11-15T05:00:00Z' : null, canRetire: !retire, canReactivate: retire } : item)
      return respond(proposals.find(item => url.pathname.includes(`/${item.id}/`)))
    }
    if (url.pathname.endsWith('/scheduled-tours')) return respond([{ id: 'tour-1', name: 'Tour sáng thứ Hai', scheduledStartAt: '2026-11-23T01:15:00Z', state: 'SCHEDULED', registrationClosesAt: '2026-11-21T01:15:00Z' }])
    if (url.pathname.endsWith('/discard')) {
      discardBodies.push(JSON.parse(String(init?.body)))
      if (discardResponse) return discardResponse
      proposals = proposals.filter(item => !url.pathname.includes(item.id))
      return respond({ ...standardProposals[0], discardedAt: '2026-11-09T05:00:00Z', canDiscard: false })
    }
    if (url.pathname === '/api/staff/poi-proposals') return respond(proposals)
    if (url.pathname.endsWith('/history')) {
      const item = proposals.find(entry => url.pathname.includes(`/${entry.id}/`))
      return respond({ proposalId: item?.id, revisions: item ? [item.revision] : [], verificationRecords: historyRecords })
    }
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
  it('sorts POI names naturally in Vietnamese while keeping selection and map numbers', async () => {
    proposals = [proposal('p10', 'map-a', 'test123-v1', 'Điểm 10'), proposal('p2', 'map-a', 'test123-v1', 'Điểm 2'), proposal('pa', 'map-a', 'test123-v1', 'Ánh sáng')]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const list = await screen.findByRole('list', { name: 'Điểm tham quan' })
    await within(list).findByRole('button', { name: 'Chọn Điểm 2' })
    const names = () => within(list).getAllByRole('button', { name: /^Chọn / }).map(button => button.getAttribute('aria-label'))
    fireEvent.click(within(list).getByRole('button', { name: 'Chọn Điểm 2' }))
    const map = await screen.findByRole('img', { name: /với 3 POI/ })
    const frame = map.getAttribute('viewBox')

    fireEvent.change(screen.getByLabelText('Sắp xếp điểm'), { target: { value: 'name' } })
    expect(names()).toEqual(['Chọn Ánh sáng', 'Chọn Điểm 2', 'Chọn Điểm 10'])
    const selected = within(list).getByRole('button', { name: 'Chọn Điểm 2' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(within(selected).getByText('2')).toBeInTheDocument()
    expect(within(map).getByRole('button', { name: /^2\. Điểm 2,/ })).toHaveAttribute('aria-pressed', 'true')
    expect(map.getAttribute('viewBox')).toBe(frame)

    fireEvent.change(screen.getByLabelText('Sắp xếp điểm'), { target: { value: 'name-desc' } })
    expect(names()).toEqual(['Chọn Điểm 10', 'Chọn Điểm 2', 'Chọn Ánh sáng'])
    fireEvent.change(screen.getByLabelText('Tìm POI'), { target: { value: 'Điểm' } })
    expect(names()).toEqual(['Chọn Điểm 10', 'Chọn Điểm 2'])
    fireEvent.change(screen.getByLabelText('Tìm POI'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Sắp xếp điểm'), { target: { value: 'original' } })
    expect(names()).toEqual(['Chọn Điểm 10', 'Chọn Điểm 2', 'Chọn Ánh sáng'])
  })

  it('sorts by the current revision timestamp with timezone offsets', async () => {
    proposals = ['Điểm A', 'Điểm B', 'Điểm C'].map((name, index) => {
      const item = proposal(`p${index}`, 'map-a', 'test123-v1', name)
      return { ...item, revision: { ...item.revision, createdAt: ['2026-11-02T02:00:00Z', '2026-11-02T08:00:00+07:00', '2026-11-02T02:30:00Z'][index] } }
    })
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    await screen.findByRole('button', { name: 'Chọn Điểm A' })
    const list = screen.getByRole('list', { name: 'Điểm tham quan' })
    const names = () => within(list).getAllByRole('button', { name: /^Chọn / }).map(button => button.getAttribute('aria-label'))
    fireEvent.change(screen.getByLabelText('Sắp xếp điểm'), { target: { value: 'updated-desc' } })
    expect(names()).toEqual(['Chọn Điểm C', 'Chọn Điểm A', 'Chọn Điểm B'])
    expect(within(list).getByRole('button', { name: 'Chọn Điểm A' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Sắp xếp điểm'), { target: { value: 'updated' } })
    expect(names()).toEqual(['Chọn Điểm B', 'Chọn Điểm A', 'Chọn Điểm C'])
  })

  it('restores sorting from the URL and preserves other parameters when changing it', async () => {
    proposals = [proposal('pa', 'map-a', 'test123-v1', 'Điểm A'), proposal('pb', 'map-a', 'test123-v1', 'Điểm B')]
    show(<><StaffManagePoisPage /><PoiLocation /></>, '/staff/manage/pois?sort=name-desc&keep=yes')
    await screen.findByRole('button', { name: 'Chọn Điểm A' })
    expect(screen.getByLabelText('Sắp xếp điểm')).toHaveValue('name-desc')
    const list = screen.getByRole('list', { name: 'Điểm tham quan' })
    expect(within(list).getAllByRole('button', { name: /^Chọn / })[0]).toHaveAccessibleName('Chọn Điểm B')
    fireEvent.change(screen.getByLabelText('Sắp xếp điểm'), { target: { value: 'name' } })
    expect(new URLSearchParams(screen.getByLabelText('Địa chỉ danh sách điểm').textContent!).get('sort')).toBe('name')
    fireEvent.change(screen.getByLabelText('Sắp xếp điểm'), { target: { value: 'original' } })
    expect(screen.getByLabelText('Địa chỉ danh sách điểm')).toHaveTextContent('?keep=yes')
  })

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
      { ...waiting, revision: { ...waiting.revision, navigationStatus: null } },
      // A retired POI takes no new work (ADR-0062), so it is neither Staff's nor Technical's.
      { ...failed, id: 'poi-f', retiredAt: '2026-11-15T05:00:00Z', revision: { ...failed.revision, navigationStatus: 'FAIL' } }] as PoiProposal[]
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

  // ADR-0060 replaced the "imported POI needs narration" badge (read from revision.narrationText) with the
  // narration summary every proposal now carries, so each row says where its narration stands.
  // Every card names both axes in the same words as the POI page (poi-labels.ts), plus the route line.
  it('names the check and the narration on every card, with the route line and no check method', async () => {
    const approved = { revisionNumber: 1, approvedByUserId: 'u2', approvedByName: 'Lan', approvedAt: '2026-11-15T02:00:00Z' }
    const draft = { revisionNumber: 2, lastEditedByUserId: 'u1', lastEditedByName: 'An', lastEditedAt: '2026-11-15T03:00:00Z', rowVersion: 'n2' }
    const withNarration = (id: string, name: string, narration: PoiProposal['narration'], method?: 'POSE_CAPTURE' | 'MANUAL_CHECK') => {
      const item = proposal(id, 'map-a', 'test123-v1', name)
      return { ...item, narration, revision: { ...item.revision, verificationMethod: method ?? null } }
    }
    const waiting = withNarration('poi-d', 'Thư viện', { approved: null, draft }, 'MANUAL_CHECK')
    proposals = [
      withNarration('poi-c', 'POI 02', null, 'POSE_CAPTURE'),
      { ...waiting, revision: { ...waiting.revision, navigationStatus: 'NOT_TESTED' } },
      withNarration('poi-e', 'Sảnh', { approved, draft: null }),
      withNarration('poi-f', 'Căng tin', { approved, draft }),
    ]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const list = await screen.findByRole('region', { name: 'Danh sách đề xuất POI' })
    const row = async (name: string) => within(await within(list).findByRole('button', { name: `Chọn ${name}` }))
    expect((await row('POI 02')).getByText('Kiểm chứng: Đạt')).toBeInTheDocument()
    expect((await row('POI 02')).getByText('Thuyết minh: Chưa có')).toBeInTheDocument()
    expect((await row('POI 02')).getByText('Dùng được cho tuyến: Chưa, vì chưa có thuyết minh đã duyệt')).toBeInTheDocument()
    expect((await row('Thư viện')).getByText('Kiểm chứng: Chờ kỹ thuật')).toBeInTheDocument()
    expect((await row('Thư viện')).getByText('Thuyết minh: Chờ duyệt')).toBeInTheDocument()
    expect((await row('Sảnh')).getByText('Thuyết minh: Đã duyệt')).toBeInTheDocument()
    expect((await row('Sảnh')).getByText('Dùng được cho tuyến: Có')).toBeInTheDocument()
    expect((await row('Căng tin')).getByText('Thuyết minh: Đã duyệt · có bản chờ duyệt')).toBeInTheDocument()
    // The check method is the POI page's detail, not the card's.
    expect(within(list).queryByText('Ghi pose trực tiếp trên robot')).not.toBeInTheDocument()
    expect(within(list).queryByText('Kiểm tra thủ công')).not.toBeInTheDocument()
    // The filter chips and the map pins use the same check words.
    for (const label of ['Chưa gửi', 'Chờ kỹ thuật', 'Đạt', 'Không đạt']) expect(screen.getByRole('button', { name: new RegExp(`^${label}\\s*\\d+$`) })).toBeInTheDocument()
    const map = await screen.findByRole('img', { name: /với 4 POI/ })
    expect(within(map).getByRole('button', { name: /Thư viện, Kiểm chứng: Chờ kỹ thuật, Thuyết minh: Chờ duyệt/ })).toBeInTheDocument()
  })

  it('lists both missing steps of an unsent POI whose narration waits for approval', async () => {
    const draft = proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A')
    const narrationDraft = { revisionNumber: 1, lastEditedByUserId: 'u1', lastEditedByName: 'An', lastEditedAt: '2026-11-15T03:00:00Z', rowVersion: 'n1' }
    proposals = [{ ...draft, narration: { approved: null, draft: narrationDraft }, revision: { ...draft.revision, isSubmitted: false, submittedAt: null, navigationStatus: 'NOT_TESTED' } }]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    const steps = within(within(chosen).getByRole('list', { name: 'Việc còn thiếu' })).getAllByRole('listitem')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toHaveTextContent('Chưa gửi kiểm chứng.')
    expect(within(steps[0]).getByRole('link', { name: 'Gửi kiểm chứng' })).toHaveAttribute('href', '/staff/manage/pois/poi-a')
    expect(steps[1]).toHaveTextContent('Thuyết minh chờ duyệt.')
    expect(steps[1]).not.toHaveTextContent('chờ một Staff khác duyệt')
    expect(within(steps[1]).getByRole('link', { name: 'Mở thuyết minh' })).toHaveAttribute('href', '/staff/manage/pois/poi-a?tab=thuyet-minh')
    // Each line has its own action, so no extra "Xem đề xuất".
    expect(within(chosen).getAllByRole('link')).toHaveLength(2)
    expect(screen.queryByText('test123-v1', { selector: 'span' })).not.toBeInTheDocument()
  })

  it('tells the last editor of a waiting narration that another Staff has to approve it', async () => {
    const passed = proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A')
    const narrationDraft = { revisionNumber: 1, lastEditedByUserId: 'staff-ui', lastEditedByName: 'Tôi', lastEditedAt: '2026-11-15T03:00:00Z', rowVersion: 'n1' }
    proposals = [{ ...passed, narration: { approved: null, draft: narrationDraft } }]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    expect(within(chosen).getByRole('listitem')).toHaveTextContent('Thuyết minh chờ duyệt, chờ một Staff khác duyệt.')
  })

  it('shows the reason of a failed check on the card, with one action to the position tab', async () => {
    const failed = proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A')
    const approved = { revisionNumber: 1, approvedByUserId: 'u2', approvedByName: 'Lan', approvedAt: '2026-11-15T02:00:00Z' }
    proposals = [{ ...failed, narration: { approved, draft: null }, revision: { ...failed.revision, navigationStatus: 'FAIL' } }]
    historyRecords = [{ id: 'check-1', proposalId: 'poi-a', proposalRevisionId: 'poi-a-rev', revisionNumber: 1, mapVersionId: 'map-a', mapKey: 'test123-v1', robotCode: 'amr-01', resultCode: 'FAIL',
      reached: true, stopped: false, localizationPassed: true, cameraPresetConfirmed: true, reason: 'Robot dừng lệch 30 cm', evidenceNote: '', checkedByUserId: 't1', checkedAt: '2026-11-15T04:00:00Z', verificationMethod: 'MANUAL_CHECK', sourceFileSha256: null }]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    const steps = within(within(chosen).getByRole('list', { name: 'Việc còn thiếu' })).getAllByRole('listitem')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toHaveTextContent('Kiểm chứng không đạt.')
    expect(await within(steps[0]).findByText('Lý do: Robot dừng lệch 30 cm')).toBeInTheDocument()
    expect(within(steps[0]).getByRole('link', { name: 'Xem lý do và sửa' })).toHaveAttribute('href', '/staff/manage/pois/poi-a?tab=vi-tri')
    expect(within(screen.getByRole('button', { name: 'Chọn Điểm A' })).getByText('Kiểm chứng: Không đạt')).toBeInTheDocument()
  })

  it('says a passed POI with an approved narration is ready for a route', async () => {
    const passed = proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A')
    proposals = [{ ...passed, narration: { approved: { revisionNumber: 1, approvedByUserId: 'u2', approvedByName: 'Lan', approvedAt: '2026-11-15T02:00:00Z' }, draft: null } }]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    expect(chosen).toHaveTextContent('Dùng được khi tạo tuyến.')
    expect(within(chosen).queryByRole('list', { name: 'Việc còn thiếu' })).not.toBeInTheDocument()
    expect(within(chosen).getByRole('link', { name: 'Xem đề xuất' })).toHaveAttribute('href', '/staff/manage/pois/poi-a')
  })

  it('shows one "Ngưng dùng" chip instead of both statuses for a retired POI', async () => {
    proposals = [{ ...proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), retiredAt: '2026-11-15T05:00:00Z', canReactivate: true }]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const row = within(await screen.findByRole('button', { name: 'Chọn Điểm A' }))
    expect(row.getByText('Ngưng dùng')).toBeInTheDocument()
    expect(row.queryByText(/^Kiểm chứng:/)).not.toBeInTheDocument()
    expect(row.queryByText(/^Thuyết minh:/)).not.toBeInTheDocument()
    expect(row.getByText('Dùng được cho tuyến: Chưa, vì POI đã ngưng dùng')).toBeInTheDocument()
    const chosen = screen.getByRole('region', { name: 'Điểm đang chọn' })
    expect(within(chosen).queryByRole('list', { name: 'Việc còn thiếu' })).not.toBeInTheDocument()
    expect(chosen).toHaveTextContent('Đã ngưng dùng.')
  })

  // POI E in production: Technical listed it as passed while this list said "Bản nháp". Renaming a passed POI
  // makes an unsubmitted revision that keeps the PASS of its unchanged navigation fingerprint.
  it('lists an unsubmitted revision that kept its PASS as passed, not as a draft', async () => {
    const renamed = proposal('poi-a', 'map-a', 'test123-v1', 'E')
    proposals = [{ ...renamed, revision: { ...renamed.revision, isSubmitted: false, submittedAt: null, navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-a-rev-1' } }]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const list = await screen.findByRole('region', { name: 'Danh sách đề xuất POI' })
    const row = within(await within(list).findByRole('button', { name: 'Chọn E' }))
    expect(row.getByText('Kiểm chứng: Đạt')).toBeInTheDocument()
    expect(row.queryByText('Bản nháp')).not.toBeInTheDocument()
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
    proposals = [proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), { ...draft, revision: { ...draft.revision, x: 3, y: 6, isSubmitted: false, submittedAt: null, navigationStatus: 'NOT_CHECKED' } } as PoiProposal]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const before = (await screen.findByRole('img', { name: /với 2 POI/ })).getAttribute('viewBox')
    fireEvent.click(screen.getByRole('button', { name: /^Chưa gửi\s*\d/ }))
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

  it('offers to remove only a POI the server says never passed, and removes it after confirmation', async () => {
    const draft = proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A')
    proposals = [{ ...draft, canDiscard: true, rowVersion: 'rv-a', revision: { ...draft.revision, isSubmitted: true, navigationStatus: 'NOT_TESTED' } } as PoiProposal,
      { ...proposal('poi-c', 'map-a', 'test123-v1', 'Điểm C'), canDiscard: false }]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    const chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    fireEvent.click(within(chosen).getByRole('button', { name: 'Xoá điểm' }))
    const dialog = screen.getByRole('dialog', { name: 'Xoá Điểm A?' })
    expect(dialog).toHaveTextContent('Lịch sử chỉnh sửa và kiểm chứng vẫn được lưu.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá điểm' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(discardBodies).toEqual([{ expectedRevisionNumber: 1, expectedRowVersion: 'rv-a' }])
    expect(await screen.findByRole('button', { name: 'Chọn Điểm C' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Chọn Điểm A' })).not.toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Điểm đang chọn' })).queryByRole('button', { name: 'Xoá điểm' })).not.toBeInTheDocument()
  })

  it('offers delete, retire or reactivate exactly as the server flags say (ADR-0062)', async () => {
    const used = { ...proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A'), rowVersion: 'rv-a', canDiscard: false, canRetire: true }
    const free = { ...proposal('poi-c', 'map-a', 'test123-v1', 'Điểm C'), canDiscard: true, canRetire: false }
    proposals = [used, free]
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    let chosen = await screen.findByRole('region', { name: 'Điểm đang chọn' })
    expect(within(chosen).queryByRole('button', { name: 'Xoá điểm' })).not.toBeInTheDocument()
    expect(within(chosen).queryByRole('button', { name: 'Dùng lại' })).not.toBeInTheDocument()
    fireEvent.click(within(chosen).getByRole('button', { name: 'Ngưng dùng' }))
    const dialog = screen.getByRole('dialog', { name: 'Ngưng dùng Điểm A?' })
    expect(dialog).toHaveTextContent('Tuyến và Tour đã lưu không đổi gì')
    expect(dialog).toHaveTextContent('tuyến mới không chọn được điểm này')
    // Like "Ngừng sử dụng tuyến": the Tours that stop here, each a link, before deciding.
    expect(await within(dialog).findByText('1 Tour đã lên lịch đi qua điểm này, vẫn chạy như cũ:')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Tour sáng thứ Hai' })).toHaveAttribute('href', '/staff/manage/tours/tour-1')
    expect(requests.some(request => request.pathname === '/api/staff/poi-proposals/poi-a/scheduled-tours')).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ngưng dùng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(lifecycleCalls).toEqual([{ path: '/api/staff/poi-proposals/poi-a/retire', body: { requestId: expect.any(String), expectedRowVersion: 'rv-a' } }])

    // The retired POI carries its own label, filter and "Dùng lại".
    const row = await screen.findByRole('button', { name: 'Chọn Điểm A' })
    await waitFor(() => expect(within(row).getByText('Ngưng dùng')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^Ngưng dùng\s*1$/ }))
    const list = screen.getByRole('region', { name: 'Danh sách đề xuất POI' })
    expect(within(list).getByText('Điểm A')).toBeInTheDocument()
    expect(within(list).queryByText('Điểm C')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Đạt\s*\d/ }))
    expect(within(list).queryByText('Điểm A')).not.toBeInTheDocument()
    expect(within(list).getByText('Điểm C')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Điểm đang chọn' })).getByRole('button', { name: 'Xoá điểm' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Ngưng dùng\s*1$/ }))
    chosen = screen.getByRole('region', { name: 'Điểm đang chọn' })
    expect(chosen).toHaveTextContent('tuyến mới không chọn được')
    fireEvent.click(within(chosen).getByRole('button', { name: 'Dùng lại' }))
    await waitFor(() => expect(lifecycleCalls.at(-1)?.path).toBe('/api/staff/poi-proposals/poi-a/reactivate'))
  })

  it('keeps a refused removal in the dialog with the server reason', async () => {
    const draft = proposal('poi-a', 'map-a', 'test123-v1', 'Điểm A')
    proposals = [{ ...draft, canDiscard: true } as PoiProposal]
    discardResponse = new Response(JSON.stringify({ success: false, message: 'POI đã từng đạt kiểm chứng nên không thể xoá.' }), { status: 409 })
    show(<StaffManagePoisPage />, '/staff/manage/pois')
    fireEvent.click(within(await screen.findByRole('region', { name: 'Điểm đang chọn' })).getByRole('button', { name: 'Xoá điểm' }))
    const dialog = screen.getByRole('dialog', { name: 'Xoá Điểm A?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá điểm' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('POI đã từng đạt kiểm chứng nên không thể xoá.')
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
