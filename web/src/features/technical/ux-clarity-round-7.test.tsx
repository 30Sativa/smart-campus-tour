import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TechnicalPoisPage from '../../routes/technical/TechnicalPoisPage'
import TechnicalRouteTestsPage from '../../routes/technical/TechnicalRouteTestsPage'
import { buttonClass } from '../../components/ui/ui-classes'
import { useAuthStore } from '../../stores/auth-store'
import { useToastStore } from '../../components/ui/toast-store'
import { DEFAULT_POI_MAP } from '../administration/pois/map/catalog'

// The POI dialogs draw a read-only map; jsdom cannot decode the package, so the raster is given.
vi.mock('../administration/pois/map/use-map-raster', () => ({
  useMapRaster: () => ({ map: { ...DEFAULT_POI_MAP, width: 40, height: 30, origin: [-1, -1, 0] }, error: null, retry: () => {} }),
}))
vi.mock('../administration/pois/map/load-map-image', () => ({ loadMapImage: vi.fn().mockResolvedValue({ pixels: null }) }))

const map = { id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1', frameId: 'map' }
const readiness = { state: 'READY', reasonCode: null, reason: null, mapVersionId: 'map-v1', mapLabel: 'Library · v1', deploymentCheckedAt: '2026-10-27T10:00:00Z', reportingOnAssignedMap: true, nextStep: null, detail: null }
const readyRobot = { id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01', connectionStatus: 'CONNECTED', assignedMapVersionId: 'map-v1', readiness }
const revision = { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Cổng thư viện', purpose: 'Lối vào', description: null,
  x: 10.25, y: -8.73, yaw: -1.2043, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:01:00Z', navigationStatus: 'NOT_CHECKED' }
const queueItem = { proposalId: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=', revision }

let robots: unknown[] = []
let poiQueue: unknown[] = []
let proposals: unknown[] = []
let routeQueue: unknown[] = []
let routeCatalog: unknown[] = []
let routeDetails: Record<string, unknown> = {}

const response = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const renderPage = (page: React.ReactNode, path = '/') =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{page}</MemoryRouter></QueryClientProvider>)
/** The read-only result dialog of a recorded route, opened through the page's ?route= link. */
const openResult = (route: { revisionId: string }) => {
  routeCatalog = [{ ...route, verificationStatus: 'PASS' }]
  renderPage(<TechnicalRouteTestsPage />, `/technical/route-tests?route=${route.revisionId}`)
}

beforeEach(() => {
  robots = [readyRobot]
  poiQueue = [queueItem]
  proposals = []
  routeQueue = []
  routeCatalog = []
  routeDetails = {}
  useToastStore.setState({ toasts: [] })
  useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/maps/versions') return response([{ map, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, runningRobot: null, currentlyDeployedOn: [] }])
    if (url.pathname === '/api/technical/physical-robots') return response(robots)
    if (url.pathname === '/api/technical/poi-verifications') return response(poiQueue)
    if (url.pathname === '/api/staff/poi-proposals') return response(proposals)
    if (url.pathname === '/api/technical/route-verifications/queue') return response(routeQueue)
    if (url.pathname === '/api/technical/route-verifications/participants') return response([{ userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' }])
    if (url.pathname === '/api/routes') return response(routeCatalog)
    if (url.pathname === '/api/routes/route-1/revisions') return response(routeDetails[url.searchParams.get('revisionId') ?? ''] ?? null)
    return response(null)
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('POI verification for a newcomer (round 7)', () => {
  it('3.1 gives the pose in metres and degrees, keeps radians in the title, copies x y yaw and draws the POI read-only', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderPage(<TechnicalPoisPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Cổng thư viện' }))
    const detail = within(await screen.findByRole('dialog'))
    const pose = detail.getByText('x 10.25 m · y −8.73 m · hướng −69°')
    expect(pose).toHaveAttribute('title', 'yaw -1.2043 rad')
    fireEvent.click(detail.getByRole('button', { name: 'Sao chép pose' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('10.25 -8.73 -1.2043'))
    expect(await detail.findByRole('group', { name: 'Bản đồ occupancy ROS' })).toBeInTheDocument()
    expect(detail.getByText('Vị trí đã khóa, chỉ xem và di chuyển bản đồ.')).toBeInTheDocument()
    // The check dialog carries the same help.
    fireEvent.click(detail.getByRole('button', { name: 'Ghi kết quả' }))
    const check = within(await screen.findByRole('dialog', { name: 'Kiểm chứng Cổng thư viện' }))
    expect(check.getByText('x 10.25 m · y −8.73 m · hướng −69°')).toBeInTheDocument()
    expect(check.getByRole('button', { name: 'Sao chép pose' })).toBeInTheDocument()
    expect(await check.findByRole('group', { name: 'Bản đồ occupancy ROS' })).toBeInTheDocument()
  })

  it('3.2 says no robot is ready on the POI map and turns Ghi kết quả secondary, still opening the form', async () => {
    robots = [{ ...readyRobot, readiness: { ...readiness, state: 'NOT_READY', reasonCode: 'ROBOT_DEPLOYMENT_CHECK_REQUIRED', reason: 'Robot amr-01 chưa kiểm tra triển khai.' } }]
    renderPage(<TechnicalPoisPage />)
    expect(await screen.findByText('Chưa có robot sẵn sàng trên bản đồ này')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Ghi kết quả' })
    expect(button.className).toBe(buttonClass('secondary', 'sm'))
    fireEvent.click(button)
    expect(await screen.findByRole('dialog', { name: 'Kiểm chứng Cổng thư viện' })).toBeInTheDocument()
  })

  it('3.2 keeps Ghi kết quả primary and says nothing when a robot is ready', async () => {
    renderPage(<TechnicalPoisPage />)
    const button = await screen.findByRole('button', { name: 'Ghi kết quả' })
    await waitFor(() => expect(button.className).toBe(buttonClass('primary', 'sm')))
    expect(screen.queryByText('Chưa có robot sẵn sàng trên bản đồ này')).not.toBeInTheDocument()
  })

  it('3.3 keeps a revision Staff sent again after a FAIL in Chờ kiểm chứng, and the FAIL tab is neutral', async () => {
    poiQueue = [{ ...queueItem, revision: { ...revision, navigationStatus: 'FAIL' } }]
    renderPage(<TechnicalPoisPage />)
    expect(await screen.findByText('Gửi lại sau lần không đạt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chờ kiểm chứng: 1/ })).toBeInTheDocument()
    const failTab = screen.getByRole('button', { name: /Không đạt · chờ Staff/ })
    expect(failTab.className).not.toMatch(/b23e31|c9534a/)
  })

  it('3.4 asks for the reason with the robot-side next step on a FAIL', async () => {
    renderPage(<TechnicalPoisPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    const check = within(await screen.findByRole('dialog', { name: 'Kiểm chứng Cổng thư viện' }))
    fireEvent.click(check.getByRole('checkbox', { name: 'Robot tới đúng POI' }))
    fireEvent.click(check.getByRole('checkbox', { name: 'Robot tới đúng POI' }))
    expect(check.getByText('Staff sẽ thấy lý do này, sửa POI và gửi lại phiên bản mới. Nếu lỗi do robot (định vị, dừng), sửa robot rồi nhờ Staff gửi lại cùng vị trí.')).toBeInTheDocument()
  })

  it('3.5 says where a passed POI with no submit time came from', async () => {
    poiQueue = []
    proposals = [
      { id: 'p-file', currentRevision: 1, rowVersion: 'A', sourcePoiId: 'POI_02', revision: { ...revision, id: 'r-file', name: 'Từ file', submittedAt: null, navigationStatus: 'PASS' } },
      { id: 'p-old', currentRevision: 1, rowVersion: 'B', sourcePoiId: null, revision: { ...revision, id: 'r-old', name: 'Dữ liệu cũ', submittedAt: null, navigationStatus: 'PASS' } },
    ]
    renderPage(<TechnicalPoisPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Đã đạt: 2/ }))
    expect(within(screen.getByText('Từ file').closest('tr')!).getByText('Nhập từ file')).toBeInTheDocument()
    expect(within(screen.getByText('Dữ liệu cũ').closest('tr')!).getByText('Không có thời điểm gửi (dữ liệu cũ)')).toBeInTheDocument()
  })
})

const stop = (id: string, name: string, stopOrder: number, poiRevisionId = `poi-${id}`, x = stopOrder) =>
  ({ id, name, stopOrder, poiRevisionId, poiProposalId: `proposal-${name}`, dwellSeconds: 40, headSteps: [], x, y: 0, yaw: 0, cameraPreset: 'FRONT', sourcePoiVerificationRecordId: 'v' })
const history = [
  { revisionId: 'rev-1', revisionNumber: 1, configurationFingerprint: 'f1', createdAt: '2026-11-17T05:21:00Z', isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: null, mapVersionId: 'map-v1', mapPackageSha256: 'a' },
  { revisionId: 'rev-2', revisionNumber: 2, configurationFingerprint: 'f1', createdAt: '2026-11-18T02:00:00Z', isSubmitted: true, verificationStatus: 'PASS', effectiveTestRunId: null, mapVersionId: 'map-v1', mapPackageSha256: 'a' },
]
const baseRoute = { routeId: 'route-1', name: 'Tuyến thư viện', mapVersionId: 'map-v1', mapKey: 'library-v1', mapPackageSha256: 'a', startX: 0, startY: 0, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null,
  isSubmitted: true, dwellDurationSeconds: 80, testRuns: [], effectiveTestRunId: null, revisionHistory: history, eligibilityIssues: [] }
const run = (over: Record<string, unknown>) => ({ robotCode: 'amr-01', participatingStaffUserId: 'staff-1', resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 0, failureReason: null, evidenceNote: 'Đã chạy.', ...over })

describe('route tests for a newcomer (round 7)', () => {
  it('4.1 counts a newer POI revision at the same place as one POI, not one added and one removed, and needs no rerun once passed', async () => {
    const before = { ...baseRoute, revisionId: 'rev-1', revisionNumber: 1, configurationFingerprint: 'f1', verificationStatus: 'PASS', stops: [stop('a1', 'Sảnh', 1, 'poi-a'), stop('b1', 'Thư viện', 2)] }
    const after = { ...baseRoute, revisionId: 'rev-2', revisionNumber: 2, configurationFingerprint: 'f1', verificationStatus: 'PASS', effectiveTestRunId: 'run-1',
      testRuns: [run({ id: 'run-1', routeRevisionId: 'rev-1', checkedAt: '2026-11-17T06:00:00Z' })], stops: [stop('a2', 'Sảnh', 1, 'poi-a'), stop('b2', 'Thư viện', 2, 'poi-b1-v2')] }
    routeDetails = { 'rev-1': before, 'rev-2': after }
    routeCatalog = [after]
    renderPage(<TechnicalRouteTestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Đã đạt: 1/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Xem kết quả Tuyến thư viện' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi lần chạy mới' }))
    const summary = await screen.findByText(/So với phiên bản 1 \(17\/11 12:21\):/)
    expect(summary.closest('p')).toHaveTextContent('So với phiên bản 1 (17/11 12:21): 1 POI có phiên bản mới (Thư viện). Bản này đã có lần chạy đạt.')
    expect(summary.closest('p')).not.toHaveTextContent(/thêm|bớt|cần chạy thử lại/)
  })

  it('4.2 names the driven stops of a run recorded on another revision from that revision', async () => {
    const own = { ...baseRoute, revisionId: 'rev-2', revisionNumber: 2, configurationFingerprint: 'f1', verificationStatus: 'LEGS_INCOMPLETE', viewerChoosesNextStop: true,
      legCoverage: { requiredCount: 2, coveredCount: 1, missingLegs: [] }, stops: [stop('a2', 'Sảnh', 1), stop('b2', 'Thư viện', 2)],
      testRuns: [run({ id: 'run-1', routeRevisionId: 'rev-1', checkedAt: '2026-11-17T06:00:00Z', traversedStopIds: ['a1', 'b1'] })], effectiveTestRunId: 'run-1' }
    routeDetails = { 'rev-2': own, 'rev-1': { ...own, revisionId: 'rev-1', revisionNumber: 1, stops: [stop('a1', 'Sảnh', 1), stop('b1', 'Thư viện', 2)] } }
    openResult(own)
    // The run's ids are rev-1's stops; the viewed revision alone would read "Bắt đầu → POI → POI → Kết thúc".
    expect(await screen.findByText('Thứ tự đã đi: Bắt đầu → Sảnh → Thư viện → Kết thúc')).toBeInTheDocument()
    expect(screen.getByText('Ghi trên phiên bản 1 (17/11 12:21), cùng đường đi nên tính cho bản này.')).toBeInTheDocument()
  })

  it('4.2 uses the step names the server sends with the run, without reading its revision', async () => {
    const own = { ...baseRoute, revisionId: 'rev-2', revisionNumber: 2, configurationFingerprint: 'f1', verificationStatus: 'LEGS_INCOMPLETE', viewerChoosesNextStop: true,
      legCoverage: { requiredCount: 2, coveredCount: 1, missingLegs: [] }, stops: [stop('a2', 'Sảnh', 1)], effectiveTestRunId: 'run-1',
      testRuns: [run({ id: 'run-1', routeRevisionId: 'rev-1', checkedAt: '2026-11-17T06:00:00Z', traversedStopIds: ['a1', 'b1'],
        traversedStops: [{ stopId: 'a1', stopOrder: 1, name: 'Sảnh cũ', poiRevisionId: 'p1' }, { stopId: 'b1', stopOrder: 2, name: 'Thư viện cũ', poiRevisionId: 'p2' }] })] }
    routeDetails = { 'rev-2': own }
    openResult(own)
    expect(await screen.findByText('Thứ tự đã đi: Bắt đầu → Sảnh cũ → Thư viện cũ → Kết thúc')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('revisionId=rev-1'))).toBe(false)
  })

  it('4.3 tags each counted PASS of a voting route with the legs, and keeps Kết quả hiện tại off them', async () => {
    const own = { ...baseRoute, revisionId: 'rev-2', revisionNumber: 2, configurationFingerprint: 'f1', verificationStatus: 'LEGS_INCOMPLETE', viewerChoosesNextStop: true,
      legCoverage: { requiredCount: 7, coveredCount: 5, missingLegs: [] }, stops: [stop('a2', 'Sảnh', 1), stop('b2', 'Thư viện', 2)], effectiveTestRunId: 'run-3',
      testRuns: [
        run({ id: 'run-1', routeRevisionId: 'rev-2', checkedAt: '2026-11-18T03:00:00Z', traversedStopIds: ['a2', 'b2'] }),
        run({ id: 'run-2', routeRevisionId: 'rev-2', checkedAt: '2026-11-18T04:00:00Z', resultCode: 'FAIL', failureReason: 'Kẹt cửa' }),
        run({ id: 'run-3', routeRevisionId: 'rev-2', checkedAt: '2026-11-18T05:00:00Z', traversedStopIds: ['a2', 'b2'] }),
      ] }
    routeDetails = { 'rev-2': own }
    openResult(own)
    const newest = await screen.findByRole('region', { name: /Lần chạy .*12:00/ })
    expect(within(newest).getByText('Tính vào 5/7 chặng')).toBeInTheDocument()
    expect(screen.queryByText('Kết quả hiện tại')).not.toBeInTheDocument()
    // Before the newest FAIL: no longer counted.
    expect(within(screen.getByRole('region', { name: /Lần chạy .*10:00/ })).queryByText(/Tính vào/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /Lần chạy .*11:00/ })).queryByText(/Tính vào|Kết quả hiện tại/)).not.toBeInTheDocument()
  })

  it('4.3 says how a fixed route and a voting route turn runs into a result', async () => {
    routeQueue = [{ ...baseRoute, revisionId: 'rev-2', revisionNumber: 2, configurationFingerprint: 'f1', verificationStatus: 'NOT_TESTED', stops: [stop('a2', 'Sảnh', 1)] }]
    renderPage(<TechnicalRouteTestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả Tuyến thư viện' }))
    expect(await screen.findByText(/Lần chạy mới nhất trên đường đi này là kết quả hiện tại, cho mọi phiên bản có cùng đường đi\./)).toBeInTheDocument()
    expect(screen.queryByText(/đang áp dụng|bản lưu/)).not.toBeInTheDocument()
  })
})
