import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import TechnicalRouteTestsPage from '../../routes/technical/TechnicalRouteTestsPage'
import TechnicalPoisPage from '../../routes/technical/TechnicalPoisPage'
import TechnicalMapsPage from '../../routes/technical/TechnicalMapsPage'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import { useAuthStore } from '../../stores/auth-store'
import { useToastStore } from '../../components/ui/toast-store'
import type { PhysicalRobotOption, RobotCredentialView, RobotReadiness } from './api/technical'

const map = {
  id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1',
  packageFileName: 'library-v1.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z',
}
/** The server's readiness; the default robot is ready on Library v1 and reporting on it. */
const readyOnLibrary: RobotReadiness = { state: 'READY', reasonCode: null, reason: null, mapVersionId: 'map-v1', mapLabel: 'Library · v1', deploymentCheckedAt: '2026-10-27T10:00:00Z', reportingOnAssignedMap: true, nextStep: null, detail: null }
const notReady = (reason: string, overrides: Partial<RobotReadiness> = {}): RobotReadiness => ({ ...readyOnLibrary, state: 'NOT_READY', reasonCode: 'ROBOT_DEPLOYMENT_CHECK_REQUIRED', reason, nextStep: 'DEPLOYMENT_CHECK', ...overrides })
const notSetUp = (reason: string): RobotReadiness => ({ state: 'NOT_SET_UP', reasonCode: 'ROBOT_MAP_NOT_ASSIGNED', reason, mapVersionId: null, mapLabel: null, deploymentCheckedAt: null, reportingOnAssignedMap: false, nextStep: 'ASSIGN_MAP', detail: null })
const mapItem = { map, runningRobot: { id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01', readiness: readyOnLibrary }, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null,
  preparationEvidence: { id: 'check-1', mapVersionId: map.id, robotCode: 'amr-01', packageSha256: 'a'.repeat(64), localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Fixture evidence', checkedAt: '2026-10-27T10:00:00Z' },
  currentlyDeployedOn: [{ robotCode: 'amr-01', checkedAt: '2026-10-27T10:00:00Z' }] }
const proposal = {
  id: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=',
  revision: { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Library', purpose: 'Entrance', description: null, x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:01:00Z', navigationStatus: 'NOT_CHECKED' },
}
const queueItem = { proposalId: proposal.id, currentRevision: proposal.currentRevision, rowVersion: proposal.rowVersion, revision: proposal.revision }
const response = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
const makePhysicalRobot = (overrides: Partial<PhysicalRobotOption> = {}): PhysicalRobotOption => ({
  id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01', firstAcceptedSyncAt: '2026-10-27T10:00:00Z', firstAcceptedMapKey: 'library-v1', firstAcceptedFrameId: 'map',
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-10-27T10:01:00Z', rowVersion: 'AAAAAAAAAAA=', assignedMapVersionId: 'map-v1', assignedAreaName: 'Library', assignedVersionNumber: 1, assignedMapKey: 'library-v1', assignedFrameId: 'map', mapAssignedAt: '2026-10-27T10:00:00Z', mapAssignedByName: 'Technical', latestDeployedMapKey: 'library-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true,
  needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: false,
  readiness: readyOnLibrary,
  ...overrides,
})
let physicalRobots: PhysicalRobotOption[] = [makePhysicalRobot()]
let affectedTours: unknown[] = []
let mapAreas = [{ areaKey: 'library', displayName: 'Library' }]
let failMapAreaLookup = false
let failDeploymentOnce = false
let failRobotLookup = false
let failRobotRegistration = false
let robotRegistrationDelayMs = 0
let failCredentialMutation = false
let mapCheckStatus: 'PENDING' | 'FAILED' | 'PASSED' = 'PASSED'
let runningRobot: unknown = mapItem.runningRobot
let poiProposals: unknown[] = []
let poiHistory: unknown = null
let verifyRefusal: { status: number; body: unknown } | null = null
let poiQueue: unknown[] = [queueItem]
let routeQueue: unknown[] = []
let routeCatalog: unknown[] = []
let routeDetail: unknown = null
let routeRefusal: { status: number; body: unknown } | null = null
let releaseRefusals: Array<{ status: number; body: unknown }> = []
let dispatchRefusals: Array<{ status: number; body: unknown }> = []
const routeFixture = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 2, name: 'Tuyến thư viện', mapVersionId: 'map-v1', mapKey: 'library-v1', stops: [{}, {}], dwellDurationSeconds: 60, expectedDurationSeconds: 410, verificationStatus: 'NOT_TESTED', isSubmitted: true, testRuns: [], effectiveTestRunId: null, revisionHistory: [] }
let credentialStatus: RobotCredentialView = { robotCode: 'amr-01', status: 'NOT_ISSUED', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: null, revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] }

const openRobotDetail = async () => fireEvent.click(await screen.findByRole('button', { name: 'Thiết lập amr-01' }))
/** Opens step 3 of the setup dialog, the on-robot deployment check, from its own button. */
const openDeployCheck = async () => {
  renderPage(<TechnicalRobotsPage />)
  await openRobotDetail()
  const step = within(await screen.findByRole('region', { name: 'Kiểm tra tại robot' }))
  fireEvent.click(step.getByRole('button', { name: /^(Kiểm tra triển khai|Kiểm tra lại)$/ }))
  return within(await screen.findByRole('form', { name: 'Kiểm tra triển khai' }))
}
/** The confirm button of the release dialog; the setup dialog's next-step button carries the same words. */
const releaseConfirm = () => within(screen.getByRole('dialog', { name: 'Trả amr-01 về sử dụng?' })).getByRole('button', { name: 'Trả robot' })
const deploymentPosts = () => requests.filter(item => item.url.pathname.endsWith('/deployment-checks') && item.init?.method === 'POST')
const chooseResult = (label: 'Đạt' | 'Không đạt') => fireEvent.click(within(screen.getByRole('group', { name: 'Kết quả' })).getByRole('button', { name: label }))
const POI_CHECKS = ['Robot tới đúng POI', 'Robot dừng đúng vị trí', 'Định vị đạt', 'Đầu camera làm đúng: Nhìn phía trước']
const passAllPoiChecks = () => { for (const label of POI_CHECKS) fireEvent.click(screen.getByLabelText(label)) }
const ROUTE_CHECKS = ['Robot đi đủ các điểm dừng', 'Robot dừng an toàn', 'Định vị đạt']
const passAllRouteChecks = () => { for (const label of ROUTE_CHECKS) fireEvent.click(screen.getByLabelText(label)) }
/** The read-only robot line of a POI check or route test: the robot is not chosen there. */
const readyRobotLine = (robotCode = 'amr-01') => screen.findByText((_, element) => element?.tagName === 'P' && (element.textContent ?? '').startsWith(`Robot: ${robotCode} · sẵn sàng trên Library · v1`))
/** The result a POI or route form will save, worked out from its ticks and shown beside the save button. */
const computedResult = () => within(screen.getByRole('dialog')).getByText(/^Kết quả:/)

/** The current address, for links a page rewrites in place. */
function LocationText() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

/** The map page and the robot page together, so a hand-over between them can be followed. */
function renderTechnicalRoutes(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/technical/maps" element={<TechnicalMapsPage />} />
    <Route path="/technical/robots" element={<TechnicalRobotsPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

function renderPage(page: React.ReactNode, path = '/') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{page}</MemoryRouter></QueryClientProvider>)
}

