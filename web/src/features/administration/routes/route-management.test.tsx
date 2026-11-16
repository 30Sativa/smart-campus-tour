import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import StaffManageRouteCatalogPage from '../../../routes/staff/manage/StaffManageRouteCatalogPage'
import StaffManageRouteDetailsPage from '../../../routes/staff/manage/StaffManageRouteDetailsPage'
import StaffManageRouteFormPage from '../../../routes/staff/manage/StaffManageRouteFormPage'
import { versionedRoutesApi } from './versioned-api'
import { useAuthStore } from '../../../stores/auth-store'
import { useToastStore } from '../../../components/ui/toast-store'

// jsdom has no canvas; the package itself still goes through the real reader.
vi.mock('../../administration/pois/map/versioned-package', async importActual => ({
  ...await importActual<typeof import('../../administration/pois/map/versioned-package')>(),
  rasterPngBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}))
/** 4x4 cells of 0.5 m from (10, 20), every cell occupied, so any newly written pose lacks clearance. */
const occupiedPackage = () => zipSync({
  'map.yaml': strToU8('image: map.pgm\nmode: trinary\nresolution: 0.5\norigin: [10, 20, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n'),
  'map.pgm': strToU8(`P2\n4 4\n255\n${Array(16).fill(0).join(' ')}\n`),
})

const map = { id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1', packageFileName: 'library.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm', imageWidth: 2, imageHeight: 2, resolution: 0.5, originX: 10, originY: 20, originYaw: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z' }
// ADR-0060: a route takes a POI only with an approved narration, so every passed fixture POI carries one.
const approvedNarration = { approved: { revisionNumber: 1, approvedByUserId: 'staff-2', approvedByName: 'Lan', approvedAt: '2026-11-15T02:00:00Z' }, draft: null }
const withApprovedNarration = <T extends { revision: { navigationStatus: string } }>(items: T[]) =>
  items.map(item => item.revision.navigationStatus === 'PASS' ? { ...item, narration: approvedNarration } : item)
const proposals = withApprovedNarration([
  { id: 'p-pass', currentRevision: 2, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-pass', revisionNumber: 2, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Verified entrance', purpose: 'Entry', description: null, x: 10.2, y: 20.4, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-pass' } },
  { id: 'p-hall', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-hall', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Verified hall', purpose: 'Hall', description: null, x: 11.4, y: 20.4, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-hall' } },
  { id: 'p-parking', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-parking', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Parking', purpose: 'Parking', description: null, x: 10.2, y: 21.6, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-parking' } },
  { id: 'p-pending', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-pending', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Pending POI', purpose: 'Pending', description: null, x: 1, y: 1, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'NOT_CHECKED', verificationSourceRevisionId: null } },
  { id: 'p-other-map', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-other', revisionNumber: 1, mapVersionId: 'map-v2', mapKey: 'library-v2', name: 'Other map POI', purpose: 'Other', description: null, x: 2, y: 2, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-other' } },
])
const route = { routeId: 'route-1', revisionId: 'route-rev-1', revisionNumber: 1, name: 'Library tour', description: null, isActive: true, mapVersionId: 'map-v1', mapKey: 'library-v1', mapPackageSha256: 'a'.repeat(64), startX: 11.4, startY: 21.6, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, configurationFingerprint: 'c'.repeat(64), isSubmitted: false, verificationStatus: 'NOT_CHECKED', effectiveTestRunId: null as string | null, durationStatus: 'INCOMPLETE_CONTENT_AUDIO_DATA', dwellDurationSeconds: 60, stops: [{ poiRevisionId: 'poi-rev-pass', sourcePoiVerificationRecordId: 'verify-1', stopOrder: 1, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }], name: 'Verified entrance', x: 10.2, y: 20.4, yaw: 0, cameraPreset: 'FRONT' }, { poiRevisionId: 'poi-rev-hall', sourcePoiVerificationRecordId: 'verify-2', stopOrder: 2, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }], name: 'Verified hall', x: 11.4, y: 20.4, yaw: 0, cameraPreset: 'FRONT' }], testRuns: [] as unknown[], revisionHistory: [{ revisionId: 'route-rev-1', revisionNumber: 1, mapVersionId: 'map-v1', mapPackageSha256: 'a'.repeat(64), configurationFingerprint: 'c'.repeat(64), isSubmitted: false, verificationStatus: 'NOT_CHECKED', effectiveTestRunId: null, createdAt: '2026-10-27T10:00:00Z' }], eligibilityIssues: ['INCOMPLETE_CONTENT_AUDIO_DATA'] }
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, message: 'OK', data, pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 }, errors: null }), { status, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
let submissionFailure: 409 | 500 | null = null
let mapEligible = true
let extraProposals: unknown[] = []
let submissionFailureBody: unknown = null
let currentRoute = structuredClone(route)
let scheduledTours: unknown[] = []
let clearanceMeters: number | undefined
let createFailure: Response | null = null

function renderAt(path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/manage/routes" element={<StaffManageRouteCatalogPage />} />
    <Route path="/staff/manage/routes/new" element={<StaffManageRouteFormPage />} />
    <Route path="/staff/manage/routes/:routeId" element={<StaffManageRouteDetailsPage />} />
    <Route path="/staff/manage/routes/:routeId/edit" element={<StaffManageRouteFormPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^Tiếp/ }))
