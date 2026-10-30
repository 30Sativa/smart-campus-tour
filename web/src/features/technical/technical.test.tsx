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
  revision: { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Library', purpose: 'Entrance', description: null, x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:01:00Z', navigationStatus: 'NOT_CHECKED' },
}
const queueItem = { proposalId: proposal.id, currentRevision: proposal.currentRevision, rowVersion: proposal.rowVersion, revision: proposal.revision }
const response = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
const makePhysicalRobot = (overrides: Partial<PhysicalRobotOption> = {}): PhysicalRobotOption => ({
  id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01', firstAcceptedSyncAt: '2026-10-27T10:00:00Z', firstAcceptedMapKey: 'library-v1', firstAcceptedFrameId: 'map',
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-10-27T10:01:00Z', configuredMapKey: 'library-v1', configuredFrameId: 'map', latestDeployedMapKey: 'library-v1', latestDeployedFrameId: 'map',
  ...overrides,
})
let physicalRobots: PhysicalRobotOption[] = [makePhysicalRobot()]
let mapAreas = [{ areaKey: 'library', displayName: 'Library' }]
let failMapAreaLookup = false
let failDeploymentOnce = false
let failRobotLookup = false
let failRobotRegistration = false
let robotRegistrationDelayMs = 0
let failCredentialMutation = false
let credentialStatus: RobotCredentialView = { robotCode: 'amr-01', status: 'NOT_ISSUED', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: null, revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] }

function renderPage(page: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>)
}