describe('Technical Staff API integration', () => {
  beforeEach(() => {
    requests = []
    physicalRobots = [makePhysicalRobot()]
    affectedTours = []
    mapAreas = [{ areaKey: 'library', displayName: 'Library' }]
    failMapAreaLookup = false
    failDeploymentOnce = false
    failRobotLookup = false
    failRobotRegistration = false
    robotRegistrationDelayMs = 0
    failCredentialMutation = false
    credentialStatus = { robotCode: 'amr-01', status: 'NOT_ISSUED', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: null, revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] }
    mapCheckStatus = 'PASSED'
    runningRobot = mapItem.runningRobot
    poiProposals = []
    poiHistory = null
    verifyRefusal = null
    poiQueue = [queueItem]
    routeQueue = []
    routeCatalog = []
    routeDetail = null
    routeRefusal = null
    releaseRefusals = []
    dispatchRefusals = []
    useToastStore.setState({ toasts: [] })
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      requests.push({ url, init })
      if (url.pathname === '/api/robots/amr-01/credential' && (!init?.method || init.method === 'GET')) return response(credentialStatus)
      if (url.pathname.startsWith('/api/technical/robots/amr-01/credential') && init?.method === 'POST') {
        if (failCredentialMutation) {
          failCredentialMutation = false
          return new Response(JSON.stringify({ success: false, message: 'Credential update failed.' }), { status: 503 })
        }
        credentialStatus = { ...credentialStatus, status: 'ACTIVE', hint: 'abcd', issuedAt: '2026-10-29T10:00:00Z', rowVersion: 'BBBBBBBBBBB=' }
        return response({ secret: 'secret-value-once', hint: 'abcd', issuedAt: credentialStatus.issuedAt })
      }
      if (url.pathname === '/api/maps/versions' && init?.method !== 'POST') return response([{ ...mapItem, technicalCheckStatus: mapCheckStatus, runningRobot }])
      if (url.pathname.match(/\/api\/technical\/physical-robots\/[^/]+\/map-assignment$/) && init?.method === 'PUT') {
        const robot = physicalRobots.find(item => item.id === url.pathname.split('/')[4])!
        const body = JSON.parse(String(init.body))
        const updated = { ...robot, assignedMapVersionId: body.mapVersionId, assignedAreaName: 'Library', assignedVersionNumber: 1, assignedMapKey: 'library-v1', assignedFrameId: 'map', mapAssignedAt: '2026-10-30T10:00:00Z', mapAssignedByName: 'Technical', rowVersion: 'BBBBBBBBBBB=' }
        physicalRobots = physicalRobots.map(item => item.id === robot.id ? updated : item)
        return response(updated)
      }
      if (url.pathname.match(/\/api\/technical\/physical-robots\/[^/]+\/map-assignment$/) && init?.method === 'DELETE') {
        const robot = physicalRobots.find(item => item.id === url.pathname.split('/')[4])!
        const updated = { ...robot, assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null, rowVersion: 'CCCCCCCCCCC=' }
        physicalRobots = physicalRobots.map(item => item.id === robot.id ? updated : item)
        return response(updated)
      }
      if (url.pathname === '/api/technical/map-areas') return failMapAreaLookup
        ? new Response(JSON.stringify({ success: false, message: 'Area lookup unavailable.' }), { status: 503 })
        : response(mapAreas)
      if (url.pathname === '/api/technical/physical-robots' && init?.method === 'POST') {
        if (robotRegistrationDelayMs) await new Promise(resolve => setTimeout(resolve, robotRegistrationDelayMs))
        if (failRobotRegistration) {
          failRobotRegistration = false
          return new Response(JSON.stringify({ success: false, message: 'Robot code already registered.' }), { status: 409 })
        }
        const registered = makePhysicalRobot({ id: 'robot-2', ...JSON.parse(String(init.body)), firstAcceptedSyncAt: null, firstAcceptedMapKey: null, firstAcceptedFrameId: null, connectionStatus: 'UNCONFIRMED', lastSyncReceivedAt: null, assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null, latestDeployedMapKey: null, latestDeployedFrameId: null, latestDeploymentPassed: null, readiness: notSetUp('Robot amr-02 chưa được gán bản đồ.') })
        physicalRobots = [...physicalRobots, registered]
        return response(registered)
      }
      if (url.pathname.endsWith('/affected-tours')) return response(affectedTours)
      if (url.pathname.endsWith('/deactivate') && init?.method === 'POST') {
        physicalRobots = physicalRobots.map(robot => ({ ...robot, deactivatedAt: '2026-11-01T00:00:00Z', deactivationReason: 'Hỏng động cơ' }))
        return response({ id: 'robot-1', robotCode: 'amr-01', deactivatedAt: '2026-11-01T00:00:00Z', deactivationReason: 'Hỏng động cơ', rowVersion: 'AAAAAAAAAAE=', affectedTours })
      }
      if (url.pathname.endsWith('/activate') && init?.method === 'POST') {
        physicalRobots = physicalRobots.map(robot => ({ ...robot, deactivatedAt: null, deactivationReason: null }))
        return response({ id: 'robot-1', robotCode: 'amr-01', deactivatedAt: null, deactivationReason: null, rowVersion: 'AAAAAAAAAAI=', affectedTours: [] })
      }
      if (url.pathname.endsWith('/release-inspection') && init?.method === 'POST') {
        const refusal = releaseRefusals.shift()
        if (refusal) return new Response(JSON.stringify(refusal.body), { status: refusal.status, headers: { 'Content-Type': 'application/json' } })
        physicalRobots = physicalRobots.map(robot => ({ ...robot, needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, rowVersion: 'AAAAAAAAAAM=' }))
        return response({ robotId: 'robot-1' })
      }
      if (url.pathname.endsWith('/dispatch') && init?.method === 'POST') {
        const refusal = dispatchRefusals.shift()
        if (refusal) return new Response(JSON.stringify(refusal.body), { status: refusal.status, headers: { 'Content-Type': 'application/json' } })
        const enabled = Boolean(JSON.parse(String(init.body)).enabled)
        physicalRobots = physicalRobots.map(robot => ({ ...robot, isDispatchEnabled: enabled, rowVersion: 'AAAAAAAAAAQ=' }))
        return response({ robotId: 'robot-1', isDispatchEnabled: enabled })
      }
      if (url.pathname === '/api/technical/physical-robots') return failRobotLookup
        ? new Response(JSON.stringify({ success: false, message: 'Robot lookup unavailable.' }), { status: 503 })
        : response(physicalRobots)
      if (url.pathname === '/api/technical/poi-verifications') return response(poiQueue)
      if (url.pathname === '/api/technical/map-versions' && init?.method === 'POST') return response({ ...map, versionNumber: 2, mapKey: 'library-v2' })
      if (url.pathname === '/api/technical/map-versions/map-v1/deployment-checks' && init?.method === 'POST') {
        if (failDeploymentOnce) { failDeploymentOnce = false; return new Response(JSON.stringify({ success: false, message: 'Temporary server error.' }), { status: 503 }) }
        return response({ id: 'check-1', mapVersionId: 'map-v1', robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Checked', checkedAt: '2026-10-27T10:00:00Z' })
      }
      if (url.pathname.endsWith('/verification')) return verifyRefusal
        ? new Response(JSON.stringify({ success: false, ...(verifyRefusal.body as object) }), { status: verifyRefusal.status })
        : response({ id: 'verification-1' })
      if (url.pathname === '/api/staff/poi-proposals') return response(poiProposals)
      if (url.pathname === '/api/technical/route-verifications/queue') return response(routeQueue)
      if (url.pathname === '/api/technical/route-verifications/participants') return response([{ userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' }])
      if (url.pathname === '/api/routes') return response(routeCatalog)
      if (url.pathname === '/api/routes/route-1/revisions') return response(routeDetail)
      if (url.pathname.endsWith('/test-runs')) return routeRefusal
        ? new Response(JSON.stringify({ success: false, ...(routeRefusal.body as object) }), { status: routeRefusal.status })
        : response(routeFixture)
      if (url.pathname.endsWith('/history')) return response(poiHistory)
      return response(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); useAuthStore.getState().logout() })

  // The map page no longer records deployment checks (spec W3): the check moved into the robot's setup dialog, so
  // this test now asserts the running robot and the absence of the old "Ghi kết quả kiểm tra" button.
  it('shows the robot running each area from runningRobot and records no check on the map page', async () => {
    renderPage(<TechnicalMapsPage />)
    expect(await screen.findByRole('heading', { name: 'Bản đồ', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Khu vực/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Tệp bản đồ/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Robot đang chạy/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Chạy thử trên robot/ })).not.toBeInTheDocument()
    expect(screen.getByText('Hợp lệ')).toBeInTheDocument()
    expect(screen.getByText('AMR 01')).toBeInTheDocument()
    expect(screen.getByText('Sẵn sàng · Library · v1')).toBeInTheDocument()
    expect(screen.getByText('Dùng được để soạn POI')).toBeInTheDocument()
    expect(screen.getByText('Có robot sẵn sàng')).toBeInTheDocument()
    expect(screen.queryByText('Đủ điều kiện tạo POI')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ghi kết quả kiểm tra' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Library · v1' }))
    const detail = within(await screen.findByRole('dialog', { name: 'Library · v1' }))
    expect(detail.queryByRole('button', { name: 'Ghi kết quả kiểm tra' })).not.toBeInTheDocument()
    expect(detail.getByText('Robot đang chạy')).toBeInTheDocument()
    expect(detail.queryByText('Robot được gán')).not.toBeInTheDocument()
    expect(detail.queryByText('Robot kiểm tra đạt')).not.toBeInTheDocument()
    expect(detail.getByRole('link', { name: 'AMR 01 · amr-01' })).toHaveAttribute('href', '/technical/robots?robot=robot-1')
    expect(detail.getByText('Đã từng kiểm tra đạt')).toBeInTheDocument()
    expect(detail.getByText(/^amr-01 · /)).toBeInTheDocument()
    expect(requests.some(item => item.url.pathname.endsWith('/deployment-checks'))).toBe(false)
  })

  it('says Chưa có robot for an area nobody runs, even where a robot once passed its check', async () => {
    runningRobot = null
    renderPage(<TechnicalMapsPage />)
    expect(await screen.findByText('Chưa có robot')).toBeInTheDocument()
    expect(screen.queryByText('AMR 01')).not.toBeInTheDocument()
  })

  // Round 2 W3: the subline under "Robot đang chạy" said a robot held the version when none did.
  it('says no robot holds the version and how to assign one, and keeps the sentence when one does', async () => {
    runningRobot = null
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Library · v1' }))
    const detail = within(await screen.findByRole('dialog', { name: 'Library · v1' }))
    expect(detail.getByText('Chưa robot nào gán phiên bản này. Bấm Gán cho robot… để gán.')).toBeInTheDocument()
    expect(detail.queryByText(/^Robot đang gán phiên bản này/)).not.toBeInTheDocument()
  })

  it('keeps "Robot đang gán phiên bản này" when a robot holds it', async () => {
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Library · v1' }))
    const detail = within(await screen.findByRole('dialog', { name: 'Library · v1' }))
    expect(detail.getByText('Robot đang gán phiên bản này. Đổi bản đồ và kiểm tra triển khai trong hộp Thiết lập của robot.')).toBeInTheDocument()
    expect(detail.queryByText(/Chưa robot nào gán/)).not.toBeInTheDocument()
  })

  // W3 counting choice: the figure counts ready robots only; an assigned robot that is not ready runs nothing.
  it('counts only ready robots in Có robot sẵn sàng, and reads a passed check as history', async () => {
    runningRobot = { ...mapItem.runningRobot, readiness: notReady('Robot amr-01 chưa kiểm tra triển khai trên bản đồ này.') }
    renderPage(<TechnicalMapsPage />)
    const figures = within(await screen.findByRole('region', { name: 'Tình trạng bản đồ' }))
    expect(figures.getByText('Có robot sẵn sàng').closest('div')).toHaveTextContent(/^Có robot sẵn sàng0$/)
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Library · v1' }))
    const detail = within(await screen.findByRole('dialog', { name: 'Library · v1' }))
    expect(within(detail.getByText('Trạng thái').closest('div')!).getByText('Từng kiểm tra triển khai đạt')).toBeInTheDocument()
    expect(screen.queryByText('Đã kiểm tra triển khai đạt')).not.toBeInTheDocument()
  })

  it('counts a ready robot in Có robot sẵn sàng', async () => {
    renderPage(<TechnicalMapsPage />)
    const figures = within(await screen.findByRole('region', { name: 'Tình trạng bản đồ' }))
    expect(figures.getByText('Có robot sẵn sàng').closest('div')).toHaveTextContent(/^Có robot sẵn sàng1$/)
  })

  it('hands "Gán cho robot…" to the robot setup with that version already chosen', async () => {
    renderTechnicalRoutes('/technical/maps')
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Library · v1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gán cho robot…' }))
    const chooser = within(await screen.findByRole('dialog', { name: 'Gán Library · v1 cho robot' }))
    await chooser.findByRole('option', { name: /AMR 01 · amr-01/ })
    // The area already has a robot, so that robot starts chosen.
    expect(chooser.getByLabelText('Robot')).toHaveValue('robot-1')
    fireEvent.click(chooser.getByRole('button', { name: 'Tiếp tục' }))
    const assignment = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr-01' }))
    await assignment.findByRole('option', { name: /Phiên bản 1/ })
    expect(assignment.getByLabelText('Khu vực')).toHaveValue('library')
    expect(assignment.getByLabelText('Phiên bản bản đồ')).toHaveValue('map-v1')
  })

  it('uploads a new map version into the selected existing area and reports the server version', async () => {
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tải lên bản đồ mới' }))
    fireEvent.click(screen.getByLabelText('Khu vực đã có'))
    await screen.findByRole('option', { name: /Library · library/ })
    fireEvent.click(screen.getByLabelText('Khu vực mới'))
    fireEvent.change(screen.getByLabelText('Mã khu vực'), { target: { value: 'library' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Chuyển sang “Khu vực đã có”')
    expect(screen.getByRole('button', { name: 'Tải lên bản đồ' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Khu vực đã có'))
    await screen.findByRole('option', { name: /Library · library/ })
    fireEvent.change(screen.getByLabelText('Chọn khu vực'), { target: { value: 'library' } })
    expect(screen.getByLabelText('Chọn khu vực')).toHaveValue('library')
    expect(screen.queryByLabelText('Mã khu vực')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tên khu vực')).not.toBeInTheDocument()
    const fileInput = screen.getByLabelText('Tệp bản đồ (.zip)') as HTMLInputElement
    const file = new File(['zip'], 'new-map.zip', { type: 'application/zip' })
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] })
    fireEvent.change(fileInput)
    const uploadButton = screen.getByRole('button', { name: 'Tải lên bản đồ' })
    expect(uploadButton).not.toBeDisabled()
    fireEvent.submit(document.getElementById('map-upload-form')!)
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/map-versions' && item.init?.method === 'POST')).toBe(true))
    const call = requests.find(item => item.url.pathname === '/api/technical/map-versions' && item.init?.method === 'POST')!
    const form = call.init?.body as FormData
    expect(form.get('areaKey')).toBe('library')
    expect(form.get('areaName')).toBe('Library')
    expect(form.get('requestId')).toBeTruthy()
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Đã lưu Library · v2')
  })

  it('says there is no robot to deploy to, and keeps Tiếp tục disabled', async () => {
    physicalRobots = []
    runningRobot = null
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Library · v1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gán cho robot…' }))
    expect(await screen.findByText('Chưa có robot vật lý được đăng ký.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled()
  })

  it('shows area lookup errors and retries the complete catalog', async () => {
    failMapAreaLookup = true
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tải lên bản đồ mới' }))
    fireEvent.click(screen.getByLabelText('Khu vực đã có'))
    expect(await screen.findByText('Area lookup unavailable.')).toBeInTheDocument()
    failMapAreaLookup = false
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại danh sách khu vực' }))
    expect(await screen.findByRole('option', { name: /Library · library/ })).toBeInTheDocument()
  })

  it('shows registered robot lookup errors in the deploy dialog and retries', async () => {
    failRobotLookup = true
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xem chi tiết Library · v1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gán cho robot…' }))
    expect(await screen.findByText('Robot lookup unavailable.')).toBeInTheDocument()
    failRobotLookup = false
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại danh sách robot' }))
    expect(await screen.findByRole('option', { name: /AMR 01 · amr-01/ })).toBeInTheDocument()
  })

  // Replaces the "Khác bản đồ được gán" warning and the separate Đạt badge (U3): one chip, from the server.
  it('shows one Sẵn sàng chip per robot with the server reason, and no separate check badge', async () => {
    physicalRobots = [
      makePhysicalRobot({ latestDeployedMapKey: 'betea-v1', latestDeploymentPassed: true, readiness: notReady('Lần kiểm tra triển khai mới nhất của robot amr-01 là trên Betea · v1.') }),
      makePhysicalRobot({ id: 'robot-2', robotCode: 'amr-02', displayName: 'AMR 02' }),
      makePhysicalRobot({ id: 'robot-3', robotCode: 'amr-03', displayName: 'AMR 03', assignedMapVersionId: null, readiness: notSetUp('Robot amr-03 chưa được gán bản đồ.') }),
    ]
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByRole('columnheader', { name: 'Sẵn sàng' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Bản đồ' })).not.toBeInTheDocument()
    expect(screen.getByText('Chưa sẵn sàng')).toBeInTheDocument()
    expect(screen.getByText('Lần kiểm tra triển khai mới nhất của robot amr-01 là trên Betea · v1.')).toBeInTheDocument()
    expect(screen.getByText('Sẵn sàng · Library · v1')).toBeInTheDocument()
    expect(screen.getByText('Chưa thiết lập')).toBeInTheDocument()
    expect(screen.getByText('Robot amr-03 chưa được gán bản đồ.')).toBeInTheDocument()
    expect(screen.queryByText('Khác bản đồ được gán')).not.toBeInTheDocument()
    expect(screen.queryByText('Đạt')).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa đạt')).not.toBeInTheDocument()
  })

  it('walks a new robot through setup in order, showing only the next step', async () => {
    physicalRobots = [makePhysicalRobot({ connectionStatus: 'UNCONFIRMED', firstAcceptedSyncAt: null, assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null, latestDeployedMapKey: null, latestDeployedFrameId: null, latestDeploymentPassed: null, readiness: notSetUp('Robot amr-01 chưa được gán bản đồ.') })]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    const checklist = within(await screen.findByRole('region', { name: 'Thiết lập robot' }))
    expect(checklist.getByText('1/5 bước')).toBeInTheDocument()
    await waitFor(() => expect(checklist.getByRole('listitem', { current: 'step' })).toHaveTextContent('Cấp khóa kết nối MiniPC'))
    expect(checklist.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(checklist.getByRole('button', { name: 'Cấp khóa' }))
    expect(await screen.findByRole('dialog', { name: /khóa/i })).toBeInTheDocument()
  })

  // Round 2 W2: the dialog had three "Kiểm tra triển khai" buttons. Step 5 of the checklist is text now; the next-step
  // button and step 3 still open the check form in the same dialog.
  it('keeps two Kiểm tra triển khai buttons, the next step and step 3, and step 5 points at step 3 in words', async () => {
    credentialStatus = { ...credentialStatus, status: 'ACTIVE', hint: 'ab12' }
    physicalRobots = [makePhysicalRobot({ latestDeployedMapKey: 'library-v2', latestDeployedFrameId: 'map_v2', latestDeploymentPassed: true, readiness: notReady('Lần kiểm tra triển khai mới nhất của robot amr-01 là trên Library · v2.') })]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    const checklist = within(await screen.findByRole('region', { name: 'Thiết lập robot' }))
    await waitFor(() => expect(checklist.getByText('4/5 bước')).toBeInTheDocument())
    const step5 = checklist.getByRole('listitem', { current: 'step' })
    expect(step5).toHaveTextContent('Kiểm tra triển khai đạt trên bản đồ được gán')
    expect(step5).toHaveTextContent('ghi kết quả ở mục Kiểm tra tại robot bên dưới')
    expect(within(step5).queryByRole('button')).not.toBeInTheDocument()
    expect(checklist.queryByRole('link')).not.toBeInTheDocument()
    const dialog = within(screen.getByRole('dialog', { name: 'AMR 01' }))
    expect(dialog.getAllByRole('button', { name: 'Kiểm tra triển khai' })).toHaveLength(2)
    fireEvent.click(dialog.getAllByRole('button', { name: 'Kiểm tra triển khai' })[0])
    const form = within(await screen.findByRole('form', { name: 'Kiểm tra triển khai' }))
    // Robot and map are fixed: the assigned version, no picker.
    expect(form.queryByRole('combobox')).not.toBeInTheDocument()
    expect(form.getByText(/Library · v1/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'AMR 01' })).toBeInTheDocument()
  })

  it('says setup is complete once every step is done', async () => {
    credentialStatus = { ...credentialStatus, status: 'ACTIVE', hint: 'ab12' }
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    expect(await screen.findByText('Đã xong các bước thiết lập.')).toBeInTheDocument()
  })

  it('opens the robot named in the link from the map page, where its map is assigned', async () => {
    renderPage(<TechnicalRobotsPage />, '/technical/robots?robot=robot-1')
    const detail = await screen.findByRole('dialog', { name: 'AMR 01' })
    expect(within(detail).getByRole('button', { name: 'Đổi bản đồ' })).toBeInTheDocument()
  })

  it('opens step 1 with the linked version chosen when the link names a map', async () => {
    physicalRobots = [makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, readiness: notSetUp('Robot amr-01 chưa được gán bản đồ.') })]
    renderPage(<TechnicalRobotsPage />, '/technical/robots?robot=robot-1&map=map-v1')
    const assignment = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr-01' }))
    await assignment.findByRole('option', { name: /Phiên bản 1/ })
    expect(assignment.getByLabelText('Khu vực')).toHaveValue('library')
    expect(assignment.getByLabelText('Phiên bản bản đồ')).toHaveValue('map-v1')
    fireEvent.click(assignment.getAllByRole('button', { name: 'Đóng' })[0])
    expect(await screen.findByRole('dialog', { name: 'AMR 01' })).toBeInTheDocument()
  })

  // Round 2 W4: closing the dialogs a link opened leaves a clean URL, so a reload does not reopen the map step.
  it('drops robot and map from the URL when the linked dialogs close', async () => {
    physicalRobots = [makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, readiness: notSetUp('Robot amr-01 chưa được gán bản đồ.') })]
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/technical/robots?robot=robot-1&map=map-v1&keep=1']}>
      <LocationText /><Routes><Route path="/technical/robots" element={<TechnicalRobotsPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    const assignment = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr-01' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/technical/robots?robot=robot-1&map=map-v1&keep=1')
    fireEvent.click(assignment.getAllByRole('button', { name: 'Đóng' })[0])
    const detail = within(await screen.findByRole('dialog', { name: 'AMR 01' }))
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/technical\/robots\?keep=1$/)
    fireEvent.click(detail.getAllByRole('button', { name: 'Đóng' })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/technical\/robots\?keep=1$/)
  })

  it('drops robot from the URL when the setup dialog a link opened closes', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/technical/robots?robot=robot-1']}>
      <LocationText /><Routes><Route path="/technical/robots" element={<TechnicalRobotsPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
    const detail = within(await screen.findByRole('dialog', { name: 'AMR 01' }))
    fireEvent.click(detail.getAllByRole('button', { name: 'Đóng' })[0])
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/technical\/robots$/))
  })

  it('shows Sẵn sàng with the map when the server says the robot is ready', async () => {
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Sẵn sàng · Library · v1')).toBeInTheDocument()
  })

  it('shows the unassigned state and no mismatch notice when the assignment matches', async () => {
    physicalRobots = [makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null, readiness: notSetUp('Robot amr-01 chưa được gán bản đồ.') })]
    const unconfigured = renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Chưa thiết lập')).toBeInTheDocument()
    await openRobotDetail()
    expect(screen.getAllByRole('button', { name: 'Gán bản đồ' }).length).toBeGreaterThanOrEqual(1)
    unconfigured.unmount()

    physicalRobots = [makePhysicalRobot()]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    expect(await screen.findByRole('button', { name: 'Sao chép MapKey' })).toBeInTheDocument()
    expect(screen.queryByText(/Robot được gán map/)).not.toBeInTheDocument()
  })

  it('offers exactly one next step, in setup order', async () => {
    const nextButtons = async () => {
      const block = within(await screen.findByRole('region', { name: 'Trạng thái sẵn sàng' }))
      const checklist = block.getByRole('region', { name: 'Thiết lập robot' })
      // queryAll: a ready robot has no next-step button at all.
      return block.queryAllByRole('button').filter(button => !checklist.contains(button)).map(button => button.textContent)
    }
    const cases: Array<[Partial<PhysicalRobotOption>, RobotCredentialView['status'], string[]]> = [
      [{}, 'NOT_ISSUED', ['Cấp khóa']],
      [{ assignedMapVersionId: null, readiness: notSetUp('Robot amr-01 chưa được gán bản đồ.') }, 'ACTIVE', ['Gán bản đồ']],
      [{ firstAcceptedSyncAt: null, connectionStatus: 'UNCONFIRMED', readiness: { ...notSetUp('Robot amr-01 chưa xác nhận kết nối.'), mapVersionId: 'map-v1', nextStep: 'CONFIRM_CONNECTION' } }, 'ACTIVE', ['Cập nhật trạng thái']],
      // Round 3 W3: the server's nextStep; no Kiểm tra triển khai before the robot reports on its map.
      [{ readiness: notReady('Robot amr-01 chưa kiểm tra triển khai trên Library · v1.', { reportingOnAssignedMap: false, nextStep: 'CONFIGURE_MINIPC' }) }, 'ACTIVE', ['Cấu hình MiniPC']],
      [{ readiness: notReady('Robot amr-01 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.') }, 'ACTIVE', ['Kiểm tra triển khai']],
      [{ needsInspection: true }, 'ACTIVE', ['Trả robot']],
      [{}, 'ACTIVE', []],
    ]
    for (const [overrides, status, expected] of cases) {
      physicalRobots = [makePhysicalRobot(overrides)]
      credentialStatus = { ...credentialStatus, status }
      const view = renderPage(<TechnicalRobotsPage />)
      await openRobotDetail()
      await waitFor(async () => expect(await nextButtons()).toEqual(expected))
      view.unmount()
    }
  })

  it('records a deployment check for the assigned map only, with no robot or map picker', async () => {
    const form = await openDeployCheck()
    expect(form.queryByRole('combobox')).not.toBeInTheDocument()
    chooseResult('Đạt')
    fireEvent.click(form.getByLabelText('Định vị đạt'))
    fireEvent.click(form.getByLabelText('Map hiển thị đúng'))
    fireEvent.change(form.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Checked in person' } })
    failDeploymentOnce = true
    fireEvent.click(form.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await screen.findByText('Temporary server error.')
    fireEvent.click(form.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await waitFor(() => expect(deploymentPosts()).toHaveLength(2))
    expect(deploymentPosts()[0].url.pathname).toBe('/api/technical/map-versions/map-v1/deployment-checks')
    expect(JSON.parse(String(deploymentPosts()[0].init?.body))).toMatchObject({ robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true })
    expect(JSON.parse(String(deploymentPosts()[1].init?.body)).requestId).toBe(JSON.parse(String(deploymentPosts()[0].init?.body)).requestId)
    // A check changes the robot's readiness too, so the robot list reloads.
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/technical/physical-robots').length).toBeGreaterThan(1))
  })

  it('shows the last result and offers Kiểm tra lại once a check was recorded', async () => {
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    const step = within(await screen.findByRole('region', { name: 'Kiểm tra tại robot' }))
    expect(step.getByText(/^Lần trước: Đạt /)).toBeInTheDocument()
    expect(step.getByRole('button', { name: 'Kiểm tra lại' })).toBeInTheDocument()
  })

  it('translates a refused deployment check for a robot that no longer holds the map', async () => {
    const form = await openDeployCheck()
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(JSON.stringify({ success: false, message: '', errors: { code: 'ROBOT_MAP_NOT_ASSIGNED' } }), { status: 409 }))
    chooseResult('Không đạt')
    fireEvent.change(form.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Lệch.' } })
    fireEvent.click(form.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    expect(await form.findByRole('alert')).toHaveTextContent('Đổi bản đồ cho robot ở trang Robot trước khi ghi kiểm tra triển khai.')
  })

  it('says dispatch is on but no Tour can start while the robot is not ready', async () => {
    physicalRobots = [makePhysicalRobot({ isDispatchEnabled: true, readiness: notReady('Robot amr-01 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.') })]
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Cho phép điều phối · chưa sẵn sàng')).toBeInTheDocument()
    await openRobotDetail()
    expect(await screen.findByText('Đang cho phép, nhưng robot chưa sẵn sàng nên Tour chưa bắt đầu được.')).toBeInTheDocument()
  })

  it('warns that changing or clearing the map turns dispatch off, but not when re-saving the same version', async () => {
    physicalRobots = [makePhysicalRobot({ isDispatchEnabled: true })]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Đổi bản đồ' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr-01' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Gỡ gán bản đồ' }))
    expect(await screen.findByText(/Điều phối Tour của robot sẽ tự tắt\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }))
    await dialog.findByRole('option', { name: /Library/ })
    fireEvent.change(dialog.getByLabelText('Khu vực'), { target: { value: 'library' } })
    fireEvent.change(dialog.getByLabelText('Phiên bản bản đồ'), { target: { value: 'map-v1' } })
    fireEvent.submit(document.getElementById('robot-map-assignment-form') as HTMLFormElement)
    expect(await screen.findByRole('dialog', { name: 'Gán bản đồ cho amr-01?' })).toBeInTheDocument()
    expect(screen.queryByText(/Điều phối Tour của robot sẽ tự tắt/)).not.toBeInTheDocument()
  })

  it('assigns a non-PASSED map, confirms the MiniPC context, and refreshes robot/map views', async () => {
    mapCheckStatus = 'PENDING'
    physicalRobots = [makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null })]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Gán bản đồ' }))[0])
    await screen.findByRole('option', { name: 'Library' })
    fireEvent.change(await screen.findByLabelText('Khu vực'), { target: { value: 'library' } })
    // The newest version starts selected and reads as a version, not a MapKey.
    expect(await screen.findByRole('option', { name: /^Phiên bản 1 \(mới nhất\) · tải lên .* · Chưa kiểm tra triển khai$/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Phiên bản bản đồ')).toHaveValue(map.id)
    expect(screen.getByText(/Sau khi lưu, nhập hai giá trị này trên MiniPC/)).toBeInTheDocument()
    expect(screen.getByText('library-v1', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu bản đồ' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đồ' }))
    expect(requests.some(item => item.url.pathname.endsWith('/map-assignment'))).toBe(false)
    const confirmation = within(screen.getByRole('dialog', { name: 'Gán bản đồ cho amr-01?' }))
    expect(confirmation.getByText(/Gán Library · v1\. Trên MiniPC nhập MapKey library-v1, FrameId map\./)).toBeInTheDocument()
    fireEvent.click(confirmation.getByRole('button', { name: 'Gán bản đồ' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname.endsWith('/map-assignment') && item.init?.method === 'PUT')).toBe(true))
    const request = requests.find(item => item.url.pathname.endsWith('/map-assignment') && item.init?.method === 'PUT')!
    expect(JSON.parse(String(request.init?.body))).toMatchObject({ mapVersionId: map.id, expectedRowVersion: 'AAAAAAAAAAA=' })
    // Back in the setup dialog, step 2 shows the values to enter on the MiniPC.
    expect(await screen.findByRole('button', { name: 'Sao chép MapKey' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Cấu hình MiniPC' })).getByText('library-v1')).toBeInTheDocument()
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method !== 'POST').length).toBeGreaterThan(1))
  })

  it('names the robot already holding an area and does not offer that area', async () => {
    physicalRobots = [
      makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null }),
      makePhysicalRobot({ id: 'robot-2', robotCode: 'amr-02', displayName: 'AMR 02' }),
    ]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Gán bản đồ' }))[0])
    expect(await screen.findByRole('option', { name: 'Library (robot amr-02 đang dùng)' })).toBeDisabled()
  })

  it('warns about Tours a map change strands and leaves them scheduled', async () => {
    affectedTours = [{ tourId: 'tour-1', name: 'Tour sáng', scheduledStartAt: '2026-11-20T02:00:00Z', state: 'SCHEDULED' }]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: /^(Gán bản đồ|Đổi bản đồ)$/ }))
    const dialog = within(await screen.findByRole('dialog'))
    await dialog.findByRole('option', { name: /Library/ })
    fireEvent.change(dialog.getByLabelText('Khu vực'), { target: { value: 'library' } })
    await dialog.findByRole('option', { name: /Phiên bản 1 .* · đang gán$/ })
    fireEvent.change(dialog.getByLabelText('Phiên bản bản đồ'), { target: { value: 'map-v1' } })
    fireEvent.submit(document.getElementById('robot-map-assignment-form') as HTMLFormElement)

    expect(await screen.findByText('Các Tour sau sẽ không chạy được với bản đồ mới:')).toBeInTheDocument()
    expect(screen.getByText(/Tour sáng/)).toBeInTheDocument()
    expect(screen.getByText('Các Tour này không bị tự hủy.')).toBeInTheDocument()
  })

  it('takes a robot out of use with a reason, files it under Ngừng sử dụng and brings it back', async () => {
    affectedTours = [{ tourId: 'tour-1', name: 'Tour sáng', scheduledStartAt: '2026-11-20T02:00:00Z', state: 'SCHEDULED' }]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Ngừng sử dụng' }))

    expect(await screen.findByText('Các Tour sau đang giữ robot này:')).toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: 'Ngừng sử dụng' }).at(-1)!
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Lý do ngừng sử dụng/), { target: { value: 'Hỏng động cơ' } })
    fireEvent.click(confirm)

    await waitFor(() => expect(requests.some(item => item.url.pathname.endsWith('/deactivate'))).toBe(true))
    const sent = requests.find(item => item.url.pathname.endsWith('/deactivate'))!
    expect(JSON.parse(String(sent.init?.body))).toMatchObject({ reason: 'Hỏng động cơ', expectedRowVersion: 'AAAAAAAAAAA=' })
    expect(await screen.findByRole('button', { name: 'Kích hoạt lại' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Đóng' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Thiết lập amr-01' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng (1)' }))
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Kích hoạt lại' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname.endsWith('/activate'))).toBe(true))
  })

  it('marks a held robot and releases it after an on-site check with a required reason', async () => {
    physicalRobots = [makePhysicalRobot({ needsInspection: true, currentTourId: 'tour-9', currentTourState: 'CANCELLED' })]
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Chờ kiểm tra tại chỗ')).toBeInTheDocument()
    expect(screen.getByText(/1 robot đang chờ kiểm tra tại chỗ/)).toBeInTheDocument()
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Trả robot' }))
    expect(screen.getByText(/không phải nút dừng khẩn cấp/)).toBeInTheDocument()
    const confirm = releaseConfirm()
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Đã kiểm tra gì tại chỗ/), { target: { value: 'Robot đứng yên ở sảnh A' } })
    fireEvent.click(confirm)

    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/physical-robots/robot-1/release-inspection')).toBe(true))
    const sent = requests.find(item => item.url.pathname.endsWith('/release-inspection'))!
    expect(JSON.parse(String(sent.init?.body))).toEqual({ reason: 'Robot đứng yên ở sảnh A', expectedRowVersion: 'AAAAAAAAAAA=', requestId: expect.any(String) })
    await waitFor(() => expect(useToastStore.getState().toasts.some(toast => toast.title === 'Đã trả amr-01 về sử dụng')).toBe(true))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Trả robot' })).not.toBeInTheDocument())
    expect(screen.queryByText('Chờ kiểm tra tại chỗ')).not.toBeInTheDocument()
  })

  it('translates a refused release and reuses the request id when the same reason is retried', async () => {
    physicalRobots = [makePhysicalRobot({ needsInspection: true })]
    releaseRefusals = [
      { status: 409, body: { success: false, message: 'Robot còn lệnh đang mở hoặc chưa đối soát.', errors: { code: 'ROBOT_COMMAND_OPEN' } } },
      { status: 503, body: { success: false, message: 'Tạm thời không lưu được.' } },
    ]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Trả robot' }))
    fireEvent.change(screen.getByLabelText(/Đã kiểm tra gì tại chỗ/), { target: { value: 'Đã kiểm tra' } })
    fireEvent.click(releaseConfirm())
    expect(await screen.findByText(/Người vận hành cần đối soát lệnh đó trước/)).toBeInTheDocument()
    fireEvent.click(releaseConfirm())
    expect(await screen.findByText('Tạm thời không lưu được.')).toBeInTheDocument()
    fireEvent.click(releaseConfirm())
    await waitFor(() => expect(requests.filter(item => item.url.pathname.endsWith('/release-inspection'))).toHaveLength(3))

    const ids = requests.filter(item => item.url.pathname.endsWith('/release-inspection')).map(item => JSON.parse(String(item.init?.body)).requestId)
    expect(new Set(ids).size).toBe(1)
  })

  it('uses a new request id when the reason changes and explains the other refusals', async () => {
    physicalRobots = [makePhysicalRobot({ needsInspection: true })]
    releaseRefusals = [
      { status: 409, body: { success: false, message: 'x', errors: { code: 'STALE_VERSION' } } },
      { status: 409, body: { success: false, message: 'x', errors: { code: 'ROBOT_NOT_HELD' } } },
      { status: 403, body: { success: false, message: 'Forbidden' } },
    ]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Trả robot' }))
    const reason = screen.getByLabelText(/Đã kiểm tra gì tại chỗ/)
    fireEvent.change(reason, { target: { value: 'Lần một' } })
    fireEvent.click(releaseConfirm())
    expect(await screen.findByText(/Robot vừa thay đổi/)).toBeInTheDocument()
    fireEvent.change(reason, { target: { value: 'Lần hai' } })
    fireEvent.click(releaseConfirm())
    expect(await screen.findByText(/Robot không còn bị giữ/)).toBeInTheDocument()
    fireEvent.click(releaseConfirm())
    expect(await screen.findByText('Chỉ Technical Staff được trả robot sau kiểm tra tại chỗ.')).toBeInTheDocument()

    const ids = requests.filter(item => item.url.pathname.endsWith('/release-inspection')).map(item => JSON.parse(String(item.init?.body)).requestId)
    expect(ids[0]).not.toBe(ids[1])
    expect(ids[1]).toBe(ids[2])
  })

  it('offers no release for a robot that is not held', async () => {
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    expect(await screen.findByRole('button', { name: 'Đổi bản đồ' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trả robot' })).not.toBeInTheDocument()
    expect(screen.queryByText('Chờ kiểm tra tại chỗ')).not.toBeInTheDocument()
  })

  it('allows dispatch with a session note, sends it as reason and evidence, and shows the new state', async () => {
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    const section = await screen.findByRole('region', { name: 'Điều phối Tour' })
    expect(within(section).getByText(/Đang tắt/)).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Cho phép điều phối' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cho phép điều phối amr-01?' })
    expect(within(dialog).getByRole('button', { name: 'Cho phép' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/Bằng chứng chạy thử có giám sát/), { target: { value: 'Demo đồ án, khu vực trống, có người ở nút dừng.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cho phép' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/physical-robots/robot-1/dispatch')).toBe(true))
    const body = JSON.parse(String(requests.find(item => item.url.pathname.endsWith('/dispatch'))!.init?.body))
    expect(body).toMatchObject({ enabled: true, expectedRowVersion: 'AAAAAAAAAAA=', reason: 'Demo đồ án, khu vực trống, có người ở nút dừng.', evidenceRef: 'Demo đồ án, khu vực trống, có người ở nút dừng.' })
    expect(typeof body.requestId).toBe('string')
    expect(await within(await screen.findByRole('region', { name: 'Điều phối Tour' })).findByText(/Đang cho phép/)).toBeInTheDocument()
    expect(screen.getAllByText('Đã cho phép điều phối').length).toBeGreaterThan(0)
  })

  it('turns dispatch off without evidence and shows a server refusal in the dialog', async () => {
    physicalRobots = [makePhysicalRobot({ isDispatchEnabled: true })]
    dispatchRefusals = [{ status: 409, body: { success: false, message: 'Robot đã thay đổi. Tải lại rồi thử lại.', errors: { code: 'STALE_VERSION' } } }]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Tắt điều phối' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tắt điều phối amr-01?' })
    fireEvent.change(within(dialog).getByLabelText(/Lý do tắt/), { target: { value: 'Xong buổi demo' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tắt điều phối' }))
    expect(await within(dialog).findByText('Robot đã thay đổi. Tải lại rồi thử lại.')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tắt điều phối' }))
    await waitFor(() => expect(requests.filter(item => item.url.pathname.endsWith('/dispatch')).length).toBe(2))
    const calls = requests.filter(item => item.url.pathname.endsWith('/dispatch')).map(item => JSON.parse(String(item.init?.body)))
    expect(calls[1]).toMatchObject({ enabled: false, reason: 'Xong buổi demo' })
    expect(calls[1].evidenceRef).toBeUndefined()
    expect(calls[1].requestId).toBe(calls[0].requestId)                       // same note, same robot version: a replay
    expect(await within(await screen.findByRole('region', { name: 'Điều phối Tour' })).findByText(/Đang tắt/)).toBeInTheDocument()
  })

  it('shows a robot in a running Tour as busy, not as awaiting inspection', async () => {
    physicalRobots = [makePhysicalRobot({ currentTourId: 'tour-9', currentTourName: 'Tham quan thư viện', currentTourState: 'RUNNING' })]
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Đang chạy Tour Tham quan thư viện')).toBeInTheDocument()
    expect(screen.queryByText('Chờ kiểm tra tại chỗ')).not.toBeInTheDocument()
    expect(screen.queryByText(/robot đang chờ kiểm tra tại chỗ/)).not.toBeInTheDocument()
    await openRobotDetail()
    expect(await screen.findByRole('button', { name: 'Đổi bản đồ' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Kiểm tra tại chỗ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trả robot' })).not.toBeInTheDocument()
  })

  it('treats a robot still claimed by an ended Tour as held even without the inspection flag', async () => {
    physicalRobots = [makePhysicalRobot({ currentTourId: 'tour-9', currentTourName: 'Tham quan thư viện', currentTourState: 'COMPLETED' })]
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Chờ kiểm tra tại chỗ')).toBeInTheDocument()
    expect(screen.queryByText(/Đang chạy Tour/)).not.toBeInTheDocument()
    await openRobotDetail()
    expect(await screen.findByRole('button', { name: 'Trả robot' })).toBeEnabled()
  })

  it('disables release while the holding Tour has not ended', async () => {
    physicalRobots = [makePhysicalRobot({ needsInspection: true, currentTourId: 'tour-9', currentTourName: 'Tham quan thư viện', currentTourState: 'RUNNING' })]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    expect(await screen.findByRole('button', { name: 'Trả robot' })).toBeDisabled()
    expect(screen.getByText(/Tour Tham quan thư viện đang giữ robot chưa kết thúc/)).toBeInTheDocument()
    expect(screen.getByText(/giữ bởi Tour Tham quan thư viện/)).toBeInTheDocument()
  })

  // Was "unconfirmed robot" on the map page; Đạt now waits for live data on the assigned map (ROBOT_NOT_REPORTING).
  it('locks Đạt until the robot reports on its assigned map, but still permits an observed Không đạt', async () => {
    physicalRobots = [makePhysicalRobot({ readiness: notReady('Robot amr-01 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.', { reportingOnAssignedMap: false }) })]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    expect(await screen.findByText(/^Chưa nhận dữ liệu theo bản đồ này\./)).toBeInTheDocument()
    const step = within(screen.getByRole('region', { name: 'Kiểm tra tại robot' }))
    fireEvent.click(step.getByRole('button', { name: 'Kiểm tra lại' }))
    const form = within(await screen.findByRole('form', { name: 'Kiểm tra triển khai' }))
    expect(within(form.getByRole('group', { name: 'Kết quả' })).getByRole('button', { name: 'Đạt' })).toBeDisabled()
    expect(form.getByText('Robot amr-01 chưa gửi dữ liệu theo bản đồ Library · v1. Bật fleet_bridge với MapKey library-v1, FrameId map rồi bấm Cập nhật trạng thái.')).toBeInTheDocument()
    chooseResult('Không đạt')
    fireEvent.click(form.getByLabelText('Định vị đạt'))
    fireEvent.change(form.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Đã kiểm tra trực tiếp.' } })
    fireEvent.click(form.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await waitFor(() => expect(deploymentPosts()).toHaveLength(1))
    expect(JSON.parse(String(deploymentPosts()[0].init?.body))).toMatchObject({ localizationPassed: true, displayPassed: false, robotCode: 'amr-01' })
  })

  it('unlocks Đạt after a refresh shows the robot reporting, without clearing the check inputs', async () => {
    physicalRobots = [makePhysicalRobot({ readiness: notReady('Robot amr-01 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.', { reportingOnAssignedMap: false }) })]
    const form = await openDeployCheck()
    fireEvent.click(form.getByLabelText('Định vị đạt'))
    fireEvent.click(form.getByLabelText('Map hiển thị đúng'))
    fireEvent.change(form.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Quan sát tại khu vực.' } })
    expect(within(form.getByRole('group', { name: 'Kết quả' })).getByRole('button', { name: 'Đạt' })).toBeDisabled()

    physicalRobots = [makePhysicalRobot({ readiness: notReady('Robot amr-01 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.') })]
    fireEvent.click(within(screen.getByRole('region', { name: 'Cấu hình MiniPC' })).getByRole('button', { name: 'Cập nhật trạng thái' }))
    expect(await screen.findByText('Robot đã báo về theo bản đồ này.')).toBeInTheDocument()
    expect(within(form.getByRole('group', { name: 'Kết quả' })).getByRole('button', { name: 'Đạt' })).toBeEnabled()
    expect(form.getByLabelText('Định vị đạt')).toBeChecked()
    expect(form.getByLabelText('Map hiển thị đúng')).toBeChecked()
    expect(form.getByLabelText('Bằng chứng kiểm tra')).toHaveValue('Quan sát tại khu vực.')
    chooseResult('Đạt')
    expect(form.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeEnabled()
  })

  it('registers a physical robot and refreshes the lookup used by map checks', async () => {
    physicalRobots = []
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Chưa có robot vật lý được đăng ký.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký robot' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText(/Đăng ký tạo danh tính robot trong hệ thống/)).toHaveTextContent('Thiết lập kết nối ROS 2 được thực hiện riêng trên robot.')
    const codeInput = dialog.getByLabelText('Mã robot')
    fireEvent.change(codeInput, { target: { value: ' amr-new ' } })
    fireEvent.blur(codeInput)
    fireEvent.change(dialog.getByLabelText('Tên robot'), { target: { value: ' AMR mới ' } })
    const submit = dialog.getByRole('button', { name: 'Đăng ký robot' })
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)
    expect(await screen.findByText('amr-new')).toBeInTheDocument()
    expect(screen.getByText('AMR mới')).toBeInTheDocument()
    expect(screen.getByText('Chưa xác nhận kết nối')).toBeInTheDocument()
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method !== 'POST').length).toBeGreaterThan(1))
    const post = requests.find(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method === 'POST')!
    expect(JSON.parse(String(post.init?.body))).toEqual({ robotCode: 'amr-new', displayName: 'AMR mới' })
  })

  it('shows an issued robot secret once and clears it when the credential panel closes', async () => {
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Quản lý khóa' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cấp khóa' }))
    const secret = await screen.findByText('secret-value-once')
    expect(secret).toBeInTheDocument()
    const request = requests.find(item => item.url.pathname === '/api/technical/robots/amr-01/credential' && item.init?.method === 'POST')!
    expect(request.init?.body).toBeTruthy()
    const closeButtons = screen.getAllByRole('button', { name: 'Đóng' })
    fireEvent.click(closeButtons[0])
    expect(screen.queryByText('secret-value-once')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quản lý khóa' }))
    expect(await screen.findByText(/Đang hoạt động/)).toBeInTheDocument()
    expect(screen.queryByText('secret-value-once')).not.toBeInTheDocument()
  })

  it('refreshes the robot list and deployment-check picker after credential success and failure', async () => {
    renderPage(<TechnicalRobotsPage />)
    await screen.findByText('AMR 01')
    const robotListRequestCount = () => requests.filter(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method !== 'POST').length
    const initialListRequestCount = robotListRequestCount()
    await openRobotDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Quản lý khóa' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cấp khóa' }))
    await screen.findByText('secret-value-once')
    await waitFor(() => expect(robotListRequestCount()).toBeGreaterThan(initialListRequestCount))

    failCredentialMutation = true
    fireEvent.click(await screen.findByRole('button', { name: 'Cấp lại' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Cấp lại khóa của amr-01?' })).getByRole('button', { name: 'Cấp lại khóa' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Credential update failed.')
    await waitFor(() => expect(robotListRequestCount()).toBeGreaterThan(initialListRequestCount + 1))
  })

  it('renders a RobotCode pattern valid with the HTML v flag and matching server rules', async () => {
    renderPage(<TechnicalRobotsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng ký robot' }))
    const codeInput = screen.getByLabelText('Mã robot') as HTMLInputElement
    const renderedPattern = codeInput.getAttribute('pattern') ?? ''
    const codePattern = new RegExp(`^(?:${renderedPattern})$`, 'v')

    expect(renderedPattern).toBe('[A-Za-z0-9][A-Za-z0-9_.\\-]{0,99}')
    expect(codeInput.maxLength).toBe(100)
    expect(codePattern.test('amr-01')).toBe(true)
    expect(codePattern.test('A_1.example')).toBe(true)
    expect(codePattern.test('a'.repeat(100))).toBe(true)
    expect(codePattern.test('a'.repeat(101))).toBe(false)
    expect(codePattern.test('-amr-01')).toBe(false)
    expect(codePattern.test('amr 01')).toBe(false)
    expect(codePattern.test('ámr-01')).toBe(false)

    fireEvent.change(codeInput, { target: { value: ' amr-01 ' } })
    expect(codeInput.checkValidity()).toBe(false)
    fireEvent.blur(codeInput)
    expect(codeInput).toHaveValue('amr-01')
    expect(codeInput.checkValidity()).toBe(true)
  })

  it('shows registration conflicts in the form and lets the operator correct the code', async () => {
    physicalRobots = []
    failRobotRegistration = true
    renderPage(<TechnicalRobotsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng ký robot' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Mã robot'), { target: { value: 'amr-existing' } })
    fireEvent.change(dialog.getByLabelText('Tên robot'), { target: { value: 'Robot mới' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Đăng ký robot' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Robot code already registered.')
    expect(dialog.getByLabelText('Mã robot')).toHaveValue('amr-existing')
    expect(dialog.getByLabelText('Tên robot')).toHaveValue('Robot mới')
    expect(dialog.getByRole('button', { name: 'Đăng ký robot' })).toBeEnabled()
    fireEvent.change(dialog.getByLabelText('Mã robot'), { target: { value: 'amr-corrected' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Đăng ký robot' }))
    expect(await screen.findByText('amr-corrected')).toBeInTheDocument()
    expect(requests.filter(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method === 'POST')).toHaveLength(2)
  })

  it('disables submission while a registration is pending', async () => {
    physicalRobots = []
    robotRegistrationDelayMs = 500
    renderPage(<TechnicalRobotsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng ký robot' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Mã robot'), { target: { value: 'amr-pending' } })
    fireEvent.change(dialog.getByLabelText('Tên robot'), { target: { value: 'Pending robot' } })
    const submit = dialog.getByRole('button', { name: 'Đăng ký robot' })
    fireEvent.click(submit)
    const pendingSubmit = await dialog.findByRole('button', { name: 'Đang đăng ký…' })
    expect(pendingSubmit).toBeDisabled()
    expect(dialog.getByLabelText('Mã robot')).toBeDisabled()
    expect(dialog.getByLabelText('Tên robot')).toBeDisabled()
    fireEvent.click(pendingSubmit)
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method === 'POST')).toHaveLength(1))
    expect(await screen.findByText('amr-pending')).toBeInTheDocument()
  })

  it('records a POI check against its submitted revision and row version', async () => {
    renderPage(<TechnicalPoisPage />)
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.queryByText('Giới thiệu thư viện.')).not.toBeInTheDocument()
    expect(screen.queryByText(/^1, 2, 0$/)).not.toBeInTheDocument()
    expect(await screen.findByText('Library · v1')).toBeInTheDocument()
    expect(screen.queryByText(/library-v1/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Library' }))
    const detail = within(screen.getByRole('dialog', { name: 'Library' }))
    // Narration is Staff content (ADR-0060): Technical sees its state only, never its text or an edit control.
    expect(detail.getByText('Chưa có')).toBeInTheDocument()
    expect(detail.getByText('Staff viết và duyệt; không ảnh hưởng kết quả kiểm chứng.')).toBeInTheDocument()
    expect(detail.getByText('x 1 m · y 2 m · hướng 0°')).toBeInTheDocument()
    expect(detail.getByText('Nhìn phía trước')).toBeInTheDocument()
    fireEvent.click(detail.getByRole('button', { name: 'Ghi kết quả' }))
    expect(screen.queryByRole('dialog', { name: 'Library' })).not.toBeInTheDocument()
    expect(screen.queryByText('Nội dung thuyết minh, chỉ đọc')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Nội dung thuyết minh' })).not.toBeInTheDocument()
    // Not a picker any more: the robot ready on the POI's version is the one that records it.
    expect(await readyRobotLine()).toHaveTextContent('(kiểm tra triển khai')
    expect(within(screen.getByRole('dialog')).queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã đi kiểm tra tại chỗ.' } })
    passAllPoiChecks()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/poi-proposals/proposal-1/revisions/1/verification')).toBe(true))
    expect(requests.some(item => item.url.pathname === '/api/technical/poi-verifications')).toBe(true)
    const call = requests.find(item => item.url.pathname.endsWith('/verification'))!
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ expectedRevisionNumber: 1, expectedRowVersion: proposal.rowVersion, resultCode: 'PASS', robotCode: 'amr-01' })
  })

  it('lists POI waiting for verification newest submission first', async () => {
    const at = (id: string, name: string, submittedAt: string) =>
      ({ ...queueItem, proposalId: id, revision: { ...queueItem.revision, id: `rev-${id}`, name, submittedAt } })
    poiQueue = [at('old', 'Cổng cũ', '2026-11-04T07:15:00Z'), at('new', 'Sảnh mới', '2026-11-16T04:24:00Z'), at('mid', 'Thư viện', '2026-11-15T15:40:00Z')]
    renderPage(<TechnicalPoisPage />)
    await screen.findByText('Sảnh mới')
    const names = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].querySelector('span')?.textContent)
    expect(names).toEqual(['Sảnh mới', 'Thư viện', 'Cổng cũ'])
  })

  const openPoiCheck = async () => {
    renderPage(<TechnicalPoisPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    await readyRobotLine()
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã kiểm tra.' } })
  }
  const verificationCalls = () => requests.filter(item => item.url.pathname.endsWith('/verification'))

  it('starts with nothing ticked as a neutral result with no reason asked, and names the head action', async () => {
    await openPoiCheck()
    expect(screen.queryByRole('group', { name: 'Kết quả' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đạt' })).not.toBeInTheDocument()
    for (const label of POI_CHECKS) expect(screen.getByLabelText(label)).not.toBeChecked()
    expect(screen.queryByLabelText('Localization đạt')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Camera preset được xác nhận')).not.toBeInTheDocument()
    expect(computedResult()).toHaveTextContent('Kết quả: chưa tick mục nào')
    expect(computedResult()).not.toHaveTextContent('Không đạt')
    expect(screen.queryByLabelText('Lý do không đạt')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.getByText('Chưa lưu được: tick các mục đã kiểm tra.')).toBeInTheDocument()
    fireEvent.submit(document.getElementById('poi-verify-form')!)
    expect(verificationCalls()).toHaveLength(0)
  })

  it('reads Không đạt and asks for a reason once a box was ticked and unticked again', async () => {
    await openPoiCheck()
    fireEvent.click(screen.getByLabelText('Robot tới đúng POI'))
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    fireEvent.click(screen.getByLabelText('Robot tới đúng POI'))
    for (const label of POI_CHECKS) expect(screen.getByLabelText(label)).not.toBeChecked()
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.getByLabelText('Lý do không đạt')).toBeRequired()
    expect(screen.getByText('Chưa lưu được: nhập lý do không đạt.')).toBeInTheDocument()
  })

  it('records a POI that passed nothing with one Không đạt mục nào click, no tick-and-untick', async () => {
    await openPoiCheck()
    expect(computedResult()).toHaveTextContent('Kết quả: chưa tick mục nào')
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Không đạt mục nào' }))
    expect(screen.queryByRole('button', { name: 'Không đạt mục nào' })).not.toBeInTheDocument()
    for (const label of POI_CHECKS) expect(screen.getByLabelText(label)).not.toBeChecked()
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.getByLabelText('Lý do không đạt')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Robot không tới được.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(verificationCalls()).toHaveLength(1))
    expect(JSON.parse(String(verificationCalls()[0].init?.body))).toMatchObject({ resultCode: 'FAIL', reached: false, stopped: false, localizationPassed: false, cameraPresetConfirmed: false, reason: 'Robot không tới được.', evidenceNote: 'Đã kiểm tra.' })
  })

  it('ticks every POI box with Tích tất cả, then clears them all again', async () => {
    await openPoiCheck()
    fireEvent.click(screen.getByLabelText('Robot tới đúng POI'))
    fireEvent.click(screen.getByRole('button', { name: 'Tích tất cả' }))
    for (const label of POI_CHECKS) expect(screen.getByLabelText(label)).toBeChecked()
    expect(computedResult()).toHaveTextContent('Kết quả: Đạt')
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ tích tất cả' }))
    for (const label of POI_CHECKS) expect(screen.getByLabelText(label)).not.toBeChecked()
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.getByRole('button', { name: 'Tích tất cả' })).toBeInTheDocument()
  })

  it('hides Không đạt mục nào once a POI box is ticked', async () => {
    await openPoiCheck()
    fireEvent.click(screen.getByLabelText('Robot tới đúng POI'))
    expect(screen.queryByRole('button', { name: 'Không đạt mục nào' })).not.toBeInTheDocument()
  })

  it('reads Đạt once all four checks are ticked and saves PASS without a reason', async () => {
    await openPoiCheck()
    for (const label of POI_CHECKS.slice(0, 3)) fireEvent.click(screen.getByLabelText(label))
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.getByLabelText('Lý do không đạt')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Đầu camera làm đúng: Nhìn phía trước'))
    expect(computedResult()).toHaveTextContent('Kết quả: Đạt')
    expect(screen.queryByLabelText('Lý do không đạt')).not.toBeInTheDocument()
    expect(screen.queryByText(/Chưa lưu được/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(verificationCalls()).toHaveLength(1))
    const body = JSON.parse(String(verificationCalls()[0].init?.body))
    expect(body).toMatchObject({ resultCode: 'PASS', reached: true, stopped: true, localizationPassed: true, cameraPresetConfirmed: true })
    expect(body.reason).toBeUndefined()
  })

  it('records Không đạt with the unticked observation false and a required reason', async () => {
    await openPoiCheck()
    passAllPoiChecks()
    fireEvent.click(screen.getByLabelText('Robot dừng đúng vị trí'))
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.getByText('Chưa lưu được: nhập lý do không đạt.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Lệch vị trí.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(verificationCalls()).toHaveLength(1))
    expect(JSON.parse(String(verificationCalls()[0].init?.body))).toMatchObject({ resultCode: 'FAIL', reached: true, stopped: false, localizationPassed: true, cameraPresetConfirmed: true, reason: 'Lệch vị trí.' })
  })

  it('replaces the generic validation refusal with Vietnamese text', async () => {
    verifyRefusal = { status: 400, body: { message: 'One or more validation errors occurred.', errors: {} } }
    await openPoiCheck()
    passAllPoiChecks()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Đạt cần đủ cả bốn mục')
    expect(screen.queryByText('One or more validation errors occurred.')).not.toBeInTheDocument()
  })

  it('shows field and conflict refusals beside the field they concern', async () => {
    verifyRefusal = { status: 400, body: { message: 'One or more validation errors occurred.', errors: { 'Request.EvidenceNote': ['too long'] } } }
    await openPoiCheck()
    passAllPoiChecks()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập ghi chú bằng chứng')
    expect(screen.getByLabelText('Ghi chú bằng chứng')).toHaveAttribute('aria-invalid', 'true')

    // The readiness refusal carries the server's own Vietnamese sentence (one rule, one wording).
    verifyRefusal = { status: 409, body: { message: 'Robot amr-01 đang gán Tầng 6 · tang-6 · phiên bản 1, không phải bản đồ này.', errors: { code: 'MAP_NOT_DEPLOYED', fields: null } } }
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(verificationCalls()).toHaveLength(2))
    expect(await screen.findByText('Robot amr-01 đang gán Tầng 6 · tang-6 · phiên bản 1, không phải bản đồ này.')).toBeInTheDocument()
  })

  // Replaces the picker tests (requireReady): the server's readiness now picks the one robot, and the form says why
  // there is none instead of linking to the map page, which no longer records deployment checks.
  it('records with the one robot the server calls ready on the POI version, ignoring robots ready elsewhere', async () => {
    physicalRobots = [
      makePhysicalRobot({ id: 'robot-2', robotCode: 'amr-02', displayName: 'AMR 02', assignedMapVersionId: 'map-v2', readiness: { ...readyOnLibrary, mapVersionId: 'map-v2', mapLabel: 'Library · v2' } }),
      makePhysicalRobot(),
    ]
    await openPoiCheck()
    passAllPoiChecks()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(verificationCalls()).toHaveLength(1))
    expect(JSON.parse(String(verificationCalls()[0].init?.body)).robotCode).toBe('amr-01')
  })

  it('locks the POI check when no robot runs its map and offers to assign one', async () => {
    physicalRobots = [makePhysicalRobot({ assignedMapVersionId: null, assignedMapKey: null, assignedFrameId: null, readiness: notSetUp('Robot amr-01 chưa được gán bản đồ.') })]
    renderPage(<TechnicalPoisPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    expect(await screen.findByText('Chưa có robot nào chạy bản đồ này.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /trang Bản đồ/ })).not.toBeInTheDocument()
    passAllPoiChecks()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.getByText(/^Chưa lưu được: cần một robot sẵn sàng trên bản đồ này/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gán robot cho bản đồ này' }))
    expect(await screen.findByRole('dialog', { name: 'Gán Library · v1 cho robot' })).toBeInTheDocument()
  })

  // Round 3 W1: the amr_01 case of 23/11. The robot holds the POI map but its MiniPC still sends the old map, so the
  // form lists what is done for this map and offers the server's next step, with the way back to this POI.
  it('lists the three steps for the POI map and opens the robot setup at the next step, for either result', async () => {
    physicalRobots = [makePhysicalRobot({
      connectionStatus: 'WRONG_MAP', lastRejectedReport: { mapKey: 'test123-v1', frameId: 'map', at: '2026-10-27T10:05:00Z', message: 'Robot đang gửi dữ liệu theo test123-v1, bị từ chối vì đang gán library-v1. Đổi MapKey/FrameId trên MiniPC.' },
      latestDeployedMapKey: 'betea-v1',
      readiness: notReady('Robot amr-01 chưa kiểm tra triển khai trên Library · v1 (gán lúc 27/10 17:00).', { reportingOnAssignedMap: false, nextStep: 'CONFIGURE_MINIPC', detail: 'Lần kiểm tra triển khai mới nhất của robot amr-01 là trên Betea · betea · phiên bản 1.' }),
    })]
    renderPage(<TechnicalPoisPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    const steps = within(await screen.findByRole('list', { name: 'Chuẩn bị amr-01' })).getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent(/^Xong: Gán bản đồ: amr-01 · gán lúc /)
    expect(steps[1]).toHaveTextContent('Chưa xong: MiniPC báo về theo library-v1 (đang gửi test123-v1)')
    expect(steps[2]).toHaveTextContent('Chưa xong: Kiểm tra triển khai')
    // The Betea sentence is history, shown only in the setup dialog.
    expect(screen.queryByText(/Betea/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cấu hình MiniPC cho amr-01' })).toHaveAttribute('href', `/technical/robots?robot=robot-1&returnTo=${encodeURIComponent('/technical/pois?poi=proposal-1')}`)
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã kiểm tra.' } })
    fireEvent.click(screen.getByLabelText('Robot dừng đúng vị trí'))
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Lệch vị trí.' } })
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.submit(document.getElementById('poi-verify-form')!)
    expect(verificationCalls()).toHaveLength(0)
  })

  it('says what is missing when Không đạt cannot be saved yet', async () => {
    await openPoiCheck()
    fireEvent.click(screen.getByLabelText('Robot dừng đúng vị trí'))
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.getByText('Chưa lưu được: nhập lý do không đạt.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Lệch vị trí.' } })
    expect(screen.queryByText(/Chưa lưu được/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeEnabled()
  })

  it('filters POIs by status and opens a passed result read-only with its history', async () => {
    const passedRevision = { ...proposal.revision, id: 'revision-2b', revisionNumber: 2, name: 'Sảnh đã đạt', navigationStatus: 'PASS', verificationSourceRevisionId: 'revision-2a' }
    poiProposals = [proposal, { id: 'proposal-2', currentRevision: 2, rowVersion: 'BBBBBBBBBBB=', revision: passedRevision }]
    poiHistory = { proposalId: 'proposal-2', revisions: [passedRevision], verificationRecords: [
      { id: 'v1', proposalId: 'proposal-2', proposalRevisionId: 'revision-1a', revisionNumber: 1, mapKey: 'library-v1', robotCode: 'amr-01', resultCode: 'FAIL', reached: true, stopped: false, localizationPassed: true, cameraPresetConfirmed: true, reason: 'Lệch vị trí.', evidenceNote: 'Lần đầu.', checkedAt: '2026-10-27T10:00:00Z' },
      { id: 'v2', proposalId: 'proposal-2', proposalRevisionId: 'revision-2a', revisionNumber: 1, mapKey: 'library-v1', robotCode: 'amr-01', resultCode: 'PASS', reached: true, stopped: true, localizationPassed: true, cameraPresetConfirmed: true, reason: null, evidenceNote: 'Lần hai đạt.', checkedAt: '2026-10-28T10:00:00Z' },
    ] }
    renderPage(<TechnicalPoisPage />)
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.queryByText('Sảnh đã đạt')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /Đã đạt: 1/ }))
    expect(screen.getByRole('button', { name: /Đã đạt: 1/ })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Sảnh đã đạt')).toBeInTheDocument()
    expect(screen.queryByText('Library')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ghi kết quả' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Xem kết quả' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(await dialog.findByText(/Lần hai đạt/)).toBeInTheDocument()
    expect(dialog.getByText(/Lần đầu/)).toBeInTheDocument()
    expect(dialog.getByText('Kết quả hiện tại')).toBeInTheDocument()
    expect(dialog.getByText(/chỉ đổi nội dung/)).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Lưu kết quả' })).not.toBeInTheDocument()
  })

  it('files a rejected revision outside the queue under Không đạt · chờ Staff, without offering a second result', async () => {
    poiProposals = [{ id: 'proposal-3', currentRevision: 1, rowVersion: 'CCCCCCCCCCC=', revision: { ...proposal.revision, id: 'revision-3', name: 'POI không đạt', navigationStatus: 'FAIL', verificationSourceRevisionId: 'revision-3' } }]
    renderPage(<TechnicalPoisPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Không đạt · chờ Staff: 1/ }))
    expect(await screen.findByText('Kỹ thuật không cần làm gì cho tới khi Staff gửi lại.')).toBeInTheDocument()
    expect(await screen.findByText('POI không đạt')).toBeInTheDocument()
    expect(screen.getByText('Chờ Staff sửa và gửi lại')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ghi kết quả' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem kết quả' })).toBeInTheDocument()
  })

  it('moves the robot table detail into one dialog with copyable map values', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    renderPage(<TechnicalRobotsPage />)
    await screen.findByText('AMR 01')
    expect(screen.queryByRole('button', { name: 'Sao chép MapKey' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quản lý khóa' })).not.toBeInTheDocument()
    await openRobotDetail()
    expect(screen.getAllByText(/Library/).filter(item => item.textContent === ' · Library · v1')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép MapKey' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('library-v1'))
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép FrameId' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('map'))
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Đã sao chép FrameId')
  })

  it('uses the app dialog for risky robot actions and keeps Escape inside it', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm')
    credentialStatus = { ...credentialStatus, status: 'ACTIVE', hint: 'abcd' }
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Quản lý khóa' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi' }))
    const confirmation = within(screen.getByRole('dialog', { name: 'Thu hồi khóa của amr-01?' }))
    expect(confirmation.getByRole('button', { name: 'Thu hồi khóa' })).toBeDisabled()
    fireEvent.change(confirmation.getByLabelText(/Lý do thu hồi/), { target: { value: 'Mất MiniPC' } })
    expect(confirmation.getByRole('button', { name: 'Thu hồi khóa' })).toBeEnabled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Thu hồi khóa của amr-01?' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Khóa kết nối MiniPC · amr-01' })).toBeInTheDocument()
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('returns to the robot detail after closing the key dialog', async () => {
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Quản lý khóa' }))
    expect(await screen.findByRole('dialog', { name: 'Khóa kết nối MiniPC · amr-01' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Khóa kết nối MiniPC · amr-01' })).toHaveTextContent('Bước 2/5 trong thiết lập robot.')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Đóng' })[0])
    expect(screen.getByRole('dialog', { name: 'AMR 01' })).toBeInTheDocument()
  })

  it('opens monitoring from Giám sát and keeps setup behind Thiết lập', async () => {
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByRole('link', { name: 'Giám sát amr-01' })).toHaveAttribute('href', '/technical/monitoring?robot=amr-01')
    expect(screen.queryByRole('button', { name: 'Quản lý amr-01' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Chi tiết amr-01' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await openRobotDetail()
    expect(screen.getByRole('dialog', { name: 'AMR 01' })).toBeInTheDocument()
  })

  it('starts the deployment check with no result and saves Không đạt only when a box is left unticked', async () => {
    const form = await openDeployCheck()
    const result = within(form.getByRole('group', { name: 'Kết quả' }))
    expect(result.getAllByRole('button').map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
    expect(form.getByLabelText('Định vị đạt')).not.toBeChecked()
    expect(form.getByLabelText('Map hiển thị đúng')).not.toBeChecked()
    fireEvent.change(form.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Lệch khi quay đầu.' } })
    expect(form.getByText('Chưa lưu được: chọn kết quả.')).toBeInTheDocument()
    chooseResult('Đạt')
    expect(form.getByText('Chưa lưu được: tick đủ hai mục để ghi Đạt.')).toBeInTheDocument()
    fireEvent.click(form.getByLabelText('Định vị đạt'))
    fireEvent.click(form.getByLabelText('Map hiển thị đúng'))
    chooseResult('Không đạt')
    expect(form.getByText('Chưa lưu được: bỏ tick mục không đạt.')).toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeDisabled()
    fireEvent.click(form.getByLabelText('Định vị đạt'))
    fireEvent.click(form.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await waitFor(() => expect(deploymentPosts()).toHaveLength(1))
    expect(JSON.parse(String(deploymentPosts()[0].init?.body))).toMatchObject({ localizationPassed: false, displayPassed: true })
  })

  const openRouteTest = async () => {
    routeQueue = [routeFixture]
    renderPage(<TechnicalRouteTestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả Tuyến thư viện' }))
    await readyRobotLine()
    await screen.findByRole('option', { name: 'Lan Staff · lan' })
    fireEvent.change(screen.getByLabelText('Staff đi cùng'), { target: { value: 'staff-1' } })
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã chạy thử.' } })
  }
  const testRunCalls = () => requests.filter(item => item.url.pathname.endsWith('/test-runs'))

  // Round 2 W5: the clickable figures had no name of their own; a screen reader read only "button".
  it('names each clickable figure with its label and number on the route test and POI pages', async () => {
    routeQueue = [routeFixture]
    routeCatalog = [{ ...routeFixture, revisionId: 'rev-9', verificationStatus: 'PASS' }]
    const { unmount } = renderPage(<TechnicalRouteTestsPage />)
    expect(await screen.findByRole('button', { name: 'Đã đạt: 1' })).toHaveAttribute('aria-label', 'Đã đạt: 1')
    expect(screen.getByRole('button', { name: 'Chờ chạy thử: 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Không đạt: 0' })).toBeInTheDocument()
    unmount()
    renderPage(<TechnicalPoisPage />)
    expect(await screen.findByRole('button', { name: 'Chờ kiểm chứng: 1' })).toHaveAttribute('aria-label', 'Chờ kiểm chứng: 1')
    expect(await screen.findByRole('button', { name: 'Đã đạt: 0' })).toBeInTheDocument()
  })

  it('states that a route record is human evidence and shows no result without a queue item', async () => {
    renderPage(<TechnicalRouteTestsPage />)
    expect(screen.getByText('Ghi kết quả chạy thử toàn tuyến cho đúng phiên bản Staff đã gửi. Kết quả do người kiểm tra nhập, hệ thống không tự xác minh robot đã chạy. Tuyến đạt thì Staff dùng được để tạo Tour.')).toBeInTheDocument()
    expect(await screen.findByText('Chưa có tuyến chờ chạy thử')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ghi kết quả/ })).not.toBeInTheDocument()
  })

  it('records a whole-route PASS against the exact submitted revision', async () => {
    await openRouteTest()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Kết quả' })).not.toBeInTheDocument()
    // Nothing ticked yet: the form reads neither Đạt nor Không đạt and asks for no reason, it never looks finished.
    expect(computedResult()).toHaveTextContent('Kết quả: chưa tick mục nào')
    expect(screen.queryByLabelText('Lý do không đạt')).not.toBeInTheDocument()
    expect(screen.getByText('Chưa lưu được: tick các mục đã kiểm tra.')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Robot dừng an toàn'))
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    fireEvent.click(screen.getByLabelText('Robot đi đủ các điểm dừng'))
    fireEvent.click(screen.getByLabelText('Định vị đạt'))
    expect(computedResult()).toHaveTextContent('Kết quả: Đạt')
    expect(screen.queryByLabelText('Lý do không đạt')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(1))
    expect(testRunCalls()[0].url.pathname).toBe('/api/technical/routes/route-1/revisions/rev-1/test-runs')
    const body = JSON.parse(String(testRunCalls()[0].init?.body))
    expect(body).toMatchObject({ robotCode: 'amr-01', participatingStaffUserId: 'staff-1', resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true, failureReason: null, evidenceNote: 'Đã chạy thử.' })
    expect(body.measuredDurationSeconds).toBeUndefined()
    expect(body.requestId).toBeTruthy()
    expect(body.routeName).toBeUndefined()
    expect(body.routeId).toBeUndefined()
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Đã ghi chạy thử đạt: Tuyến thư viện'))
  })

  describe('a route where Viewers choose the next stop (ADR-0065)', () => {
    const stop = (id: string, name: string, stopOrder: number) => ({ id, name, stopOrder, poiRevisionId: `poi-${id}`, dwellSeconds: 40, headSteps: [], x: stopOrder, y: 0, yaw: 0, cameraPreset: 'FRONT', sourcePoiVerificationRecordId: 'v' })
    const votingRoute = {
      ...routeFixture, verificationStatus: 'LEGS_INCOMPLETE', viewerChoosesNextStop: true,
      stops: [stop('s-a', 'Sảnh A', 1), stop('s-b', 'Phòng B', 2), stop('s-c', 'Phòng C', 3)],
      legCoverage: { requiredCount: 7, coveredCount: 5, missingLegs: [
        { fromStopId: 's-c', fromName: 'Phòng C', toStopId: 's-b', toName: 'Phòng B' },
        { fromStopId: 's-b', fromName: 'Phòng B', toStopId: null, toName: '' },
      ] },
    }

    it('lists the route as not covering every leg yet, with the legs driven', async () => {
      routeQueue = [votingRoute]
      renderPage(<TechnicalRouteTestsPage />)
      expect(await screen.findByText('Chạy thử chưa đủ chặng')).toBeInTheDocument()
      expect(screen.getByText('Đã đi 5/7 chặng')).toBeInTheDocument()
    })

    it('asks for the order driven, starting at the fixed first POI, and sends it with the run', async () => {
      routeQueue = [votingRoute]
      renderPage(<TechnicalRouteTestsPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả Tuyến thư viện' }))
      await readyRobotLine()
      await screen.findByRole('option', { name: 'Lan Staff · lan' })
      fireEvent.change(screen.getByLabelText('Staff đi cùng'), { target: { value: 'staff-1' } })
      fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã chạy thử.' } })
      passAllRouteChecks()
      const order = within(screen.getByRole('group', { name: 'Thứ tự robot đã đi' }))
      expect(order.getByText('Đã đi 5/7 chặng. Còn thiếu 2 chặng: Phòng C → Phòng B, Phòng B → Điểm kết thúc')).toBeInTheDocument()
      expect(order.getByLabelText('Thứ tự đã chọn')).toHaveTextContent('Bắt đầu → Sảnh A → …')
      expect(screen.getByText(/chọn đủ thứ tự robot đã đi/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
      fireEvent.click(order.getByRole('button', { name: 'Tiếp theo: Phòng C' }))
      fireEvent.click(order.getByRole('button', { name: 'Tiếp theo: Phòng B' }))
      expect(order.getByLabelText('Thứ tự đã chọn')).toHaveTextContent('Bắt đầu → Sảnh A → Phòng C → Phòng B → Kết thúc')
      expect(order.queryByRole('button', { name: /Tiếp theo:/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
      await waitFor(() => expect(testRunCalls()).toHaveLength(1))
      expect(JSON.parse(String(testRunCalls()[0].init?.body))).toMatchObject({ resultCode: 'PASS', traversedStopIds: ['s-a', 's-c', 's-b'] })
    })

    it('sends no order for an ordinary route', async () => {
      await openRouteTest()
      passAllRouteChecks()
      expect(screen.queryByRole('group', { name: 'Thứ tự robot đã đi' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
      await waitFor(() => expect(testRunCalls()).toHaveLength(1))
      expect(JSON.parse(String(testRunCalls()[0].init?.body)).traversedStopIds).toBeUndefined()
    })
  })

  it('names the other saves and Tours a result also decides, and warns on FAIL that those Tours stop', async () => {
    routeQueue = [{ ...routeFixture, sharedResultRevisions: [{ revisionId: 'rev-0', revisionNumber: 1, createdAt: '2026-11-16T05:23:00Z',
      scheduledTours: [{ id: 't1', name: 'TEST WF-A Tour thường', scheduledStartAt: '2026-11-20T04:15:00Z', state: 'SCHEDULED' }] }] }]
    renderPage(<TechnicalRouteTestsPage />)
    expect(await screen.findByText('Kết quả này áp dụng cho cả: phiên bản 1 (16/11 12:23) · 1 Tour đã lên lịch: TEST WF-A Tour thường · 20/11 11:15')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kết quả Tuyến thư viện' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Kết quả này áp dụng cho cả: phiên bản 1 (16/11 12:23) · 1 Tour đã lên lịch: TEST WF-A Tour thường · 20/11 11:15.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/sẽ không chốt và không bắt đầu được/)).not.toBeInTheDocument()
    // Each check is named by its text, not by the checkbox value "on".
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Robot dừng an toàn' }))
    expect(within(dialog).getByText('Các Tour này sẽ không chốt và không bắt đầu được cho tới khi có lần chạy đạt.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Chỉ đổi tên, mô tả, thời gian dừng hoặc thuyết minh thì giữ kết quả\./)).toBeInTheDocument()
  })

  // F1: the page's two notes match routeChanges: camera angles change the path, name and description do not.
  it('says which edits keep the path\'s result and which need a new run', async () => {
    renderPage(<TechnicalRouteTestsPage />)
    expect(await screen.findByText(/đổi thứ tự điểm dừng, đổi góc nhìn camera, điểm đầu, điểm cuối hoặc bản đồ\) thì bản mới cần chạy thử lại\./)).toBeInTheDocument()
    expect(screen.getByText('Chỉ đổi tên, mô tả, thời gian dừng hoặc thuyết minh')).toBeInTheDocument()
  })

  it('lists a save that carries its path\'s PASS with the passed ones, not with saves never run', async () => {
    routeQueue = [{ ...routeFixture, verificationStatus: 'PASS', effectiveTestRunId: 'run-0',
      testRuns: [{ id: 'run-0', routeRevisionId: 'rev-0', resultCode: 'PASS', checkedAt: '2026-11-16T05:30:00Z' }],
      sharedResultRevisions: [{ revisionId: 'rev-0', revisionNumber: 1, createdAt: '2026-11-16T05:23:00Z', scheduledTours: [] }] }]
    routeCatalog = routeQueue
    renderPage(<TechnicalRouteTestsPage />)
    expect(await screen.findByText('Chưa có tuyến chờ chạy thử')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Đã đạt: 1/ }))
    expect(await screen.findByText('Giữ kết quả từ phiên bản 1 (16/11 12:23)')).toBeInTheDocument()
    expect(screen.getByText('Chạy thử đạt')).toBeInTheDocument()
  })

  it('asks for no run time and shows the estimated length instead', async () => {
    await openRouteTest()
    expect(screen.queryByLabelText(/Tổng thời gian chạy/)).not.toBeInTheDocument()
    expect(screen.getByText('Thời lượng dự kiến: 7 phút (tự tính từ thời gian dừng và quãng đường)')).toBeInTheDocument()
    passAllRouteChecks()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeEnabled()
  })

  it('closes the dialog and keeps it closed when the saved route moves to the recorded list', async () => {
    await openRouteTest()
    passAllRouteChecks()
    routeQueue = []
    routeCatalog = [{ ...routeFixture, verificationStatus: 'PASS' }]
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /Đã đạt: 1/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the POI dialog when the saved revision leaves the queue', async () => {
    poiQueue = [queueItem]
    await openPoiCheck()
    passAllPoiChecks()
    poiQueue = []
    poiProposals = [{ ...proposal, revision: { ...proposal.revision, navigationStatus: 'PASS' } }]
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /Đã đạt: 1/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the route result neutral until a box is touched, then follows the ticks even when all are unticked', async () => {
    await openRouteTest()
    expect(computedResult()).toHaveTextContent('Kết quả: chưa tick mục nào')
    expect(screen.queryByLabelText('Lý do không đạt')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Định vị đạt'))
    fireEvent.click(screen.getByLabelText('Định vị đạt'))
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.getByLabelText('Lý do không đạt')).toBeRequired()
  })

  it('records a route run that passed nothing with one Không đạt mục nào click, no tick-and-untick', async () => {
    await openRouteTest()
    expect(computedResult()).toHaveTextContent('Kết quả: chưa tick mục nào')
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Không đạt mục nào' }))
    expect(screen.queryByRole('button', { name: 'Không đạt mục nào' })).not.toBeInTheDocument()
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.getByLabelText('Lý do không đạt')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Mất định vị ngay từ đầu.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(1))
    expect(JSON.parse(String(testRunCalls()[0].init?.body))).toMatchObject({ resultCode: 'FAIL', allStopsReached: false, safelyStopped: false, localizationPassed: false, failureReason: 'Mất định vị ngay từ đầu.', evidenceNote: 'Đã chạy thử.' })
  })

  it('ticks every route box with Tích tất cả and saves PASS without a reason', async () => {
    await openRouteTest()
    fireEvent.click(screen.getByRole('button', { name: 'Tích tất cả' }))
    for (const label of ['Robot đi đủ các điểm dừng', 'Robot dừng an toàn', 'Định vị đạt']) expect(screen.getByLabelText(label)).toBeChecked()
    expect(computedResult()).toHaveTextContent('Kết quả: Đạt')
    expect(screen.queryByLabelText('Lý do không đạt')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bỏ tích tất cả' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(1))
    expect(JSON.parse(String(testRunCalls()[0].init?.body))).toMatchObject({ resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true })
  })

  it('hides Không đạt mục nào once a route box is ticked', async () => {
    await openRouteTest()
    fireEvent.click(screen.getByLabelText('Định vị đạt'))
    expect(screen.queryByRole('button', { name: 'Không đạt mục nào' })).not.toBeInTheDocument()
  })

  // D3: beside the computed Không đạt, the unticked items in the words of the saved result.
  it('names the unticked items beside a computed Không đạt', async () => {
    await openRouteTest()
    fireEvent.click(screen.getByLabelText('Robot đi đủ các điểm dừng'))
    fireEvent.click(screen.getByLabelText('Robot dừng an toàn'))
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạtKhông đạt ở: định vị')
    fireEvent.click(screen.getByLabelText('Robot dừng an toàn'))
    expect(computedResult()).toHaveTextContent('Không đạt ở: dừng an toàn, định vị')
    fireEvent.click(screen.getByLabelText('Robot dừng an toàn'))
    fireEvent.click(screen.getByLabelText('Định vị đạt'))
    expect(computedResult()).toHaveTextContent('Kết quả: Đạt')
    expect(computedResult()).not.toHaveTextContent('Không đạt ở')
  })

  // D6: a route Staff stopped using keeps its result, labelled and below the routes in use.
  it('labels retired routes in the recorded lists and puts them last', async () => {
    routeCatalog = [
      { ...routeFixture, routeId: 'route-old', revisionId: 'rev-old', name: 'Tuyến cũ', verificationStatus: 'PASS', isActive: false },
      { ...routeFixture, verificationStatus: 'PASS', isActive: true },
    ]
    renderPage(<TechnicalRouteTestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Đã đạt: 2/ }))
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringMatching(/^Tuyến thư viện/), expect.stringMatching(/^Tuyến cũ Đã ngừng sử dụng/),
    ])
    expect(within(rows[0]).queryByText('Đã ngừng sử dụng')).not.toBeInTheDocument()
    expect(rows[1]).toHaveClass('opacity-60')
    expect(within(rows[1]).getByRole('button', { name: 'Xem kết quả Tuyến cũ' })).toBeInTheDocument()
  })

  it('records Không đạt when a box is left unticked, with the reason required', async () => {
    await openRouteTest()
    fireEvent.click(screen.getByLabelText('Robot dừng an toàn'))
    fireEvent.click(screen.getByLabelText('Định vị đạt'))
    expect(computedResult()).toHaveTextContent('Kết quả: Không đạt')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Lý do không đạt')).toBeRequired()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.getByText('Chưa lưu được: nhập lý do không đạt.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Lệch điểm 2.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(1))
    expect(JSON.parse(String(testRunCalls()[0].init?.body))).toMatchObject({ resultCode: 'FAIL', failureReason: 'Lệch điểm 2.', allStopsReached: false, safelyStopped: true, localizationPassed: true })
  })

  it('shows a refused robot beside its field and retries with the same request id', async () => {
    // The server words readiness refusals itself; a sentence-less older refusal falls back to the fixed text.
    routeRefusal = { status: 409, body: { message: 'Robot amr-01 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.', errors: { code: 'ROBOT_NOT_READY_FOR_ROUTE', fields: null } } }
    await openRouteTest()
    passAllRouteChecks()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByText('Robot amr-01 chưa có kiểm tra triển khai đạt trên bản đồ đang gán.')).toBeInTheDocument()
    routeRefusal = { status: 409, body: { message: '', errors: { code: 'MAP_NOT_CURRENTLY_DEPLOYED', fields: null } } }
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByText(/sẵn sàng trên bản đồ và checksum/)).toBeInTheDocument()
    routeRefusal = null
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(3))
    expect(JSON.parse(String(testRunCalls()[2].init?.body)).requestId).toBe(JSON.parse(String(testRunCalls()[0].init?.body)).requestId)
  })

  // Replaces the requireReady picker tests: the route test reads the server's readiness for the route's map version.
  it('shows the robot ready on the route map read-only and records the run with it', async () => {
    physicalRobots = [
      makePhysicalRobot({ id: 'robot-2', robotCode: 'amr-02', displayName: 'AMR 02', assignedMapVersionId: 'map-v1', readiness: notReady('Robot amr-02 chưa xác nhận kết nối.') }),
      makePhysicalRobot(),
    ]
    await openRouteTest()
    expect(within(screen.getByRole('dialog')).queryByLabelText('Robot vật lý')).not.toBeInTheDocument()
    passAllRouteChecks()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(1))
    expect(JSON.parse(String(testRunCalls()[0].init?.body)).robotCode).toBe('amr-01')
  })

  it('locks saving when a refresh shows the robot is no longer ready, with the server reason and its setup link', async () => {
    await openRouteTest()
    passAllRouteChecks()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeEnabled()
    physicalRobots = [makePhysicalRobot({ connectionStatus: 'UNCONFIRMED', firstAcceptedSyncAt: null, readiness: { ...notSetUp('Robot amr-01 chưa xác nhận kết nối.'), mapVersionId: 'map-v1', nextStep: 'CONFIRM_CONNECTION' } })]
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật trạng thái' }))
    expect(await screen.findByRole('link', { name: 'Kết nối MiniPC cho amr-01' })).toHaveAttribute('href', `/technical/robots?robot=robot-1&returnTo=${encodeURIComponent('/technical/route-tests?route=rev-1')}`)
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
  })

  it('lists recorded runs read-only and lets a new run be added', async () => {
    const run = { id: 'run-1', robotCode: 'amr-01', participatingStaffUserId: 'staff-1', resultCode: 'FAIL', allStopsReached: false, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 300, failureReason: 'Lệch điểm 2.', evidenceNote: 'Lần một.', checkedAt: '2026-10-30T10:00:00Z' }
    routeCatalog = [{ ...routeFixture, verificationStatus: 'FAIL' }]
    routeDetail = { ...routeFixture, verificationStatus: 'FAIL', testRuns: [run], effectiveTestRunId: 'run-1' }
    renderPage(<TechnicalRouteTestsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Không đạt: 1/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Xem kết quả Tuyến thư viện' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(await dialog.findByText(/Lần một/)).toBeInTheDocument()
    expect(dialog.queryByText(/đo được/)).not.toBeInTheDocument()
    expect(dialog.getByText(/Lệch điểm 2/)).toBeInTheDocument()
    expect(dialog.getByText('Kết quả hiện tại')).toBeInTheDocument()
    expect(await dialog.findByText(/Lan Staff/)).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Ghi lần chạy mới' }))
    expect(await screen.findByLabelText('Staff đi cùng')).toBeInTheDocument()
  })
})
