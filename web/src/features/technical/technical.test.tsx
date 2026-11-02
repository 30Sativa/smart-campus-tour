import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TechnicalConfirmationsPage from '../../routes/technical/TechnicalConfirmationsPage'
import TechnicalPoiImportPage from '../../routes/technical/TechnicalPoiImportPage'
import TechnicalMapsPage from '../../routes/technical/TechnicalMapsPage'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import { useAuthStore } from '../../stores/auth-store'
import { useToastStore } from '../../components/ui/toast-store'
import type { PhysicalRobotOption, RobotCredentialView } from './api/technical'

const map = {
  id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1',
  packageFileName: 'library-v1.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z',
}
const mapItem = { map, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null,
  preparationEvidence: { id: 'check-1', mapVersionId: map.id, robotCode: 'amr-01', packageSha256: 'a'.repeat(64), localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Fixture evidence', checkedAt: '2026-10-27T10:00:00Z' },
  currentlyDeployedOn: [{ robotCode: 'amr-01', checkedAt: '2026-10-27T10:00:00Z' }] }
const proposal = {
  id: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=',
  revision: { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Library', purpose: 'Entrance', description: null, narrationText: 'Giới thiệu thư viện.', fallbackVideoUrl: 'https://example.test/video', x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:01:00Z', navigationStatus: 'NOT_CHECKED' },
}
const queueItem = { proposalId: proposal.id, currentRevision: proposal.currentRevision, rowVersion: proposal.rowVersion, revision: proposal.revision }
const response = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
const makePhysicalRobot = (overrides: Partial<PhysicalRobotOption> = {}): PhysicalRobotOption => ({
  id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01', firstAcceptedSyncAt: '2026-10-27T10:00:00Z', firstAcceptedMapKey: 'library-v1', firstAcceptedFrameId: 'map',
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-10-27T10:01:00Z', rowVersion: 'AAAAAAAAAAA=', assignedMapVersionId: 'map-v1', assignedAreaName: 'Library', assignedVersionNumber: 1, assignedMapKey: 'library-v1', assignedFrameId: 'map', mapAssignedAt: '2026-10-27T10:00:00Z', mapAssignedByName: 'Technical', latestDeployedMapKey: 'library-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true,
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
let poiProposals: unknown[] = []
let poiHistory: unknown = null
let verifyRefusal: { status: number; body: unknown } | null = null
let poiQueue: unknown[] = [queueItem]
let routeQueue: unknown[] = []
let routeCatalog: unknown[] = []
let routeDetail: unknown = null
let routeRefusal: { status: number; body: unknown } | null = null
const routeFixture = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 2, name: 'Tuyến thư viện', mapKey: 'library-v1', stops: [{}, {}], dwellDurationSeconds: 60, verificationStatus: 'NOT_TESTED', isSubmitted: true, testRuns: [], effectiveTestRunId: null, revisionHistory: [] }
let credentialStatus: RobotCredentialView = { robotCode: 'amr-01', status: 'NOT_ISSUED', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: null, revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] }

const openRobotDetail = async () => fireEvent.click(await screen.findByRole('button', { name: 'Chi tiết amr-01' }))

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
    poiProposals = []
    poiHistory = null
    verifyRefusal = null
    poiQueue = [queueItem]
    routeQueue = []
    routeCatalog = []
    routeDetail = null
    routeRefusal = null
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
      if (url.pathname === '/api/maps/versions' && init?.method !== 'POST') return response([{ ...mapItem, technicalCheckStatus: mapCheckStatus }])
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
        const registered = makePhysicalRobot({ id: 'robot-2', ...JSON.parse(String(init.body)), firstAcceptedSyncAt: null, firstAcceptedMapKey: null, firstAcceptedFrameId: null, connectionStatus: 'UNCONFIRMED', lastSyncReceivedAt: null, assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null, latestDeployedMapKey: null, latestDeployedFrameId: null, latestDeploymentPassed: null })
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

  it('lists real map versions and posts manual deployment evidence to the map-version endpoint', async () => {
    renderPage(<TechnicalMapsPage />)
    expect(await screen.findByText('Quản lý bản đồ')).toBeInTheDocument()
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Khu vực/ })).toBeInTheDocument()
    expect(screen.getByText('Đạt kiểm tra')).toBeInTheDocument()
    expect(screen.getByText('amr-01')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    await screen.findByRole('option', { name: /AMR 01 · amr-01/ })
    fireEvent.change(await screen.findByLabelText('Robot kiểm tra'), { target: { value: 'amr-01' } })
    fireEvent.click(screen.getByLabelText('Localization đạt'))
    fireEvent.click(screen.getByLabelText('Map hiển thị đúng'))
    fireEvent.change(screen.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Checked in person' } })
    failDeploymentOnce = true
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await screen.findByText('Temporary server error.')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/technical/map-versions/map-v1/deployment-checks' && item.init?.method === 'POST')).toHaveLength(2))
    const calls = requests.filter(item => item.url.pathname.endsWith('/deployment-checks') && item.init?.method === 'POST')
    const call = calls[0]
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true })
    expect(JSON.parse(String(calls[1].init?.body)).requestId).toBe(JSON.parse(String(call.init?.body)).requestId)
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
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Đã lưu library-v2 · v2')
  })

  it('shows an actionable empty robot state and keeps deployment save disabled', async () => {
    physicalRobots = []
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    expect(await screen.findByText('Chưa có robot vật lý được đăng ký. Cần hoàn tất cấu hình robot trước khi ghi kết quả kiểm tra.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeDisabled()
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

  it('shows registered robot lookup errors and retries before saving a check', async () => {
    failRobotLookup = true
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    expect(await screen.findByText('Robot lookup unavailable.')).toBeInTheDocument()
    failRobotLookup = false
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại danh sách robot' }))
    expect(await screen.findByRole('option', { name: /AMR 01 · amr-01/ })).toBeInTheDocument()
  })

  it('shows a non-blocking assignment warning when assigned context differs from the latest deployment', async () => {
    physicalRobots = [makePhysicalRobot({ assignedMapKey: 'library-v1', assignedFrameId: 'map', latestDeployedMapKey: 'library-v2', latestDeployedFrameId: 'map_v2', latestDeploymentPassed: false })]
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByRole('columnheader', { name: 'Kiểm tra triển khai' })).toBeInTheDocument()
    expect(await screen.findByText('Chưa đạt')).toBeInTheDocument()
    expect(screen.getByText('Khác bản đồ được gán')).toBeInTheDocument()
    await openRobotDetail()
    expect(await screen.findByText(/Robot được gán map library-v1 · map nhưng lần triển khai gần nhất là library-v2 · map_v2/)).toBeInTheDocument()
    expect(screen.getByText('library-v2 · map_v2')).toBeInTheDocument()
  })

  it('opens the robot named in the link from the map page, where its map is assigned', async () => {
    renderPage(<TechnicalRobotsPage />, '/technical/robots?robot=robot-1')
    const detail = await screen.findByRole('dialog', { name: 'AMR 01' })
    expect(within(detail).getByRole('button', { name: 'Thay đổi bản đồ' })).toBeInTheDocument()
  })

  it('shows an achieved badge when the latest deployment check passed', async () => {
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Đạt')).toBeInTheDocument()
  })

  it('shows the unassigned state and no mismatch notice when the assignment matches', async () => {
    physicalRobots = [makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null })]
    const unconfigured = renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Chưa gán bản đồ')).toBeInTheDocument()
    await openRobotDetail()
    expect(screen.getByRole('button', { name: 'Gán bản đồ' })).toBeInTheDocument()
    unconfigured.unmount()

    physicalRobots = [makePhysicalRobot()]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    expect((await screen.findAllByText('library-v1 · map')).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/Robot được gán map/)).not.toBeInTheDocument()
  })

  it('assigns a non-PASSED map, confirms the MiniPC context, and refreshes robot/map views', async () => {
    mapCheckStatus = 'PENDING'
    physicalRobots = [makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null })]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Gán bản đồ' }))
    await screen.findByRole('option', { name: 'Library' })
    fireEvent.change(await screen.findByLabelText('Khu vực'), { target: { value: 'library' } })
    // The newest version starts selected and reads as a version, not a MapKey.
    expect(await screen.findByRole('option', { name: /^Phiên bản 1 \(mới nhất\) · tải lên .* · Chờ kỹ thuật kiểm tra$/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Phiên bản bản đồ')).toHaveValue(map.id)
    expect(screen.getByText(/Sau khi lưu, nhập hai giá trị này trên MiniPC/)).toBeInTheDocument()
    expect(screen.getByText('library-v1', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu bản đồ' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bản đồ' }))
    expect(requests.some(item => item.url.pathname.endsWith('/map-assignment'))).toBe(false)
    const confirmation = within(screen.getByRole('dialog', { name: 'Gán bản đồ cho amr-01?' }))
    expect(confirmation.getByText(/Gán Library phiên bản 1\. Trên MiniPC nhập MapKey library-v1, FrameId map\./)).toBeInTheDocument()
    fireEvent.click(confirmation.getByRole('button', { name: 'Gán bản đồ' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname.endsWith('/map-assignment') && item.init?.method === 'PUT')).toBe(true))
    const request = requests.find(item => item.url.pathname.endsWith('/map-assignment') && item.init?.method === 'PUT')!
    expect(JSON.parse(String(request.init?.body))).toMatchObject({ mapVersionId: map.id, expectedRowVersion: 'AAAAAAAAAAA=' })
    expect((await screen.findAllByText('library-v1 · map')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Nhập hai giá trị này trên MiniPC/)).toBeInTheDocument()
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method !== 'POST').length).toBeGreaterThan(1))
  })

  it('names the robot already holding an area and does not offer that area', async () => {
    physicalRobots = [
      makePhysicalRobot({ assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null }),
      makePhysicalRobot({ id: 'robot-2', robotCode: 'amr-02', displayName: 'AMR 02' }),
    ]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Gán bản đồ' }))
    expect(await screen.findByRole('option', { name: 'Library (robot amr-02 đang dùng)' })).toBeDisabled()
  })

  it('warns about Tours a map change strands and leaves them scheduled', async () => {
    affectedTours = [{ tourId: 'tour-1', name: 'Tour sáng', scheduledStartAt: '2026-11-20T02:00:00Z', state: 'SCHEDULED' }]
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: /Gán bản đồ|Thay đổi bản đồ/ }))
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
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Chi tiết amr-01' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng sử dụng (1)' }))
    await openRobotDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Kích hoạt lại' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname.endsWith('/activate'))).toBe(true))
  })

  it('blocks a new PASS for an unconfirmed robot but still permits an observed FAIL', async () => {
    physicalRobots = [makePhysicalRobot({ firstAcceptedSyncAt: null, firstAcceptedMapKey: null, firstAcceptedFrameId: null, connectionStatus: 'UNCONFIRMED', lastSyncReceivedAt: null })]
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    await screen.findByRole('option', { name: /amr-01 · Chưa xác nhận kết nối/ })
    fireEvent.change(screen.getByLabelText('Robot kiểm tra'), { target: { value: 'amr-01' } })
    fireEvent.click(screen.getByLabelText('Localization đạt'))
    fireEvent.click(screen.getByLabelText('Map hiển thị đúng'))
    fireEvent.change(screen.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Đã kiểm tra trực tiếp.' } })
    expect(await screen.findByRole('status')).toHaveTextContent('Robot chưa xác nhận kết nối.')
    expect(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Map hiển thị đúng'))
    expect(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await waitFor(() => expect(requests.filter(item => item.url.pathname.endsWith('/deployment-checks') && item.init?.method === 'POST')).toHaveLength(1))
    expect(JSON.parse(String(requests.find(item => item.url.pathname.endsWith('/deployment-checks') && item.init?.method === 'POST')?.init?.body)))
      .toMatchObject({ localizationPassed: true, displayPassed: false, robotCode: 'amr-01' })
  })

  it('refreshes connection confirmation and latest sync without clearing map-check inputs', async () => {
    physicalRobots = [makePhysicalRobot({ firstAcceptedSyncAt: null, firstAcceptedMapKey: null, firstAcceptedFrameId: null, connectionStatus: 'UNCONFIRMED', lastSyncReceivedAt: null })]
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    await screen.findByRole('option', { name: /AMR 01 · amr-01 · Chưa xác nhận kết nối/ })
    fireEvent.change(await screen.findByLabelText('Robot kiểm tra'), { target: { value: 'amr-01' } })
    expect(screen.getByLabelText('Robot kiểm tra')).toHaveValue('amr-01')
    fireEvent.click(screen.getByLabelText('Localization đạt'))
    fireEvent.click(screen.getByLabelText('Map hiển thị đúng'))
    fireEvent.change(screen.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Quan sát tại khu vực.' } })
    expect(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeDisabled()

    physicalRobots = [makePhysicalRobot({ firstAcceptedSyncAt: '2026-10-29T10:00:00Z', firstAcceptedMapKey: 'library-v1', firstAcceptedFrameId: 'map', connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-10-29T10:01:00Z' })]
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật trạng thái' }))

    expect(await screen.findByRole('option', { name: /AMR 01 · amr-01 · Đã xác nhận · Đang kết nối/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Robot kiểm tra')).toHaveValue('amr-01')
    expect(screen.getByLabelText('Localization đạt')).toBeChecked()
    expect(screen.getByLabelText('Map hiển thị đúng')).toBeChecked()
    expect(screen.getByLabelText('Bằng chứng kiểm tra')).toHaveValue('Quan sát tại khu vực.')
    expect(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeEnabled()
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
    renderPage(<TechnicalPoiImportPage />)
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.queryByText('Giới thiệu thư viện.')).not.toBeInTheDocument()
    expect(screen.queryByText(/^1, 2, 0$/)).not.toBeInTheDocument()
    expect(await screen.findByText('Library · phiên bản 1')).toBeInTheDocument()
    expect(screen.queryByText(/library-v1/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết Library' }))
    const detail = within(screen.getByRole('dialog', { name: 'Library' }))
    expect(detail.getByText('Giới thiệu thư viện.')).toBeInTheDocument()
    expect(detail.getByText('x 1, y 2, yaw 0')).toBeInTheDocument()
    expect(detail.getByText('Phía trước')).toBeInTheDocument()
    fireEvent.click(detail.getByRole('button', { name: 'Ghi kết quả' }))
    expect(screen.queryByRole('dialog', { name: 'Library' })).not.toBeInTheDocument()
    expect(screen.getByText('Nội dung thuyết minh, chỉ đọc')).toBeInTheDocument()
    expect(screen.getByText(/Video dự phòng: https:\/\/example\.test\/video/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Nội dung thuyết minh' })).not.toBeInTheDocument()
    await screen.findByRole('option', { name: /AMR 01 · amr-01/ })
    expect(screen.getByLabelText('Robot vật lý').tagName).toBe('SELECT')
    fireEvent.change(screen.getByLabelText('Robot vật lý'), { target: { value: 'amr-01' } })
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã đi kiểm tra tại chỗ.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/poi-proposals/proposal-1/revisions/1/verification')).toBe(true))
    expect(requests.some(item => item.url.pathname === '/api/technical/poi-verifications')).toBe(true)
    const call = requests.find(item => item.url.pathname.endsWith('/verification'))!
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ expectedRevisionNumber: 1, expectedRowVersion: proposal.rowVersion, resultCode: 'PASS', robotCode: 'amr-01' })
  })

  const openPoiCheck = async () => {
    renderPage(<TechnicalPoiImportPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    await screen.findByRole('option', { name: /AMR 01 · amr-01/ })
    fireEvent.change(screen.getByLabelText('Robot vật lý'), { target: { value: 'amr-01' } })
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã kiểm tra.' } })
  }
  const verificationCalls = () => requests.filter(item => item.url.pathname.endsWith('/verification'))

  it('blocks Đạt until all four checks are ticked and names the missing one', async () => {
    await openPoiCheck()
    fireEvent.click(screen.getByLabelText('Camera preset được xác nhận'))
    expect(screen.getByRole('alert')).toHaveTextContent('còn thiếu: Camera preset được xác nhận')
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.submit(document.getElementById('poi-verify-form')!)
    expect(verificationCalls()).toHaveLength(0)

    fireEvent.click(screen.getByLabelText('Camera preset được xác nhận'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeEnabled()
  })

  it('requires a failed observation and a reason for Không đạt', async () => {
    await openPoiCheck()
    const result = within(screen.getByRole('group', { name: 'Kết quả' }))
    expect(result.getByRole('button', { name: 'Đạt' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(result.getByRole('button', { name: 'Không đạt' }))
    expect(result.getByRole('button', { name: 'Không đạt' })).toHaveAttribute('aria-pressed', 'true')
    expect(result.getByRole('button', { name: 'Đạt' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('alert')).toHaveTextContent('Không đạt cần ít nhất một mục chưa đạt')
    fireEvent.click(screen.getByLabelText('Robot dừng đúng vị trí'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Lệch vị trí.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(verificationCalls()).toHaveLength(1))
    expect(JSON.parse(String(verificationCalls()[0].init?.body))).toMatchObject({ resultCode: 'FAIL', stopped: false, reason: 'Lệch vị trí.' })
  })

  it('replaces the generic validation refusal with Vietnamese text', async () => {
    verifyRefusal = { status: 400, body: { message: 'One or more validation errors occurred.', errors: {} } }
    await openPoiCheck()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Đạt cần đủ cả bốn mục')
    expect(screen.queryByText('One or more validation errors occurred.')).not.toBeInTheDocument()
  })

  it('shows field and conflict refusals beside the field they concern', async () => {
    verifyRefusal = { status: 400, body: { message: 'One or more validation errors occurred.', errors: { 'Request.EvidenceNote': ['too long'] } } }
    await openPoiCheck()
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập ghi chú bằng chứng')
    expect(screen.getByLabelText('Ghi chú bằng chứng')).toHaveAttribute('aria-invalid', 'true')

    verifyRefusal = { status: 409, body: { message: 'The exact map version must have a current successful localization/display deployment check on this robot.', errors: { code: 'MAP_NOT_DEPLOYED', fields: null } } }
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(verificationCalls()).toHaveLength(2))
    expect(await screen.findByText(/Robot này chưa có kiểm tra triển khai đạt mới nhất/)).toBeInTheDocument()
  })

  it('blocks saving while the chosen robot was last checked on another map, for either result', async () => {
    physicalRobots = [makePhysicalRobot({ latestDeployedMapKey: 'library-v2' })]
    await openPoiCheck()
    expect(await screen.findByText(/không phải kết quả đạt trên library-v1/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.getByText('Chưa lưu được: robot chưa kiểm tra triển khai đạt trên map này.')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: 'Kết quả' })).getByRole('button', { name: 'Không đạt' }))
    fireEvent.click(screen.getByLabelText('Robot dừng đúng vị trí'))
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Lệch vị trí.' } })
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.submit(document.getElementById('poi-verify-form')!)
    expect(verificationCalls()).toHaveLength(0)
  })

  it('says what is missing when Không đạt cannot be saved yet', async () => {
    await openPoiCheck()
    fireEvent.click(within(screen.getByRole('group', { name: 'Kết quả' })).getByRole('button', { name: 'Không đạt' }))
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
    renderPage(<TechnicalPoiImportPage />)
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.queryByText('Sảnh đã đạt')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /Đã đạt\s*1/ }))
    expect(screen.getByRole('button', { name: /Đã đạt\s*1/ })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Sảnh đã đạt')).toBeInTheDocument()
    expect(screen.queryByText('Library')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ghi kết quả' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Xem kết quả' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(await dialog.findByText(/Lần hai đạt/)).toBeInTheDocument()
    expect(dialog.getByText(/Lần đầu/)).toBeInTheDocument()
    expect(dialog.getByText('Đang áp dụng')).toBeInTheDocument()
    expect(dialog.getByText(/chỉ đổi nội dung/)).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Lưu kết quả' })).not.toBeInTheDocument()
  })

  it('counts a rejected revision outside the queue as needing a recheck, without offering a second result', async () => {
    poiProposals = [{ id: 'proposal-3', currentRevision: 1, rowVersion: 'CCCCCCCCCCC=', revision: { ...proposal.revision, id: 'revision-3', name: 'POI không đạt', navigationStatus: 'FAIL', verificationSourceRevisionId: 'revision-3' } }]
    renderPage(<TechnicalPoiImportPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Cần kiểm tra lại\s*1/ }))
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
    expect(screen.getAllByText(/Library/).filter(item => item.textContent === ' · Library · phiên bản 1')).toHaveLength(1)
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
    expect(screen.getByRole('dialog', { name: 'Khóa Fleet Sync · amr-01' })).toBeInTheDocument()
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('returns to the robot detail after closing the key dialog', async () => {
    renderPage(<TechnicalRobotsPage />)
    await openRobotDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Quản lý khóa' }))
    expect(await screen.findByRole('dialog', { name: 'Khóa Fleet Sync · amr-01' })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Đóng' })[0])
    expect(screen.getByRole('dialog', { name: 'AMR 01' })).toBeInTheDocument()
  })

  const openRouteTest = async () => {
    routeQueue = [routeFixture]
    renderPage(<TechnicalConfirmationsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả Tuyến thư viện' }))
    await screen.findByRole('option', { name: /AMR 01 · amr-01/ })
    await screen.findByRole('option', { name: 'Lan Staff · lan' })
    fireEvent.change(screen.getByLabelText('Robot vật lý'), { target: { value: 'amr-01' } })
    fireEvent.change(screen.getByLabelText('Staff đi cùng'), { target: { value: 'staff-1' } })
    fireEvent.change(screen.getByLabelText('Tổng thời gian chạy toàn tuyến (giây)'), { target: { value: '420' } })
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã chạy thử.' } })
  }
  const testRunCalls = () => requests.filter(item => item.url.pathname.endsWith('/test-runs'))

  it('states that a route record is human evidence and shows no result without a queue item', async () => {
    renderPage(<TechnicalConfirmationsPage />)
    expect(screen.getByText(/không chứng minh robot đã chạy thật/)).toBeInTheDocument()
    expect(screen.getByText(/không tự làm tuyến READY/)).toBeInTheDocument()
    expect(await screen.findByText('Không có tuyến nào đang chờ chạy thử.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ghi kết quả/ })).not.toBeInTheDocument()
  })

  it('records a whole-route PASS against the exact submitted revision', async () => {
    await openRouteTest()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Robot dừng an toàn'))
    expect(screen.getByRole('alert')).toHaveTextContent('còn thiếu: Robot đi đủ các điểm dừng')
    fireEvent.click(screen.getByLabelText('Robot dừng an toàn'))
    for (const label of ['Robot đi đủ các điểm dừng', 'Robot dừng an toàn', 'Localization đạt']) fireEvent.click(screen.getByLabelText(label))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(1))
    expect(testRunCalls()[0].url.pathname).toBe('/api/technical/routes/route-1/revisions/rev-1/test-runs')
    const body = JSON.parse(String(testRunCalls()[0].init?.body))
    expect(body).toMatchObject({ robotCode: 'amr-01', participatingStaffUserId: 'staff-1', resultCode: 'PASS', allStopsReached: true, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 420, failureReason: null, evidenceNote: 'Đã chạy thử.' })
    expect(body.requestId).toBeTruthy()
    expect(body.routeName).toBeUndefined()
    expect(body.routeId).toBeUndefined()
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Đã ghi chạy thử đạt: Tuyến thư viện'))
  })

  it('closes the dialog and keeps it closed when the saved route moves to the recorded list', async () => {
    await openRouteTest()
    for (const label of ['Robot đi đủ các điểm dừng', 'Robot dừng an toàn', 'Localization đạt']) fireEvent.click(screen.getByLabelText(label))
    routeQueue = []
    routeCatalog = [{ ...routeFixture, verificationStatus: 'PASS' }]
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /Đã đạt\s*1/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the POI dialog when the saved revision leaves the queue', async () => {
    poiQueue = [queueItem]
    await openPoiCheck()
    poiQueue = []
    poiProposals = [{ ...proposal, revision: { ...proposal.revision, navigationStatus: 'PASS' } }]
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /Đã đạt\s*1/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('requires a reason and a failed observation for a failed run', async () => {
    await openRouteTest()
    fireEvent.click(within(screen.getByRole('group', { name: 'Kết quả' })).getByRole('button', { name: 'Không đạt' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do không đạt'), { target: { value: 'Lệch điểm 2.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(1))
    expect(JSON.parse(String(testRunCalls()[0].init?.body))).toMatchObject({ resultCode: 'FAIL', failureReason: 'Lệch điểm 2.', allStopsReached: false })
  })

  it('shows a refused robot beside its field and retries with the same request id', async () => {
    routeRefusal = { status: 409, body: { message: 'x', errors: { code: 'MAP_NOT_CURRENTLY_DEPLOYED', fields: null } } }
    await openRouteTest()
    for (const label of ['Robot đi đủ các điểm dừng', 'Robot dừng an toàn', 'Localization đạt']) fireEvent.click(screen.getByLabelText(label))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    expect(await screen.findByText(/phải đạt trên đúng bản đồ và checksum/)).toBeInTheDocument()
    routeRefusal = null
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(testRunCalls()).toHaveLength(2))
    expect(JSON.parse(String(testRunCalls()[1].init?.body)).requestId).toBe(JSON.parse(String(testRunCalls()[0].init?.body)).requestId)
  })

  it('lists recorded runs read-only and lets a new run be added', async () => {
    const run = { id: 'run-1', robotCode: 'amr-01', participatingStaffUserId: 'staff-1', resultCode: 'FAIL', allStopsReached: false, safelyStopped: true, localizationPassed: true, measuredDurationSeconds: 300, failureReason: 'Lệch điểm 2.', evidenceNote: 'Lần một.', checkedAt: '2026-10-30T10:00:00Z' }
    routeCatalog = [{ ...routeFixture, verificationStatus: 'FAIL' }]
    routeDetail = { ...routeFixture, verificationStatus: 'FAIL', testRuns: [run], effectiveTestRunId: 'run-1' }
    renderPage(<TechnicalConfirmationsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Không đạt\s*1/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Xem kết quả Tuyến thư viện' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(await dialog.findByText(/Lần một/)).toBeInTheDocument()
    expect(dialog.getByText(/Lệch điểm 2/)).toBeInTheDocument()
    expect(dialog.getByText('Đang áp dụng')).toBeInTheDocument()
    expect(await dialog.findByText(/Lan Staff/)).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Ghi lần chạy mới' }))
    expect(await screen.findByLabelText('Staff đi cùng')).toBeInTheDocument()
  })
})
