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
import { MemoryRouter, Route, Routes } from 'react-router'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import TechnicalMapsPage from '../../routes/technical/TechnicalMapsPage'
import TechnicalDashboardPage from '../../routes/technical/TechnicalDashboardPage'
import TechnicalMonitoringPage from '../../routes/technical/TechnicalMonitoringPage'
import { useAuthStore } from '../../stores/auth-store'
import type { PhysicalRobotOption, RobotCredentialView } from './api/technical'
import type { RobotDiagnosticsDetail, TechnicalActionItem, TechnicalDashboard, TechnicalRobotSummary } from './api/diagnostics-api'
import { TechnicalBell } from './TechnicalBell'
import { connectionStatusLabel, credentialText, dispatchText, mapText, miniPcText, robotNameHint, setupText } from './technical-format'

// Round 7 (27/11): a freshly registered robot walked through the setup by someone new to the Technical area.
const betea = {
  id: 'map-betea', areaKey: 'betea', areaName: 'Betea', versionNumber: 1, mapKey: 'betea-v1', packageFileName: 'betea-v1.zip', packageSha256: 'a'.repeat(64),
  imageFileName: 'map.pgm', imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-11-20T08:00:00Z',
}
const mapItem = (overrides: Record<string, unknown> = {}) => ({ map: betea, runningRobot: null, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null,
  preparationBlockReason: null, preparationEvidence: null, currentlyDeployedOn: [], ...overrides })
const fresh: PhysicalRobotOption = {
  id: 'robot-1', robotCode: 'amr_09', displayName: 'Robot mới', firstAcceptedSyncAt: null, firstAcceptedMapKey: null, firstAcceptedFrameId: null,
  connectionStatus: 'UNCONFIRMED', lastSyncReceivedAt: null, rowVersion: 'AAAAAAAAAAA=',
  assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null,
  latestDeployedMapKey: null, latestDeployedFrameId: null, latestDeploymentPassed: null,
  needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: false,
  readiness: { state: 'NOT_SET_UP', reasonCode: 'ROBOT_MAP_NOT_ASSIGNED', reason: 'Robot amr_09 chưa được gán bản đồ.', detail: null, nextStep: 'ASSIGN_MAP', mapVersionId: null, mapLabel: null, deploymentCheckedAt: null, reportingOnAssignedMap: false },
}
// Assigned, reporting, waiting for its deployment check.
const assigned: PhysicalRobotOption = {
  ...fresh, firstAcceptedSyncAt: '2026-11-27T01:00:00Z', firstAcceptedMapKey: 'betea-v1', firstAcceptedFrameId: 'map', connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-11-27T02:00:00Z',
  assignedMapVersionId: 'map-betea', assignedAreaName: 'Betea', assignedVersionNumber: 1, assignedMapKey: 'betea-v1', assignedFrameId: 'map', mapAssignedAt: '2026-11-27T00:30:00Z', mapAssignedByName: 'tech',
  readiness: { state: 'NOT_READY', reasonCode: 'ROBOT_DEPLOYMENT_CHECK_REQUIRED', reason: 'Robot amr_09 chưa kiểm tra triển khai trên Betea · v1.', detail: null, nextStep: 'DEPLOYMENT_CHECK',
    mapVersionId: 'map-betea', mapLabel: 'Betea · v1', deploymentCheckedAt: null, reportingOnAssignedMap: true },
}
const ready: PhysicalRobotOption = { ...assigned, latestDeployedMapKey: 'betea-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true,
  readiness: { ...assigned.readiness, state: 'READY', reasonCode: null, reason: null, nextStep: null, deploymentCheckedAt: '2026-11-27T01:30:00Z' } }
const credential = (status: RobotCredentialView['status']): RobotCredentialView => ({ robotCode: 'amr_09', status, issuedAt: null, issuedByUserId: null, issuedByName: null,
  hint: status === 'ACTIVE' ? 'ab12' : null, revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] })

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let robots: PhysicalRobotOption[] = []
let maps = [mapItem()]
let key: RobotCredentialView['status'] | 'loading' = 'NOT_ISSUED'
let dashboard: TechnicalDashboard
let detail: RobotDiagnosticsDetail
let requested: string[] = []