describe('Technical Staff API integration', () => {
  beforeEach(() => {
    requests = []
    physicalRobots = [makePhysicalRobot()]
    mapAreas = [{ areaKey: 'library', displayName: 'Library' }]
    failMapAreaLookup = false
    failDeploymentOnce = false
    failRobotLookup = false
    failRobotRegistration = false
    robotRegistrationDelayMs = 0
    failCredentialMutation = false
    credentialStatus = { robotCode: 'amr-01', status: 'NOT_ISSUED', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: null, revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] }
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
      if (url.pathname === '/api/maps/versions' && init?.method !== 'POST') return response([mapItem])
      if (url.pathname === '/api/technical/map-areas') return failMapAreaLookup
        ? new Response(JSON.stringify({ success: false, message: 'Area lookup unavailable.' }), { status: 503 })
        : response(mapAreas)
      if (url.pathname === '/api/technical/physical-robots' && init?.method === 'POST') {
        if (robotRegistrationDelayMs) await new Promise(resolve => setTimeout(resolve, robotRegistrationDelayMs))
        if (failRobotRegistration) {
          failRobotRegistration = false
          return new Response(JSON.stringify({ success: false, message: 'Robot code already registered.' }), { status: 409 })
        }
        const registered = makePhysicalRobot({ id: 'robot-2', ...JSON.parse(String(init.body)), firstAcceptedSyncAt: null, firstAcceptedMapKey: null, firstAcceptedFrameId: null, connectionStatus: 'UNCONFIRMED', lastSyncReceivedAt: null, configuredMapKey: null, configuredFrameId: null, latestDeployedMapKey: null, latestDeployedFrameId: null })
        physicalRobots = [...physicalRobots, registered]
        return response(registered)
      }
      if (url.pathname === '/api/technical/physical-robots') return failRobotLookup
        ? new Response(JSON.stringify({ success: false, message: 'Robot lookup unavailable.' }), { status: 503 })
        : response(physicalRobots)
      if (url.pathname === '/api/technical/poi-verifications') return response([queueItem])
      if (url.pathname === '/api/technical/map-versions' && init?.method === 'POST') return response({ ...map, versionNumber: 2, mapKey: 'library-v2' })
      if (url.pathname === '/api/technical/map-versions/map-v1/deployment-checks' && init?.method === 'POST') {
        if (failDeploymentOnce) { failDeploymentOnce = false; return new Response(JSON.stringify({ success: false, message: 'Temporary server error.' }), { status: 503 }) }
        return response({ id: 'check-1', mapVersionId: 'map-v1', robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Checked', checkedAt: '2026-10-27T10:00:00Z' })
      }
      if (url.pathname.endsWith('/verification')) return response({ id: 'verification-1' })
      return response(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); useAuthStore.getState().logout() })

  it('lists real map versions and posts manual deployment evidence to the map-version endpoint', async () => {
    renderPage(<TechnicalMapsPage />)
    expect(await screen.findByText('Quản lý bản đồ')).toBeInTheDocument()
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Khu vực' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Mã khu vực' })).toBeInTheDocument()
    expect(screen.getByText('Đã có kiểm tra kỹ thuật đạt')).toBeInTheDocument()
    expect(screen.getByText('Robot đang triển khai: amr-01')).toBeInTheDocument()
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

  it('shows a non-blocking backend map-context warning when configured context differs from the latest deployment', async () => {
    physicalRobots = [makePhysicalRobot({ configuredMapKey: 'library-v1', configuredFrameId: 'map', latestDeployedMapKey: 'library-v2', latestDeployedFrameId: 'map_v2' })]
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText(/Bản đồ trên robot khác với máy chủ. Cập nhật FleetSync:RobotContexts sang library-v2 · map_v2/)).toBeInTheDocument()
    expect(screen.getAllByText('library-v1 · map')).toHaveLength(2)
    expect(screen.getByText('library-v2 · map_v2')).toBeInTheDocument()
  })

  it('shows the unconfigured-context notice and no mismatch notice when the context matches', async () => {
    physicalRobots = [makePhysicalRobot({ configuredMapKey: null, configuredFrameId: null })]
    const unconfigured = renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Chưa thiết lập')).toBeInTheDocument()
    unconfigured.unmount()

    physicalRobots = [makePhysicalRobot()]
    renderPage(<TechnicalRobotsPage />)
    expect((await screen.findAllByText('library-v1 · map')).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/Bản đồ trên robot khác với máy chủ/)).not.toBeInTheDocument()
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
    fireEvent.click(await screen.findByRole('button', { name: 'Khóa kết nối' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cấp khóa' }))
    const secret = await screen.findByText('secret-value-once')
    expect(secret).toBeInTheDocument()
    const request = requests.find(item => item.url.pathname === '/api/technical/robots/amr-01/credential' && item.init?.method === 'POST')!
    expect(request.init?.body).toBeTruthy()
    const closeButtons = screen.getAllByRole('button', { name: 'Đóng' })
    fireEvent.click(closeButtons[0])
    expect(screen.queryByText('secret-value-once')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Khóa kết nối' }))
    expect(await screen.findByText(/Đang hoạt động/)).toBeInTheDocument()
    expect(screen.queryByText('secret-value-once')).not.toBeInTheDocument()
  })

  it('refreshes the robot list and deployment-check picker after credential success and failure', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage(<TechnicalRobotsPage />)
    await screen.findByText('AMR 01')
    const robotListRequestCount = () => requests.filter(item => item.url.pathname === '/api/technical/physical-robots' && item.init?.method !== 'POST').length
    const initialListRequestCount = robotListRequestCount()
    fireEvent.click(screen.getByRole('button', { name: 'Khóa kết nối' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cấp khóa' }))
    await screen.findByText('secret-value-once')
    await waitFor(() => expect(robotListRequestCount()).toBeGreaterThan(initialListRequestCount))

    failCredentialMutation = true
    fireEvent.click(await screen.findByRole('button', { name: 'Cấp lại' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Credential update failed.')
    await waitFor(() => expect(robotListRequestCount()).toBeGreaterThan(initialListRequestCount + 1))
    expect(confirm).toHaveBeenCalled()
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
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kết quả' }))
    fireEvent.change(screen.getByLabelText('Robot vật lý'), { target: { value: 'amr-01' } })
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã đi kiểm tra tại chỗ.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/poi-proposals/proposal-1/revisions/1/verification')).toBe(true))
    expect(requests.some(item => item.url.pathname === '/api/technical/poi-verifications')).toBe(true)
    const call = requests.find(item => item.url.pathname.endsWith('/verification'))!
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ expectedRevisionNumber: 1, expectedRowVersion: proposal.rowVersion, resultCode: 'PASS', robotCode: 'amr-01' })
  })

  it('distinguishes the backend test-run contract from the unwired workspace and physical proof', () => {
    renderPage(<TechnicalConfirmationsPage />)
    expect(screen.getByText(/Backend đã có API queue và test-run/)).toBeInTheDocument()
    expect(screen.getByText(/màn hình này chưa được nối đầy đủ/)).toBeInTheDocument()
    expect(screen.getByText(/không chứng minh robot đã chạy thật/)).toBeInTheDocument()
    expect(screen.getByText(/không tự làm tuyến READY/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument()
  })
})
