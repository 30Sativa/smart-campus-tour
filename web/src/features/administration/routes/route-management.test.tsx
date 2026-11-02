import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageRouteCatalogPage from '../../../routes/staff/manage/StaffManageRouteCatalogPage'
import StaffManageRouteDetailsPage from '../../../routes/staff/manage/StaffManageRouteDetailsPage'
import StaffManageRouteFormPage from '../../../routes/staff/manage/StaffManageRouteFormPage'
import { versionedRoutesApi } from './versioned-api'
import { useAuthStore } from '../../../stores/auth-store'

const map = { id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1', packageFileName: 'library.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm', imageWidth: 2, imageHeight: 2, resolution: 0.5, originX: 10, originY: 20, originYaw: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z' }
const proposals = [
  { id: 'p-pass', currentRevision: 2, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-pass', revisionNumber: 2, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Verified entrance', purpose: 'Entry', description: null, x: 10.2, y: 20.4, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-pass' } },
  { id: 'p-pending', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-pending', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Pending POI', purpose: 'Pending', description: null, x: 1, y: 1, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'NOT_CHECKED', verificationSourceRevisionId: null } },
  { id: 'p-other-map', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-other', revisionNumber: 1, mapVersionId: 'map-v2', mapKey: 'library-v2', name: 'Other map POI', purpose: 'Other', description: null, x: 2, y: 2, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-other' } },
]
const route = { routeId: 'route-1', revisionId: 'route-rev-1', revisionNumber: 1, name: 'Library tour', description: null, isActive: true, mapVersionId: 'map-v1', mapKey: 'library-v1', mapPackageSha256: 'a'.repeat(64), startX: 10, startY: 20, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, configurationFingerprint: 'c'.repeat(64), isSubmitted: false, verificationStatus: 'NOT_CHECKED', effectiveTestRunId: null as string | null, durationStatus: 'INCOMPLETE_CONTENT_AUDIO_DATA', dwellDurationSeconds: 30, stops: [{ poiRevisionId: 'poi-rev-pass', sourcePoiVerificationRecordId: 'verify-1', stopOrder: 1, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }], name: 'Verified entrance', x: 10.2, y: 20.4, yaw: 0, cameraPreset: 'FRONT' }], testRuns: [] as unknown[], revisionHistory: [{ revisionId: 'route-rev-1', revisionNumber: 1, mapVersionId: 'map-v1', mapPackageSha256: 'a'.repeat(64), configurationFingerprint: 'c'.repeat(64), isSubmitted: false, verificationStatus: 'NOT_CHECKED', effectiveTestRunId: null, createdAt: '2026-10-27T10:00:00Z' }], eligibilityIssues: ['INCOMPLETE_CONTENT_AUDIO_DATA'] }
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, message: 'OK', data, pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 }, errors: null }), { status, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
let submissionFailure: 409 | 500 | null = null
let mapEligible = true
let extraProposals: unknown[] = []
let submissionFailureBody: unknown = null
let currentRoute = structuredClone(route)

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
    useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'staff-token', user: { userId: 'staff-1', username: 'staff', role: 'Staff' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([{ map: { ...map, id: 'map-empty', mapKey: 'map-without-poi', versionNumber: 3 }, latestDeployment: null, canUseForPoiPreparation: true }, { map, latestDeployment: null, canUseForPoiPreparation: mapEligible }])
      if (url.pathname === '/api/staff/poi-proposals') return response([...proposals, ...extraProposals])
      if (url.pathname === '/api/routes' && init?.method !== 'POST') return response([currentRoute])
      if (url.pathname === '/api/staff/routes' && init?.method === 'POST') return response(route)
      if (url.pathname === '/api/routes/route-1/revisions') return response(currentRoute)
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

  it('selects only PASS POI revisions for the chosen map and creates/submits the exact route revision', async () => {
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
    fireEvent.change(screen.getByLabelText('Phiên bản bản đồ'), { target: { value: 'map-v1' } })
    next()
    expect(await screen.findByText('Verified entrance')).toBeInTheDocument()
    expect(screen.queryByText('Pending POI')).not.toBeInTheDocument()
    expect(screen.queryByText('Other map POI')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    next()
    startFromPoi('poi-rev-pass')
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    const create = requests.find(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')!
    const createBody = JSON.parse(String(create.init?.body))
    expect(createBody).toMatchObject({ mapVersionId: 'map-v1', expectedCurrentRevision: 0, startX: 10.2, startY: 20.4, startYaw: 0, endMode: 'LAST_POI', stops: [{ poiRevisionId: 'poi-rev-pass', dwellSeconds: 30 }] })
    expect(createBody.requestId).toBeTruthy()
    expect(requests.some(r => r.url.pathname === '/api/technical/poi-verifications')).toBe(false)
    expect(screen.getByText('Chưa tạo được Tour: tuyến cần một lần chạy thử toàn tuyến đạt.')).toBeInTheDocument()
    expect(screen.getByText(/Đây là bản nháp/)).toBeInTheDocument()
    expect(screen.queryByText('NOT_TESTED')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi kiểm chứng tuyến' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/routes/route-1/revisions/route-rev-1/submit')).toBe(true))
    const submit = requests.find(r => r.url.pathname.endsWith('/submit'))!
    expect(JSON.parse(String(submit.init?.body))).toMatchObject({ expectedCurrentRevision: 1 })
  })

  it('only offers maps that already have a passed POI', async () => {
    renderAt('/staff/manage/routes/new')
    const select = await screen.findByLabelText('Phiên bản bản đồ')
    expect(within(select).getByRole('option', { name: /Library · phiên bản 1/ })).toBeEnabled()
    const otherMap = within(select).getByRole('option', { name: /Library · phiên bản 3/ })
    expect(otherMap).toBeDisabled()
    expect(otherMap).toHaveTextContent('chưa có POI đạt')
  })

  it('blocks a map that lost its passing technical check even when its POIs passed', async () => {
    mapEligible = false
    renderAt('/staff/manage/routes/new')
    const select = await screen.findByLabelText('Phiên bản bản đồ')
    const option = within(select).getByRole('option', { name: /Library · phiên bản 1/ })
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
    expect(screen.getByText('Chưa sang bước tiếp được: nhập tên tuyến, chọn bản đồ.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên tuyến'), { target: { value: 'Steps' } })
    fireEvent.change(screen.getByLabelText('Phiên bản bản đồ'), { target: { value: 'map-v1' } })
    next()
    expect(screen.getByText('Chưa sang bước tiếp được: chọn ít nhất một điểm dừng.')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
    next()
    // A new route has no start until one is placed; nothing defaults to 0, 0, 0.
    expect(within(screen.getByRole('region', { name: 'Điểm bắt đầu' })).getByText('Chưa chọn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tiếp/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /Về một vị trí riêng/ }))
    expect(screen.getByText('Chưa sang bước tiếp được: chọn điểm bắt đầu và hướng, chọn điểm kết thúc và hướng.')).toBeInTheDocument()
    startFromPoi('poi-rev-pass')
    fireEvent.change(within(screen.getByRole('region', { name: 'Vị trí kết thúc' })).getByLabelText('Lấy vị trí có sẵn'), { target: { value: 'start' } })
    next()
    const review = within(screen.getByRole('region', { name: 'Xem lại và lưu' }))
    expect(review.getAllByText('x 10.20 m · y 20.40 m · hướng 0.00 rad')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Quay lại/ }))
    expect(screen.getByRole('button', { name: /Bước 3/ })).toHaveAttribute('aria-current', 'step')
  })

  it('opens every step of an existing route and keeps its saved start', async () => {
    renderAt('/staff/manage/routes/route-1/edit')
    await screen.findByLabelText('Tên tuyến')
    expect(screen.getByRole('button', { name: /Bước 4/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /Bước 4/ }))
    expect(within(screen.getByRole('region', { name: 'Xem lại và lưu' })).getByText('x 10.00 m · y 20.00 m · hướng 0.00 rad')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu bản nháp' })).toBeEnabled()
  })

  it('says when a tested route can start a Tour, and why not otherwise', async () => {
    const run = { id: 'run-1', routeRevisionId: 'route-rev-1', robotCode: 'amr-01', checkedByUserId: 'tech-1', participatingStaffUserId: 'staff-1', resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 600, failureReason: null, evidenceNote: 'ok', checkedAt: '2026-10-28T10:00:00Z', measurementBasis: 'TOTAL_WITH_DWELL' }
    const tested = { ...currentRoute, isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: 'run-1', testRuns: [run] }
    currentRoute = tested
    const ready = renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Dùng được để tạo Tour/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tạo Tour' })).toHaveAttribute('href', '/staff/manage/tours/new')
    expect(screen.queryByText(/Chưa xếp lịch/)).not.toBeInTheDocument()
    ready.unmount()

    currentRoute = { ...tested, testRuns: [{ ...run, measurementBasis: null }] }
    const old = renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/đo theo định nghĩa cũ/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tạo Tour' })).not.toBeInTheDocument()
    old.unmount()

    currentRoute = { ...tested, isActive: false }
    renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Tuyến đang ngừng sử dụng nên chưa tạo được Tour mới/)).toBeInTheDocument()
  })

  it('explains a submit refused because the map lost its technical check', async () => {
    submissionFailure = 409
    submissionFailureBody = { success: false, message: 'Không có robot nào đạt.', errors: { code: 'TECHNICAL_CHECK_NOT_PASSED', fields: null } }
    renderAt('/staff/manage/routes/route-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Gửi kiểm chứng tuyến' }))
    expect(await screen.findByText(/Nhờ Kỹ thuật kiểm tra lại bản đồ/)).toBeInTheDocument()
    expect(currentRoute.isSubmitted).toBe(false)
  })

  it('saves stops in the order shown after moving one up', async () => {
    extraProposals = [{ ...proposals[0], id: 'p-second', revision: { ...proposals[0].revision, id: 'poi-rev-second', name: 'Second stop' } }]
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Ordered' } })
    fireEvent.change(screen.getByLabelText('Phiên bản bản đồ'), { target: { value: 'map-v1' } })
    next()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Verified entrance/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Second stop/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Đưa Second stop lên' }))
    fireEvent.change(screen.getByLabelText('Thời gian dừng Second stop (giây)'), { target: { value: '45' } })
    expect(screen.getAllByRole('checkbox').map(box => box.closest('label')?.textContent)).toEqual([expect.stringContaining('Second stop'), expect.stringContaining('Verified entrance')])
    next()
    startFromPoi('poi-rev-second')
    next()
    expect(within(screen.getByRole('region', { name: 'Xem lại và lưu' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Second stop · dừng 45 giây', 'Verified entrance · dừng 30 giây'])
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')).toBe(true))
    const body = JSON.parse(String(requests.find(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')!.init?.body))
    expect(body.stops.map((stop: { poiRevisionId: string; dwellSeconds: number }) => [stop.poiRevisionId, stop.dwellSeconds])).toEqual([['poi-rev-second', 45], ['poi-rev-pass', 30]])
  })

  it('shows the route in plain words and keeps identifiers under technical details', async () => {
    currentRoute = { ...route, isSubmitted: true, verificationStatus: 'NOT_TESTED', dwellDurationSeconds: 120 } as typeof route
    renderAt('/staff/manage/routes/route-1')
    expect(await screen.findByText(/Đang chờ Kỹ thuật chạy thử/)).toBeInTheDocument()
    expect(screen.getAllByText('Chờ kiểm chứng').length).toBeGreaterThan(0)
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
    expect(await screen.findByText(/Phiên bản hoặc dữ liệu nguồn đã thay đổi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tải lại phiên bản' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(currentRoute.isSubmitted).toBe(false)
    expect(requests.filter(item => item.url.pathname.endsWith('/submit'))).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại phiên bản' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tải lại phiên bản' })).not.toBeInTheDocument())
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
    expect(screen.getByText(/phiên bản cũ, chỉ xem được/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi kiểm chứng tuyến' })).not.toBeInTheDocument()
  })
})