function api(url: URL, init?: RequestInit): Response | Promise<Response> {
  requested.push(`${init?.method ?? 'GET'} ${url.pathname}`)
  if (url.pathname === '/api/technical/robots/amr_09/credential' && init?.method === 'POST') return ok({ secret: 'not-for-the-minipc-block', hint: 'cd34', issuedAt: '2026-11-27T03:00:00Z' })
  if (url.pathname === '/api/maps/versions/map-betea/package') return new Response(new Blob(['zip']), { status: 200, headers: { 'Content-Type': 'application/zip' } })
  switch (url.pathname) {
    case '/api/maps/versions': return ok(maps)
    case '/api/technical/map-areas': return ok([{ areaKey: 'betea', displayName: 'Betea' }])
    case '/api/technical/physical-robots': return ok(robots)
    case '/api/robots/amr_09/credential': return key === 'loading' ? new Promise<Response>(() => {}) : ok(credential(key))
    case '/api/technical/dashboard': return ok(dashboard)
    case '/api/technical/robots/amr_09/diagnostics': return ok(detail)
    default: return ok([])
  }
}

function renderAt(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/technical/robots" element={<TechnicalRobotsPage />} />
      <Route path="/technical/maps" element={<TechnicalMapsPage />} />
      <Route path="/technical" element={<><TechnicalBell /><TechnicalDashboardPage /></>} />
      <Route path="/technical/monitoring" element={<TechnicalMonitoringPage />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>)
}

const setupDialog = async () => within(await screen.findByRole('dialog', { name: 'Robot mới' }))
const readinessBlock = async () => within((await setupDialog()).getByRole('region', { name: 'Trạng thái sẵn sàng' }))

const summary = (overrides: Partial<TechnicalRobotSummary> = {}): TechnicalRobotSummary => ({
  id: 'robot-1', robotCode: 'amr_09', displayName: 'Robot mới', connectionStatus: 'CONNECTED', syncFresh: true, lastSeenAt: '2026-11-27T02:00:00Z', batteryPercent: 80,
  assignedMapKey: 'betea-v1', assignedFrameId: 'map', latestDeployedMapKey: 'betea-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true, contextMismatch: false,
  localized: true, motionReady: true, needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, rowVersion: 'AAAA',
  hasDiagnostics: false, diagnosticsFresh: false, cpuPercent: null, cpuTemperatureCelsius: null, lidarStatus: null, imuStatus: null, ...overrides,
})
const dashboardOf = (rows: TechnicalRobotSummary[], actionItems: TechnicalActionItem[] = []): TechnicalDashboard => ({
  collectedAt: '2026-11-27T02:00:05Z', actionItems, robots: rows,
  kpis: { totalRobots: rows.length, connectedRobots: rows.length, awaitingDataRobots: 0, disconnectedRobots: 0, unconfirmedRobots: 0, heldForInspectionCount: 0, pendingPoiVerificationsCount: 0, pendingRouteTestsCount: 0, activeMapVersionsCount: 1 },
})
const detailOf = (overrides: Partial<RobotDiagnosticsDetail> = {}): RobotDiagnosticsDetail => ({
  robotCode: 'amr_09', displayName: 'Robot mới', connectionStatus: 'CONNECTED', assignedMapKey: 'betea-v1', assignedFrameId: 'map', assignedAreaName: 'Betea', assignedVersionNumber: 1,
  latestDeployedMapKey: 'betea-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true, needsInspection: false, currentTourName: null, currentTourState: null,
  lastSeenAt: '2026-11-27T02:00:00Z', telemetryFresh: true, pose: null, batteryPercent: 80, operationalStatus: 'IDLE', localized: true, motionReady: true, faultCode: null,
  lastDiagnosticsReceivedAt: null, diagnosticsFresh: false, miniPc: null, ros2: null, sensors: null, ...overrides,
})

