import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