// The pose picker needs the raster, which these tests do not serve; copying a POI's pose is the same draft change.
const startFromPoi = (poiRevisionId: string) => fireEvent.change(within(screen.getByRole('region', { name: 'Điểm bắt đầu' })).getByLabelText('Lấy vị trí có sẵn'), { target: { value: poiRevisionId } })

describe('Staff versioned Route workflow', () => {
  beforeEach(() => {
    requests = []
    submissionFailure = null
    mapEligible = true
    extraProposals = []
    submissionFailureBody = null
    currentRoute = structuredClone(route)
    clearanceMeters = undefined
    createFailure = null
    scheduledTours = []
    useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'staff-token', user: { userId: 'staff-1', username: 'staff', role: 'Staff' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([{ map: { ...map, id: 'map-empty', mapKey: 'map-without-poi', versionNumber: 3 }, latestDeployment: null, canUseForPoiPreparation: true }, { map, latestDeployment: null, canUseForPoiPreparation: mapEligible, poiClearanceMeters: clearanceMeters, routeMinStops: 2, routeMinStopSeparationMeters: 1, currentlyDeployedOn: [] }])
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(occupiedPackage())
      if (url.pathname === '/api/staff/poi-proposals') return response([...proposals, ...extraProposals])
      if (url.pathname === '/api/routes' && init?.method !== 'POST') return response([currentRoute])
      if (url.pathname === '/api/staff/routes' && init?.method === 'POST') return createFailure ?? response(route)
      if (url.pathname === '/api/routes/route-1/revisions') return response(currentRoute)
      if (url.pathname === '/api/staff/routes/route-1/scheduled-tours') return response(scheduledTours)
      if (url.pathname === '/api/staff/routes/route-1/revisions/route-rev-1/submit') {
        await new Promise(resolve => setTimeout(resolve, 40))
        if (submissionFailure) return new Response(JSON.stringify(submissionFailureBody ?? { message: submissionFailure === 409 ? 'Revision đã cũ.' : 'Lỗi máy chủ.' }), { status: submissionFailure })
        currentRoute = { ...currentRoute, isSubmitted: true, verificationStatus: 'NOT_TESTED', revisionHistory: currentRoute.revisionHistory.map(item => ({ ...item, isSubmitted: true })) }
        return response(currentRoute)
      }
      return response(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  const fillNewRoute = async () => {
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    next()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Verified hall/ }))
    next()
    startFromPoi('poi-rev-parking')
    next()
  }

  it('offers cancel, save draft, and save-and-submit on the review step, like the POI form', async () => {
    await fillNewRoute()
    expect(screen.getByRole('link', { name: 'Hủy bỏ' })).toHaveAttribute('href', '/staff/manage/routes')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi kiểm chứng' }))
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    const order = requests.filter(r => r.init?.method === 'POST').map(r => r.url.pathname)
    expect(order).toEqual(['/api/staff/routes', '/api/staff/routes/route-1/revisions/route-rev-1/submit'])
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'Đã tạo tuyến “Library tour”', detail: expect.stringMatching(/Đã gửi kiểm chứng, chờ kỹ thuật chạy thử/) })
  })

  it('keeps the saved draft and says so when the submit after saving is refused', async () => {
    submissionFailure = 409
    await fillNewRoute()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi kiểm chứng' }))
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ tone: 'error', title: 'Đã lưu bản nháp “Library tour” nhưng chưa gửi được kiểm chứng' })
    expect(screen.getByRole('button', { name: 'Gửi kiểm chứng tuyến' })).toBeInTheDocument()
  })

  it('selects only PASS POI revisions for the chosen map and creates/submits the exact route revision', async () => {
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    next()
    expect(await screen.findByText('Verified entrance')).toBeInTheDocument()
    expect(screen.queryByText('Pending POI')).not.toBeInTheDocument()
    expect(screen.queryByText('Other map POI')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Verified entrance/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Verified hall/ }))
    next()
    startFromPoi('poi-rev-parking')
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    expect(requests.filter(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')).toHaveLength(1)
    const create = requests.find(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')!
    const createBody = JSON.parse(String(create.init?.body))
    expect(createBody).toMatchObject({ mapVersionId: 'map-v1', expectedCurrentRevision: 0, startX: 10.2, startY: 21.6, startYaw: 0, endMode: 'LAST_POI', stops: [{ poiRevisionId: 'poi-rev-pass', dwellSeconds: 30 }, { poiRevisionId: 'poi-rev-hall', dwellSeconds: 30 }] })
    expect(createBody.requestId).toBeTruthy()
    expect(requests.some(r => r.url.pathname === '/api/technical/poi-verifications')).toBe(false)
    // One notice per state: the draft says what Staff does next, with no second warning beside it.
    expect(screen.getByText(/^Đây là bản nháp. Staff kiểm tra lại các điểm dừng/)).toBeInTheDocument()
    expect(screen.queryByText(/Chưa tạo được Tour/)).not.toBeInTheDocument()
    expect(screen.queryByText('NOT_TESTED')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi kiểm chứng tuyến' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/routes/route-1/revisions/route-rev-1/submit')).toBe(true))
    const submit = requests.find(r => r.url.pathname.endsWith('/submit'))!
    expect(JSON.parse(String(submit.init?.body))).toMatchObject({ expectedCurrentRevision: 1 })
  })

  // Choice for ADR-0060: an unapproved POI stays in the list with its narration state but cannot be ticked,
  // the same way a map without a passed POI stays visible but disabled.
  it('shows each passed POI’s narration state and does not let Staff tick one without approved narration', async () => {
    extraProposals = [
      { ...proposals[2], id: 'p-draft', revision: { ...proposals[2].revision, id: 'poi-rev-draft', name: 'Draft narration POI', x: 12, y: 21 }, narration: { approved: null, draft: { revisionNumber: 1, lastEditedByUserId: 'staff-1', lastEditedByName: 'An', lastEditedAt: '2026-11-15T02:00:00Z', rowVersion: 'n1' } } },
      { ...proposals[2], id: 'p-none', revision: { ...proposals[2].revision, id: 'poi-rev-none', name: 'No narration POI', x: 12, y: 22 }, narration: null },
    ]
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    next()
    expect(await screen.findByRole('checkbox', { name: /Verified entrance/ })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /Verified entrance/ })).not.toHaveAccessibleDescription()
    expect(screen.getAllByText('Thuyết minh: Đã duyệt')).toHaveLength(3)
    const draft = screen.getByRole('checkbox', { name: /Draft narration POI/ })
    expect(draft).toBeDisabled()
    expect(draft).toHaveAccessibleDescription('Thuyết minh chờ duyệt, chưa chọn được')
    expect(screen.getByRole('checkbox', { name: /No narration POI/ })).toHaveAccessibleDescription('Chưa có thuyết minh, chưa chọn được')
  })

  it('names a kept stop whose narration is not approved before Save and lets Staff untick it', async () => {
    const hall = proposals.find(item => item.id === 'p-hall')!
    const proposalsWithoutApproval = [{ ...hall, narration: null }]
    extraProposals = proposalsWithoutApproval
    // The edited revision keeps poi-rev-hall; the extra copy without approval wins the lookup for that revision.
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([{ map, latestDeployment: null, canUseForPoiPreparation: true, routeMinStops: 1, routeMinStopSeparationMeters: 1, currentlyDeployedOn: [] }])
      if (url.pathname === '/api/staff/poi-proposals') return response([proposals[0], ...proposalsWithoutApproval])
      if (url.pathname === '/api/routes/route-1/revisions') return response(currentRoute)
      if (url.pathname === '/api/routes') return response([currentRoute])
      return response(null)
    })
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    fireEvent.click(screen.getByRole('button', { name: /Điểm dừng/ }))
    const hallBox = await screen.findByRole('checkbox', { name: /Verified hall/ })
    expect(hallBox).toBeChecked()
    expect(hallBox).toBeEnabled()
    expect(screen.getByText(/bỏ chọn Verified hall hoặc duyệt thuyết minh trước/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
    fireEvent.click(hallBox)
    expect(screen.queryByText(/bỏ chọn Verified hall/)).not.toBeInTheDocument()
  })

  it('explains a save refused with POI_NARRATION_NOT_APPROVED in Vietnamese', async () => {
    createFailure = new Response(JSON.stringify({ success: false, message: 'POI Verified hall chưa có thuyết minh đã duyệt.', data: null, errors: { code: 'POI_NARRATION_NOT_APPROVED' } }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    next()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Verified hall/ }))
    next()
    startFromPoi('poi-rev-parking')
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
    expect(await screen.findByText('POI Verified hall chưa có thuyết minh đã duyệt. Nhờ một Staff khác duyệt thuyết minh ở trang POI, hoặc bỏ điểm đó ở bước 2, rồi lưu lại.')).toBeInTheDocument()
  })

  // ADR-0062: a retired POI is never offered for a new stop; a kept stop on one says so and can be removed.
  describe('a retired POI', () => {
    it('is not offered as a stop', async () => {
      extraProposals = [{ ...proposals[2], id: 'p-retired', retiredAt: '2026-11-15T05:00:00Z', canReactivate: true,
        revision: { ...proposals[2].revision, id: 'poi-rev-retired', name: 'Retired POI', x: 12, y: 21 } }]
      renderAt('/staff/manage/routes/new')
      fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
      fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
      next()
      expect(await screen.findByRole('checkbox', { name: /Verified entrance/ })).toBeInTheDocument()
      expect(screen.queryByText('Retired POI')).not.toBeInTheDocument()
    })

    it('names a kept stop on it, blocks Next, and removes the stop on request', async () => {
      const hall = proposals.find(item => item.id === 'p-hall')!
      const retiredHall = { ...hall, retiredAt: '2026-11-15T05:00:00Z', canReactivate: true }
      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost'); requests.push({ url, init })
        if (url.pathname === '/api/maps/versions') return response([{ map, latestDeployment: null, canUseForPoiPreparation: true, routeMinStops: 1, routeMinStopSeparationMeters: 1, currentlyDeployedOn: [] }])
        if (url.pathname === '/api/staff/poi-proposals') return response([proposals[0], retiredHall])
        if (url.pathname === '/api/routes/route-1/revisions') return response(currentRoute)
        if (url.pathname === '/api/routes') return response([currentRoute])
        return response(null)
      })
      renderAt('/staff/manage/routes/route-1/edit')
      await screen.findByLabelText('Tên tuyến')
      fireEvent.click(screen.getByRole('button', { name: /Điểm dừng/ }))
      const hallBox = await screen.findByRole('checkbox', { name: /Verified hall/ })
      expect(hallBox).toBeChecked()
      const notice = screen.getByText('POI này đã ngưng dùng. Bỏ điểm dừng này, hoặc dùng lại POI ở trang POI, rồi lưu tuyến.')
      expect(screen.getByText(/bỏ điểm dừng Verified hall \(POI đã ngưng dùng\)/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
      fireEvent.click(within(notice.parentElement!).getByRole('button', { name: 'Bỏ điểm dừng' }))
      expect(screen.queryByText(/POI này đã ngưng dùng/)).not.toBeInTheDocument()
      // The retired POI is not offered again once its stop is gone.
      expect(screen.queryByRole('checkbox', { name: /Verified hall/ })).not.toBeInTheDocument()
    })

    it('explains POI_RETIRED from the server in Vietnamese', async () => {
      createFailure = new Response(JSON.stringify({ success: false, message: 'POI Verified hall đã ngưng dùng. Bỏ khỏi tuyến hoặc dùng lại POI.', data: null, errors: { code: 'POI_RETIRED' } }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      renderAt('/staff/manage/routes/new')
      fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
      fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
      next()
      fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /Verified hall/ }))
      next()
      startFromPoi('poi-rev-parking')
      next()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
      expect(await screen.findByText('POI Verified hall đã ngưng dùng. Bỏ khỏi tuyến hoặc dùng lại POI.')).toBeInTheDocument()
    })
  })

  // ADR-0061: a stop keeps the exact POI revision it was saved with. Before this change a stop on an older revision
  // vanished from the list, its name fell back to its GUID, and ticking the POI added a second revision of it.
  describe('a stop on an older revision of its POI', () => {
    const oldStop = (poiRevisionId: string, poiProposalId: string, name: string, x: number) =>
      ({ ...route.stops[0], poiRevisionId, poiProposalId, name, x, y: 20.4, yaw: 0, cameraPreset: 'FRONT' })
    const editStops = async () => {
      renderAt('/staff/manage/routes/route-1/edit')
      await screen.findByLabelText('Tên tuyến')
      fireEvent.click(screen.getByRole('button', { name: /Điểm dừng/ }))
      return screen.findByRole('region', { name: 'Điểm dừng' })
    }

    it('keeps its saved name and offers the newer passed revision, saying a moved POI needs a new test run', async () => {
      currentRoute = { ...route, stops: [oldStop('poi-rev-pass-old', 'p-pass', 'Old entrance', 9.8), route.stops[1]] } as typeof route
      const step = within(await editStops())
      const box = step.getByRole('checkbox', { name: /Old entrance/ })
      expect(box).toBeChecked()
      expect(step.queryByText(/poi-rev-pass-old/)).not.toBeInTheDocument()
      // The newer revision of the same POI is not offered as a second stop.
      expect(step.queryByRole('checkbox', { name: /Verified entrance/ })).not.toBeInTheDocument()
      const row = within(box.closest('li')!)
      expect(row.getByText('POI này có phiên bản mới đã đạt. Tuyến sẽ phải chạy thử lại.')).toBeInTheDocument()
      fireEvent.change(row.getByLabelText('Thời gian dừng Old entrance (giây)'), { target: { value: '45' } })
      fireEvent.click(row.getByRole('button', { name: 'Dùng bản mới' }))
      expect(step.getByRole('checkbox', { name: /Verified entrance/ })).toBeChecked()
      expect(step.queryByRole('checkbox', { name: /Old entrance/ })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Xem lại và lưu/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
      await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/routes/route-1/revisions' && r.init?.method === 'POST')).toBe(true))
      const body = JSON.parse(String(requests.find(r => r.url.pathname === '/api/staff/routes/route-1/revisions' && r.init?.method === 'POST')!.init?.body))
      expect(body.stops[0]).toEqual({ poiRevisionId: 'poi-rev-pass', dwellSeconds: 45, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }] })
      expect(body.stops).toHaveLength(2)
    })

    it('does not ask for a new test run when the newer revision kept the pose and camera', async () => {
      currentRoute = { ...route, stops: [oldStop('poi-rev-pass-old', 'p-pass', 'Old entrance', 10.2), route.stops[1]] } as typeof route
      const row = within((await within(await editStops()).findByRole('checkbox', { name: /Old entrance/ })).closest('li')!)
      expect(row.getByText('POI này có phiên bản mới đã đạt.')).toBeInTheDocument()
      expect(row.getByRole('button', { name: 'Dùng bản mới' })).toBeInTheDocument()
    })

    it('keeps the old revision without an offer while the newer one has not passed', async () => {
      currentRoute = { ...route, stops: [route.stops[0], oldStop('poi-rev-pending-old', 'p-pending', 'Old pending', 11.4)] } as typeof route
      const step = within(await editStops())
      const row = within(step.getByRole('checkbox', { name: /Old pending/ }).closest('li')!)
      expect(row.getByText('POI này đang có bản sửa chưa đạt, tuyến giữ bản cũ.')).toBeInTheDocument()
      expect(row.queryByRole('button', { name: 'Dùng bản mới' })).not.toBeInTheDocument()
      expect(step.queryByText(/poi-rev-pending-old/)).not.toBeInTheDocument()
    })

    it('names the stops whose POI has a newer passed revision on the current route revision, with a way to edit', async () => {
      currentRoute = { ...route, stops: [oldStop('poi-rev-pass-old', 'p-pass', 'Old entrance', 9.8), oldStop('poi-rev-hall-old', 'p-hall', 'Old hall', 11.4), oldStop('poi-rev-pending-old', 'p-pending', 'Old pending', 12)] } as typeof route
      renderAt('/staff/manage/routes/route-1')
      const notice = (await screen.findByText(/có phiên bản mới đã đạt/)).closest('[role="alert"]')!
      expect(notice).toHaveTextContent('POI Old entrance, Old hall có phiên bản mới đã đạt. Sửa tuyến để dùng bản mới. Đổi vị trí, hướng hoặc camera thì tuyến phải chạy thử lại.')
      expect(within(notice as HTMLElement).getByRole('link', { name: 'Sửa tuyến' })).toHaveAttribute('href', '/staff/manage/routes/route-1/edit')
    })

    it('says nothing about newer POI revisions on an older, read-only route revision', async () => {
      currentRoute = { ...route, stops: [oldStop('poi-rev-pass-old', 'p-pass', 'Old entrance', 9.8), route.stops[1]],
        revisionHistory: [...route.revisionHistory, { ...route.revisionHistory[0], revisionId: 'route-rev-2', revisionNumber: 2 }] } as typeof route
      renderAt('/staff/manage/routes/route-1?revisionId=route-rev-1')
      expect(await screen.findByText(/chỉ xem được/)).toBeInTheDocument()
      expect(screen.queryByText(/có phiên bản mới đã đạt/)).not.toBeInTheDocument()
    })

    it('explains ROUTE_DUPLICATE_POI in Vietnamese', async () => {
      createFailure = new Response(JSON.stringify({ success: false, message: 'POI Verified hall đã có trong tuyến. Mỗi POI chỉ được dùng một lần.', data: null, errors: { code: 'ROUTE_DUPLICATE_POI' } }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      renderAt('/staff/manage/routes/new')
      fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
      fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
      next()
      fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /Verified hall/ }))
      next()
      startFromPoi('poi-rev-parking')
      next()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
      expect(await screen.findByText('POI Verified hall đã có trong tuyến. Mỗi POI chỉ được dùng một lần. Bỏ một trong hai điểm dừng ở bước 2 rồi lưu lại.')).toBeInTheDocument()
    })
  })

  it('only offers maps that already have a passed POI', async () => {
    renderAt('/staff/manage/routes/new')
    const select = await screen.findByLabelText('Bản đồ')
    expect(within(select).getByRole('option', { name: /Library · library-v1/ })).toBeEnabled()
    const otherMap = within(select).getByRole('option', { name: /Library · map-without-poi/ })
    expect(otherMap).toBeDisabled()
    expect(otherMap).toHaveTextContent('chưa có POI đạt')
  })

  it('blocks a map that lost its passing technical check even when its POIs passed', async () => {
    mapEligible = false
    renderAt('/staff/manage/routes/new')
    const select = await screen.findByLabelText('Bản đồ')
    const option = within(select).getByRole('option', { name: /Library · library-v1/ })
    expect(option).toBeDisabled()
    expect(option).toHaveTextContent('chưa đạt kiểm tra kỹ thuật')
    fireEvent.change(select, { target: { value: 'map-v1' } })
    expect(await screen.findByText(/không lưu được tuyến/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
    expect(screen.getByText(/chọn bản đồ còn đạt kiểm tra kỹ thuật/)).toBeInTheDocument()
  })

  it('walks a new route step by step and says what is missing before each next step', async () => {
    renderAt('/staff/manage/routes/new')
    await screen.findByLabelText('Tên tuyến')
    expect(screen.getByRole('button', { name: /Bước 1/ })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: /Bước 3/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
    expect(screen.getByText('Cần: nhập tên tuyến, chọn bản đồ.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên tuyến'), { target: { value: 'Steps' } })
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    next()
    expect(screen.getByText('Cần: chọn ít nhất 2 điểm dừng.')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
    // One stop is not a route: the minimum comes with the map version.
    expect(screen.getByText('Cần: chọn ít nhất 2 điểm dừng.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Thời gian dừng Verified entrance (giây)'), { target: { value: '14' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Verified hall/ }))
    expect(screen.getByText('Cần: thời gian dừng từ 15 đến 300 giây.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Thời gian dừng Verified entrance (giây)'), { target: { value: '301' } })
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Thời gian dừng Verified entrance (giây)'), { target: { value: '300' } })
    next()
    // A new route has no start until one is placed; nothing defaults to 0, 0, 0.
    expect(within(screen.getByRole('region', { name: 'Điểm bắt đầu' })).getByText('Chưa chọn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /Về một vị trí riêng/ }))
    expect(screen.getByText('Cần: chọn điểm bắt đầu và hướng, chọn điểm kết thúc và hướng.')).toBeInTheDocument()
    startFromPoi('poi-rev-parking')
    // The copy select keeps naming the POI the start came from instead of falling back to its placeholder.
    expect(within(screen.getByRole('region', { name: 'Điểm bắt đầu' })).getByLabelText('Lấy vị trí có sẵn')).toHaveValue('poi-rev-parking')
    fireEvent.click(screen.getByRole('radio', { name: /Quay về điểm bắt đầu/ }))
    expect(screen.queryByRole('region', { name: 'Vị trí kết thúc' })).not.toBeInTheDocument()
    next()
    const review = within(screen.getByRole('region', { name: 'Xem lại và lưu' }))
    expect(review.getByText('x 10.20 m · y 21.60 m · hướng 0°')).toBeInTheDocument()
    expect(review.getByText('Quay về điểm bắt đầu')).toBeInTheDocument()
    expect(review.getByLabelText('Lộ trình robot đi')).toHaveTextContent('Bắt đầu → 1. Verified entrance → 2. Verified hall → Kết thúc tại điểm bắt đầu')
    expect(review.getByText('5 phút 30 giây')).toBeInTheDocument()
    expect(review.getByText('Thời lượng dự kiến được tự tính khi lưu, từ thời gian dừng và quãng đường.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Quay lại/ }))
    expect(screen.getByRole('button', { name: /Bước 3/ })).toHaveAttribute('aria-current', 'step')
  })

  it('lets a kept start skip the clearance check, as the server does, but flags a newly placed one', async () => {
    clearanceMeters = 0.3
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    fireEvent.click(screen.getByRole('button', { name: /Bước 3/ }))
    // The check needs the map package; the picker appears once it is parsed (jsdom never decodes the image itself).
    await within(screen.getByRole('region', { name: 'Điểm bắt đầu' })).findByText(/Độ phân giải bản đồ/)
    expect(within(screen.getByRole('region', { name: 'Điểm bắt đầu' })).queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/quá sát vật cản/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeEnabled()
    startFromPoi('poi-rev-parking')
    expect(await screen.findByText('Chưa sang bước tiếp được: điểm bắt đầu quá sát vật cản.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
  })

  it('does not offer a stop as the start and names the stop a pose is too close to', async () => {
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    fireEvent.click(screen.getByRole('button', { name: /Bước 3/ }))
    const start = within(screen.getByRole('region', { name: 'Điểm bắt đầu' }))
    expect(start.getByRole('option', { name: 'POI Verified entrance (đang là điểm dừng)' })).toBeDisabled()
    expect(start.getByRole('option', { name: 'POI Verified hall (đang là điểm dừng)' })).toBeDisabled()
    expect(start.getByRole('option', { name: 'POI Parking' })).toBeEnabled()
    fireEvent.click(screen.getByRole('radio', { name: /Về một vị trí riêng/ }))
    const end = within(screen.getByRole('region', { name: 'Vị trí kết thúc' }))
    expect(end.getByRole('option', { name: 'POI Verified hall (đang là điểm dừng)' })).toBeDisabled()
    expect(end.getByRole('option', { name: 'POI Parking' })).toBeEnabled()
  })

  it('flags a start too close to a stop on the spot and blocks Next', async () => {
    extraProposals = [{ ...proposals[0], id: 'p-near', revision: { ...proposals[0].revision, id: 'poi-rev-near', name: 'Near hall', x: 11.9, y: 20.4 } }]
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    fireEvent.click(screen.getByRole('button', { name: /Bước 3/ }))
    startFromPoi('poi-rev-near')
    expect(within(screen.getByRole('region', { name: 'Điểm bắt đầu' })).getByRole('alert')).toHaveTextContent('Điểm bắt đầu cách điểm dừng Verified hall 0,5 m, cần ít nhất 1 m.')
    expect(screen.getByText('Chưa sang bước tiếp được: điểm bắt đầu quá gần điểm dừng Verified hall.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
    // A separate end near the last stop is refused the same way; "Quay về điểm bắt đầu" never is.
    startFromPoi('poi-rev-parking')
    fireEvent.click(screen.getByRole('radio', { name: /Về một vị trí riêng/ }))
    fireEvent.change(within(screen.getByRole('region', { name: 'Vị trí kết thúc' })).getByLabelText('Lấy vị trí có sẵn'), { target: { value: 'poi-rev-near' } })
    expect(screen.getByText('Chưa sang bước tiếp được: điểm kết thúc quá gần điểm dừng cuối Verified hall.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Quay về điểm bắt đầu/ }))
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeEnabled()
  })

  it('warns before saving that the Tours scheduled on the route keep the current revision (ADR-0034)', async () => {
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    await waitFor(() => expect(requests.some(request => request.url.pathname === '/api/staff/routes/route-1/scheduled-tours')).toBe(true))
    expect(screen.queryByText(/không tự đổi theo bản bạn sắp lưu/)).not.toBeInTheDocument()
  })

  it('names those Tours, each linking to its page', async () => {
    scheduledTours = [{ id: 'tour-9', name: 'Tour sáng thứ Bảy', scheduledStartAt: '2099-01-03T01:15:00Z', state: 'READY' }]
    renderAt('/staff/manage/routes/route-1/edit')
    expect(await screen.findByText('1 Tour đã lên lịch trên tuyến này vẫn chạy bản đã chọn lúc tạo, không tự đổi theo bản bạn sắp lưu. Muốn Tour đi theo bản mới, chờ bản mới chạy thử đạt rồi hủy Tour và tạo lại.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tour sáng thứ Bảy' })).toHaveAttribute('href', '/staff/manage/tours/tour-9')
  })

  it('opens every step of an existing route and keeps its saved start', async () => {
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    expect(screen.getByRole('button', { name: /Bước 4/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /Bước 4/ }))
    expect(within(screen.getByRole('region', { name: 'Xem lại và lưu' })).getByText('x 11.40 m · y 21.60 m · hướng 0°')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu bản nháp' })).toBeEnabled()
  })

  it('says when a tested route can start a Tour, and why not otherwise', async () => {
    const run = { id: 'run-1', routeRevisionId: 'route-rev-1', robotCode: 'amr-01', checkedByUserId: 'tech-1', participatingStaffUserId: 'staff-1', resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 600, failureReason: null, evidenceNote: 'ok', checkedAt: '2026-10-28T10:00:00Z', measurementBasis: 'TOTAL_WITH_DWELL' }
    const tested = { ...currentRoute, isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: 'run-1', testRuns: [run], scheduleFit: 'FITS' as const, expectedDurationSeconds: 1500 }
    currentRoute = tested
    const ready = renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Dùng được để tạo Tour/)).toBeInTheDocument()
    expect(screen.getByText('Thời lượng dự kiến: 25 phút (tự tính từ thời gian dừng và quãng đường)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tạo Tour' })).toHaveAttribute('href', '/staff/manage/tours/new?route=route-rev-1')
    expect(screen.queryByText(/Chưa xếp lịch/)).not.toBeInTheDocument()
    ready.unmount()

    // A PASS recorded before ADR-0035 no longer matters: the length is estimated from the revision.
    currentRoute = { ...tested, testRuns: [{ ...run, measurementBasis: null }] }
    const old = renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Dùng được để tạo Tour/)).toBeInTheDocument()
    expect(screen.queryByText(/Cần chạy thử lại/)).not.toBeInTheDocument()
    old.unmount()

    currentRoute = { ...tested, isActive: false }
    renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Tuyến đang ngừng sử dụng nên chưa tạo được Tour mới/)).toBeInTheDocument()
  })

  // ADR-0062: a current revision with a retired POI takes no new Tour, and both route pages say so.
  it('labels a current revision with a retired POI and offers no Tour on it', async () => {
    const run = { id: 'run-1', routeRevisionId: 'route-rev-1', robotCode: 'amr-01', checkedByUserId: 'tech-1', participatingStaffUserId: 'staff-1', resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 600, failureReason: null, evidenceNote: 'ok', checkedAt: '2026-10-28T10:00:00Z', measurementBasis: 'TOTAL_WITH_DWELL' }
    currentRoute = { ...currentRoute, isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: 'run-1', testRuns: [run], retiredPoiNames: ['Verified hall'] } as typeof route
    const catalog = renderAt('/staff/manage/routes')
    // The list gives it that status instead of "Đã chạy thử đạt", so it never reads as usable.
    expect(await screen.findByText('Có POI ngưng dùng')).toHaveAttribute('title', 'POI đã ngưng dùng: Verified hall')
    expect(screen.queryByText('Đã chạy thử đạt')).not.toBeInTheDocument()
    catalog.unmount()
    renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Tuyến có POI đã ngưng dùng: Verified hall\. Không tạo được Tour mới trên phiên bản này; Tour đã tạo vẫn chạy như cũ\./)).toBeInTheDocument()
    expect(screen.getByText('Có POI ngưng dùng')).toBeInTheDocument()
    expect(screen.getByText('Đã chạy thử đạt · chưa tạo được Tour mới (có POI ngưng dùng)')).toBeInTheDocument()
    expect(screen.queryByText(/Dùng được để tạo Tour/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tạo Tour' })).not.toBeInTheDocument()
  })

  it('labels a route too long for one shift in red and one over the recommendation in amber', async () => {
    currentRoute = { ...route, isSubmitted: true, verificationStatus: 'PASS', scheduleFit: 'TOO_LONG_FOR_SHIFT', expectedDurationSeconds: 6000 } as typeof route
    const catalog = renderAt('/staff/manage/routes')
    expect(await screen.findByText('Quá dài cho 1 ca')).toBeInTheDocument()
    catalog.unmount()
    const detail = renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText('Quá dài cho 1 ca')).toBeInTheDocument()
    expect(screen.getByText(/Chưa tạo được Tour: Dự kiến 100 phút, vượt thời lượng tối đa của mọi ca/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tạo Tour' })).not.toBeInTheDocument()
    detail.unmount()
    currentRoute = { ...currentRoute, scheduleFit: 'OVER_RECOMMENDED', expectedDurationSeconds: 4000 } as typeof route
    renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText('Dài hơn mức khuyến nghị')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tạo Tour' })).toBeInTheDocument()
  })

  it('explains a submit refused because the map lost its technical check', async () => {
    submissionFailure = 409
    submissionFailureBody = { success: false, message: 'Không có robot nào đạt.', errors: { code: 'TECHNICAL_CHECK_NOT_PASSED', fields: null } }
    renderAt('/staff/manage/routes/route-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi kiểm chứng tuyến' }))
    expect(await screen.findByText(/Nhờ Kỹ thuật kiểm tra lại bản đồ/)).toBeInTheDocument()
    expect(currentRoute.isSubmitted).toBe(false)
  })

  it('chooses and drops a stop from the map beside the list, without a pass badge on every row', async () => {
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Map pick' } })
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    next()
    fireEvent.click(await screen.findByRole('button', { name: 'Chọn Verified hall' }))
    expect(screen.getByRole('checkbox', { name: /Verified hall/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn Verified hall' }))
    expect(screen.getByRole('checkbox', { name: /Verified hall/ })).not.toBeChecked()
    expect(screen.queryByText('Đã đạt')).not.toBeInTheDocument()
  })

  it('names what step 3 places and keeps radians under technical details', async () => {
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    fireEvent.click(screen.getByRole('button', { name: /Bước 3/ }))
    const start = within(screen.getByRole('region', { name: 'Điểm bắt đầu' }))
    expect(await start.findByText('Bấm vào bản đồ để đặt điểm bắt đầu.')).toBeInTheDocument()
    expect(start.getByText('0°')).toBeInTheDocument()
    expect(start.getByText('Chi tiết kỹ thuật').closest('details')).not.toHaveAttribute('open')
  })

  it('saves stops in the order shown after moving one up', async () => {
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Ordered' } })
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    next()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Verified hall/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Đưa Verified hall lên' }))
    fireEvent.change(screen.getByLabelText('Thời gian dừng Verified hall (giây)'), { target: { value: '45' } })
    expect(screen.getAllByRole('checkbox').slice(0, 2).map(box => box.closest('label')?.textContent)).toEqual([expect.stringContaining('Verified hall'), expect.stringContaining('Verified entrance')])
    next()
    startFromPoi('poi-rev-parking')
    next()
    expect(within(screen.getByRole('region', { name: 'Xem lại và lưu' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Verified hall · dừng 45 giây', 'Verified entrance · dừng 30 giây'])
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')).toBe(true))
    const body = JSON.parse(String(requests.find(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')!.init?.body))
    expect(body.stops.map((stop: { poiRevisionId: string; dwellSeconds: number }) => [stop.poiRevisionId, stop.dwellSeconds])).toEqual([['poi-rev-hall', 45], ['poi-rev-pass', 30]])
  })

  it('shows the route in plain words and keeps identifiers under technical details', async () => {
    currentRoute = { ...route, isSubmitted: true, verificationStatus: 'NOT_TESTED', dwellDurationSeconds: 120 } as typeof route
    renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Đang chờ Kỹ thuật chạy thử/)).toBeInTheDocument()
    expect(screen.getAllByText('Chờ chạy thử').length).toBeGreaterThan(0)
    expect(screen.getByText('2 phút')).toBeInTheDocument()
    expect(screen.queryByText('NOT_TESTED')).not.toBeInTheDocument()
    expect(screen.getByText('Thông tin kỹ thuật').closest('details')).not.toHaveAttribute('open')
  })

  it('reads the requested revision ID from the route history link', async () => {
    renderAt('/staff/manage/routes/route-1?revisionId=route-rev-old')
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    const detail = requests.find(r => r.url.pathname === '/api/routes/route-1/revisions')!
    expect(detail.url.searchParams.get('revisionId')).toBe('route-rev-old')
  })

  it('shows pending state, saves a successful submit and refreshes route data', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    await client.fetchQuery({ queryKey: ['versioned-routes'], queryFn: () => versionedRoutesApi.list() })
    const catalogReads = requests.filter(item => item.url.pathname === '/api/routes' && item.init?.method !== 'POST').length
    renderAt('/staff/manage/routes/route-1', client)
    const submit = await screen.findByRole('button', { name: 'Gửi kiểm chứng tuyến' })
    fireEvent.click(submit)
    expect(await screen.findByRole('button', { name: 'Đang gửi…' })).toBeDisabled()
    expect(await screen.findByRole('status')).toHaveTextContent(/Đang chờ Kỹ thuật chạy thử/)
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/routes/route-1/revisions').length).toBeGreaterThan(1))
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/routes' && item.init?.method !== 'POST').length).toBeGreaterThan(catalogReads))
    expect(currentRoute.isSubmitted).toBe(true)
  })

  it('keeps a stale submit unsent as success and requires explicit reload after conflict', async () => {
    submissionFailure = 409
    renderAt('/staff/manage/routes/route-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi kiểm chứng tuyến' }))
    expect(await screen.findByText(/Tuyến hoặc dữ liệu nguồn đã thay đổi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tải lại tuyến' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(currentRoute.isSubmitted).toBe(false)
    expect(requests.filter(item => item.url.pathname.endsWith('/submit'))).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại tuyến' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tải lại tuyến' })).not.toBeInTheDocument())
    expect(requests.filter(item => item.url.pathname.endsWith('/submit'))).toHaveLength(1)
  })

  it('shows server submit failures without changing the revision to submitted', async () => {
    submissionFailure = 500
    renderAt('/staff/manage/routes/route-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi kiểm chứng tuyến' }))
    expect(await screen.findByText(/Máy chủ chưa xử lý được yêu cầu/)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(currentRoute.isSubmitted).toBe(false)
    expect(screen.getByRole('button', { name: 'Gửi kiểm chứng tuyến' })).toBeEnabled()
  })

  it('keeps historical revisions readable but does not offer submit for an older revision', async () => {
    const historical = { ...route, revisionHistory: [...route.revisionHistory,
      { ...route.revisionHistory[0], revisionId: 'route-rev-2', revisionNumber: 2, isSubmitted: false }] }
    currentRoute = historical
    renderAt('/staff/manage/routes/route-1?revisionId=route-rev-1')
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    expect(screen.getByText(/^Đây là bản lưu \d\d\/\d\d \d\d:\d\d, chỉ xem được\.$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi kiểm chứng tuyến' })).not.toBeInTheDocument()
  })
})