describe('round 7: the Technical area for someone new', () => {
  beforeEach(() => {
    robots = [fresh]
    maps = [mapItem()]
    key = 'NOT_ISSUED'
    requested = []
    dashboard = dashboardOf([])
    detail = detailOf()
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => api(new URL(String(input), 'http://localhost'), init)))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useAuthStore.getState().logout()
  })

  describe('1.1 the main line is the next step', () => {
    it('says "Cấp khóa cho MiniPC" first, with the server reason underneath, in the list and the setup dialog', async () => {
      renderAt('/technical/robots')
      const row = (await screen.findByText('amr_09')).closest('tr')!
      expect(await within(row).findByText(setupText.mainLine.key)).toBeInTheDocument()
      expect(within(row).getByText('Robot amr_09 chưa được gán bản đồ.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Thiết lập amr_09' }))
      const block = await readinessBlock()
      expect(await block.findByText(setupText.mainLine.key)).toBeInTheDocument()
      expect(block.getByText('Robot amr_09 chưa được gán bản đồ.')).toHaveClass('text-xs')
    })

    it('says "Gán bản đồ cho robot" once the key is active', async () => {
      key = 'ACTIVE'
      renderAt('/technical/robots?robot=robot-1')
      const block = await readinessBlock()
      expect(await block.findByText(setupText.mainLine.map)).toBeInTheDocument()
      expect(block.queryByText(setupText.mainLine.key)).not.toBeInTheDocument()
    })

    it('keeps the server reason as the main line for the steps after the map', async () => {
      key = 'ACTIVE'
      robots = [assigned]
      renderAt('/technical/robots?robot=robot-1')
      const block = await readinessBlock()
      expect(await block.findByText('Robot amr_09 chưa kiểm tra triển khai trên Betea · v1.')).toHaveClass('text-[13px]')
      expect(block.queryByText(setupText.mainLine.map)).not.toBeInTheDocument()
    })
  })

  it('1.2 numbers the setup once: the map sections are named without numbers, and step 5 points to the section by name', async () => {
    key = 'ACTIVE'
    robots = [assigned]
    renderAt('/technical/robots?robot=robot-1')
    const dialog = await setupDialog()
    for (const name of ['Chọn bản đồ', 'Cấu hình MiniPC', 'Kiểm tra tại robot']) expect(dialog.getByRole('region', { name })).toBeInTheDocument()
    expect(dialog.queryByRole('region', { name: /^\d\. / })).not.toBeInTheDocument()
    const checklist = dialog.getByRole('region', { name: 'Thiết lập robot' })
    await waitFor(() => expect(checklist).toHaveTextContent(setupText.deployHint))
    expect(checklist).not.toHaveTextContent('bước 3')
  })

  it('1.3 lists what to type on the MiniPC, copies it, and never carries the key', async () => {
    key = 'ACTIVE'
    robots = [assigned]
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    renderAt('/technical/robots?robot=robot-1')
    const block = within((await setupDialog()).getByRole('region', { name: miniPcText.title }))
    const env = 'FLEET_ROBOT_CODE=amr_09\nFLEET_ROBOT_MAP_KEY=betea-v1\nFLEET_ROBOT_FRAME_ID=map\nFLEET_ROBOT_CREDENTIAL_FILE=<tệp khóa>'
    expect(block.getByText('~/.config/campustour/fleet-sync.env')).toBeInTheDocument()
    expect(block.getByText((_, element) => element?.tagName === 'PRE' && element.textContent === env)).toBeInTheDocument()
    expect(block.getByText(/quyền 0600/)).toBeInTheDocument()
    expect(await block.findByText(/Giải nén betea-v1\.zip vào robot_maps, rồi trong ~\/\.config\/sct-robot\/runtime\.env đặt MAP= là tệp \.yaml/)).toBeInTheDocument()
    expect(block.getByText(/robot fleet start/)).toBeInTheDocument()
    fireEvent.click(block.getByRole('button', { name: miniPcText.copy }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(env))
    expect(env).not.toMatch(/ab12|secret/)
  })

  it('1.4 names the key dialog for the MiniPC and says which file the key goes into', async () => {
    renderAt('/technical/robots?robot=robot-1')
    fireEvent.click((await setupDialog()).getByRole('button', { name: /Quản lý khóa/ }))
    const dialog = within(await screen.findByRole('dialog', { name: credentialText.title('amr_09') }))
    fireEvent.click(await dialog.findByRole('button', { name: 'Cấp khóa' }))
    expect(await dialog.findByText('Lưu khóa vào tệp mà FLEET_ROBOT_CREDENTIAL_FILE trỏ tới, quyền 0600 (chmod 600). Đóng mục này sẽ xóa bí mật khỏi giao diện.')).toBeInTheDocument()
  })

  it('1.5 says "Đang kiểm tra khóa…" while the key loads: not done, not next, no Cấp khóa button', async () => {
    key = 'loading'
    renderAt('/technical/robots?robot=robot-1')
    const block = await readinessBlock()
    const checklist = within(block.getByRole('region', { name: 'Thiết lập robot' }))
    expect(checklist.getByText(setupText.keyChecking)).toBeInTheDocument()
    expect(checklist.getByText('Cấp khóa kết nối MiniPC')).toHaveTextContent('đang kiểm tra')
    expect(block.queryByRole('button', { name: /Cấp khóa/ })).not.toBeInTheDocument()
    expect(block.queryByRole('button', { name: /Gán bản đồ/ })).not.toBeInTheDocument()
    expect(checklist.queryByText(/bước tiếp theo/)).not.toBeInTheDocument()
    expect(block.queryByText(setupText.mainLine.key)).not.toBeInTheDocument()
  })

  describe('1.6 dispatch', () => {
    it('cannot be allowed before the robot is ready, and says why', async () => {
      key = 'ACTIVE'
      robots = [assigned]
      renderAt('/technical/robots?robot=robot-1')
      const section = within((await setupDialog()).getByRole('region', { name: 'Điều phối Tour' }))
      expect(section.getByText(dispatchText.offHint)).toBeInTheDocument()
      expect(section.getByRole('button', { name: 'Cho phép điều phối' })).toBeDisabled()
      expect(section.getByText(dispatchText.notReady)).toBeInTheDocument()
    })

    it('can always be turned off, ready or not', async () => {
      key = 'ACTIVE'
      robots = [{ ...assigned, isDispatchEnabled: true }]
      renderAt('/technical/robots?robot=robot-1')
      const section = within((await setupDialog()).getByRole('region', { name: 'Điều phối Tour' }))
      expect(section.getByRole('button', { name: 'Tắt điều phối' })).toBeEnabled()
    })

    it('asks for supervised test-run evidence (GATE A) on a ready robot', async () => {
      key = 'ACTIVE'
      robots = [ready]
      renderAt('/technical/robots?robot=robot-1')
      const section = within((await setupDialog()).getByRole('region', { name: 'Điều phối Tour' }))
      fireEvent.click(section.getByRole('button', { name: 'Cho phép điều phối' }))
      const confirm = within(await screen.findByRole('dialog', { name: 'Cho phép điều phối amr_09?' }))
      expect(confirm.getByLabelText('Bằng chứng chạy thử có giám sát (GATE A, bắt buộc)')).toHaveAttribute('placeholder', expect.stringContaining('Ví dụ:'))
    })
  })

  it('1.8 tells what to name a robot when registering', async () => {
    renderAt('/technical/robots')
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng ký robot' }))
    expect(screen.getByLabelText('Tên robot')).toHaveAccessibleDescription(robotNameHint)
  })

  it('2.5 calls a confirmed, reporting robot "Trực tuyến"', async () => {
    robots = [ready]
    renderAt('/technical/robots')
    const row = (await screen.findByText('amr_09')).closest('tr')!
    expect(within(row).getByText('Trực tuyến')).toBeInTheDocument()
    expect(connectionStatusLabel('CONNECTED')).toBe('Trực tuyến')
  })

  describe('Maps', () => {
    it('1.7 says "Gán cho robot…", tells the next step in the robot picker, and downloads the ZIP under its own name', async () => {
      const created: string[] = []
      URL.createObjectURL = vi.fn(() => 'blob:map')
      URL.revokeObjectURL = vi.fn()
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { created.push(this.download) })
      renderAt('/technical/maps')
      expect(await screen.findByText('Tải bản đồ lên rồi gán cho robot. Gán và kiểm tra triển khai làm trong hộp Thiết lập của robot.')).toBeInTheDocument()
      fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Betea · v1' }))
      const detailDialog = within(await screen.findByRole('dialog', { name: 'Betea · v1' }))
      expect(detailDialog.getByText(mapText.checksumHint)).toBeInTheDocument()
      fireEvent.click(detailDialog.getByRole('button', { name: mapText.download }))
      await waitFor(() => expect(created).toEqual(['betea-v1.zip']))
      expect(requested).toContain('GET /api/maps/versions/map-betea/package')
      click.mockRestore()

      fireEvent.click(detailDialog.getByRole('button', { name: mapText.assignToRobot }))
      const picker = await screen.findByRole('dialog', { name: 'Gán Betea · v1 cho robot' })
      expect(picker).toHaveTextContent('Tiếp tục để xác nhận gán trong hộp Bản đồ của robot.')
    })

    it('1.9 opens the version a "bản đồ chưa có robot" item links to', async () => {
      renderAt('/technical/maps?map=map-betea')
      expect(await screen.findByRole('dialog', { name: 'Betea · v1' })).toBeInTheDocument()
    })

    it('2.8 counts versions never checked, and the usable ones no robot holds', async () => {
      maps = [mapItem(), mapItem({ map: { ...betea, id: 'map-betea-2', versionNumber: 2 }, technicalCheckStatus: 'PENDING', canUseForPoiPreparation: false })]
      renderAt('/technical/maps')
      expect(await screen.findByText('Chưa từng kiểm tra triển khai')).toBeInTheDocument()
      expect(screen.getByText(mapText.noRobotYet(1))).toBeInTheDocument()
    })
  })

  describe('Dashboard and bell', () => {
    it('1.9 lists the new ROBOT_NOT_READY and MAP_WITHOUT_ROBOT items like the others', async () => {
      dashboard = dashboardOf([], [
        { type: 'ROBOT_NOT_READY', severity: 'WARNING', title: 'amr_09 chưa sẵn sàng', description: 'Robot amr_09 chưa kiểm tra triển khai trên Betea · v1.', targetId: 'robot-1', linkUrl: '/technical/robots?robot=robot-1' },
        { type: 'MAP_WITHOUT_ROBOT', severity: 'INFO', title: 'Betea · v1 chưa có robot', description: 'Chưa robot nào gán bản đồ này.', targetId: 'map-betea', linkUrl: '/technical/maps' },
      ])
      renderAt('/technical')
      const list = within(await screen.findByRole('region', { name: 'Việc cần xử lý' }))
      expect(await list.findByText('amr_09 chưa sẵn sàng')).toBeInTheDocument()
      expect(list.getByText('Betea · v1 chưa có robot')).toBeInTheDocument()
      expect(list.getByText('Cảnh báo')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Thông báo, 2 việc đang chờ' }))
      const bell = within(screen.getByRole('region', { name: 'Bảng thông báo' }))
      expect(bell.getByText('amr_09 chưa sẵn sàng')).toBeInTheDocument()
      expect(bell.getByText('Chưa robot nào gán bản đồ này.')).toBeInTheDocument()
    })

    it('2.2 puts the readiness chip beside Trực tuyến, and 2.7 says when a ready robot cannot drive yet', async () => {
      robots = [ready, { ...assigned, id: 'robot-2', robotCode: 'amr_10', displayName: 'Robot hai' }]
      dashboard = dashboardOf([summary({ localized: false }), summary({ id: 'robot-2', robotCode: 'amr_10', displayName: 'Robot hai' })])
      renderAt('/technical')
      const table = within(await screen.findByRole('region', { name: 'Robot và Mini PC' }))
      const first = within((await table.findByText('amr_09')).closest('tr')!)
      expect(await first.findByText('Sẵn sàng · Betea · v1')).toBeInTheDocument()
      expect(first.getByText('Trực tuyến')).toBeInTheDocument()
      expect(first.getByText(setupText.readyNotDriving)).toBeInTheDocument()
      const second = within(table.getByText('amr_10').closest('tr')!)
      expect(await second.findByText('Chưa sẵn sàng')).toBeInTheDocument()
      expect(second.queryByText(setupText.readyNotDriving)).not.toBeInTheDocument()
    })
  })

  describe('2.1 Monitoring', () => {
    it('adds Sẵn sàng with the reason, and says a pass from before the assignment needs redoing, not in green', async () => {
      robots = [assigned]
      dashboard = dashboardOf([summary()])
      detail = detailOf()
      renderAt('/technical/monitoring?robot=amr_09')
      const panel = within(await screen.findByRole('region', { name: 'Kết nối và vận hành' }))
      expect(await panel.findByText('Chưa sẵn sàng')).toBeInTheDocument()
      expect(panel.getByText('Robot amr_09 chưa kiểm tra triển khai trên Betea · v1.')).toBeInTheDocument()
      const warning = panel.getByText('Đạt, trước lần gán 27/11/2026 07:30. Cần kiểm lại.')
      expect(warning).toHaveClass('text-amber-800')
      expect(panel.queryByText('Đạt', { selector: 'span.rounded-full' })).not.toBeInTheDocument()
      // 2.6: the map by name; MapKey and FrameId stay beside it for the MiniPC.
      expect(panel.getByText('Betea · v1')).toBeInTheDocument()
      expect(panel.getByText('MapKey betea-v1 · FrameId map')).toBeInTheDocument()
    })

    it('2.7 keeps READY but says the robot reports it cannot drive yet', async () => {
      robots = [ready]
      dashboard = dashboardOf([summary()])
      detail = detailOf({ motionReady: false })
      renderAt('/technical/monitoring?robot=amr_09')
      const panel = within(await screen.findByRole('region', { name: 'Kết nối và vận hành' }))
      expect(await panel.findByText('Sẵn sàng · Betea · v1')).toBeInTheDocument()
      expect(panel.getByText(setupText.readyNotDriving)).toBeInTheDocument()
    })
  })
})
