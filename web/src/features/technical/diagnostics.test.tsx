import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TechnicalDashboardPage from '../../routes/technical/TechnicalDashboardPage'
import TechnicalMonitoringPage from '../../routes/technical/TechnicalMonitoringPage'
import { useAuthStore } from '../../stores/auth-store'
import type { RobotDiagnosticsDetail, TechnicalDashboard, TechnicalRobotSummary } from './api/diagnostics-api'
import { connectionStatusView, reading, sensorStatusView, sourceState } from './diagnostics-status'

const robotSummary = (overrides: Partial<TechnicalRobotSummary> = {}): TechnicalRobotSummary => ({
  id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01', connectionStatus: 'CONNECTED', syncFresh: true, lastSeenAt: '2026-11-05T08:00:00Z',
  batteryPercent: 82, assignedMapKey: 'library-v1', assignedFrameId: 'map', latestDeployedMapKey: 'library-v1', latestDeployedFrameId: 'map',
  latestDeploymentPassed: true, contextMismatch: false, localized: true, motionReady: true, needsInspection: false, currentTourId: null,
  currentTourName: null, currentTourState: null, rowVersion: 'AAAA', hasDiagnostics: true, diagnosticsFresh: true, cpuPercent: 37,
  cpuTemperatureCelsius: 61, lidarStatus: 'OK', imuStatus: 'WARN', ...overrides,
})

const dashboardFixture = (robots: TechnicalRobotSummary[]): TechnicalDashboard => ({
  collectedAt: '2026-11-05T08:00:05Z',
  kpis: { totalRobots: robots.length, connectedRobots: 1, awaitingDataRobots: 0, disconnectedRobots: robots.length - 1, unconfirmedRobots: 0, heldForInspectionCount: 0, pendingPoiVerificationsCount: 2, pendingRouteTestsCount: 1, activeMapVersionsCount: 3 },
  actionItems: [{ type: 'POI_QUEUE', severity: 'INFO', title: '2 POI đang chờ kiểm chứng kỹ thuật', description: 'Có đề xuất POI mới.', targetId: null, linkUrl: '/technical/poi-import' }],
  robots,
})

const detailFixture = (overrides: Partial<RobotDiagnosticsDetail> = {}): RobotDiagnosticsDetail => ({
  robotCode: 'amr-01', displayName: 'AMR 01', connectionStatus: 'CONNECTED', assignedMapKey: 'library-v1', assignedFrameId: 'map', assignedAreaName: 'Library',
  assignedVersionNumber: 1, latestDeployedMapKey: 'library-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true, needsInspection: false,
  currentTourName: null, currentTourState: null, lastSeenAt: '2026-11-05T08:00:00Z', telemetryFresh: true,
  pose: { x: 1.5, y: 2.25, yaw: 0.5, capturedAt: '2026-11-05T08:00:00Z' }, batteryPercent: 82, operationalStatus: 'IDLE', localized: true, motionReady: true,
  faultCode: null, lastDiagnosticsReceivedAt: '2026-11-05T08:00:00Z', diagnosticsFresh: true,
  miniPc: { cpuPercent: 37, cpuTemperatureCelsius: null, memory: { totalBytes: 8 * 1024 ** 3, availableBytes: 4 * 1024 ** 3, usedBytes: 4 * 1024 ** 3, usedPercent: 50 }, gpu: { supported: false, utilizationPercent: null, temperatureCelsius: null, memoryUsedPercent: null, modelName: null }, disk: null },
  ros2: { middlewareStatus: 'OK', nodes: [{ nodeName: '/amcl', state: 'ACTIVE', rateHz: 10 }], tfValid: true, nav2State: 'IDLE' },
  sensors: {
    lidar: { status: 'OK', message: null, rateHz: 10, lastValidAt: '2026-11-05T08:00:00Z' },
    imu: { status: 'OK', message: null, yawValid: true, firmwareRearmCount: 0, firmwareResetSeenCount: 0, outages: 0, lastValidAt: '2026-11-05T08:00:00Z' },
    odometry: { status: 'OK', message: null, rateHz: 20, lastValidAt: '2026-11-05T08:00:00Z' },
    depthCamera: { status: 'NOT_EQUIPPED', message: null, rateHz: null, lastValidAt: null },
  },
  ...overrides,
})

let dashboard: TechnicalDashboard
let detail: RobotDiagnosticsDetail
let requested: string[] = []

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })

function renderAt(page: React.ReactNode, path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{page}</MemoryRouter></QueryClientProvider>)
}

describe('diagnostics status mapping', () => {
  it('keeps "no report", "old report" and "live report" apart', () => {
    expect(sourceState(false, false)).toBe('UNAVAILABLE')
    expect(sourceState(true, false)).toBe('STALE')
    expect(sourceState(true, true)).toBe('LIVE')
  })

  it('labels offline, unknown and not-applicable readings in plain Vietnamese', () => {
    expect(connectionStatusView('DISCONNECTED')).toEqual({ label: 'Ngoại tuyến', tone: 'danger' })
    expect(connectionStatusView('SOMETHING_NEW').label).toBe('Không xác định')
    expect(sensorStatusView('NOT_EQUIPPED')).toEqual({ label: 'Không trang bị', tone: 'muted' })
    expect(sensorStatusView(null).label).toBe('Không xác định')
    expect(reading(null, '%')).toBe('Không đo được')
    expect(reading(37.4, '%')).toBe('37%')
  })
})

describe('Technical dashboard and Mini PC monitoring', () => {
  beforeEach(() => {
    requested = []
    useAuthStore.setState({ accessToken: 'token.test', isAuthenticated: true, isAuthReady: true, user: { userId: 'tech', username: 'tech', role: 'TechnicalStaff' } })
    dashboard = dashboardFixture([robotSummary()])
    detail = detailFixture()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      requested.push(url.pathname)
      if (url.pathname === '/api/technical/dashboard') return ok(dashboard)
      if (url.pathname.startsWith('/api/technical/robots/') && url.pathname.endsWith('/diagnostics')) return ok(detail)
      return new Response(null, { status: 404 })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('shows KPIs, action items and fresh Mini PC readings from the dashboard API', async () => {
    renderAt(<TechnicalDashboardPage />, '/technical/dashboard')
    expect(await screen.findByText('1/1')).toBeInTheDocument()
    expect(screen.getByText('2 POI đang chờ kiểm chứng kỹ thuật')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mở' })).toHaveAttribute('href', '/technical/poi-import')
    const table = within(screen.getByRole('region', { name: 'Robot và Mini PC' }))
    expect(table.getByText('CPU 37% · 61 °C')).toBeInTheDocument()
    expect(table.getByText('Trực tuyến')).toBeInTheDocument()
    expect(table.getByRole('link', { name: 'Giám sát amr-01' })).toHaveAttribute('href', '/technical/monitoring?robot=amr-01')
    expect(requested).toContain('/api/technical/dashboard')
  })

  it('never prints stale or missing Mini PC numbers as current', async () => {
    dashboard = dashboardFixture([
      robotSummary({ id: 'r-stale', robotCode: 'amr-stale', displayName: null, diagnosticsFresh: false, cpuPercent: 99 }),
      robotSummary({ id: 'r-none', robotCode: 'amr-none', displayName: null, connectionStatus: 'DISCONNECTED', syncFresh: false, hasDiagnostics: false, diagnosticsFresh: false, cpuPercent: null, cpuTemperatureCelsius: null }),
    ])
    renderAt(<TechnicalDashboardPage />, '/technical/dashboard')
    const table = within(await screen.findByRole('region', { name: 'Robot và Mini PC' }))
    expect(await table.findByText('Dữ liệu cũ')).toBeInTheDocument()
    expect(table.getByText('Chưa có dữ liệu')).toBeInTheDocument()
    expect(table.getByText('Ngoại tuyến')).toBeInTheDocument()
    expect(table.queryByText(/CPU 99%/)).not.toBeInTheDocument()
    expect(table.getByText('(cũ)')).toBeInTheDocument()
  })

  it('lists warnings above routine work and states every fleet connection count', async () => {
    dashboard = {
      ...dashboardFixture([robotSummary()]),
      actionItems: [
        { type: 'POI_QUEUE', severity: 'INFO', title: '2 POI đang chờ', description: 'POI mới.', targetId: null, linkUrl: '/technical/poi-import' },
        { type: 'ROUTE_RERUN', severity: 'WARNING', title: '1 tuyến cần chạy lại', description: 'Cần ghi lần chạy mới.', targetId: null, linkUrl: '/technical/confirmations' },
      ],
    }
    renderAt(<TechnicalDashboardPage />, '/technical/dashboard')
    const rows = within(await screen.findByRole('region', { name: 'Việc cần xử lý' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('1 tuyến cần chạy lại')
    expect(within(rows[0]).getByText('Cảnh báo')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('2 POI đang chờ')
    expect(within(screen.getByRole('region', { name: 'Tình trạng robot' })).getByRole('img', { name: 'Trực tuyến: 1, Ngoại tuyến: 0, Chưa nhận dữ liệu: 0, Chưa xác nhận kết nối: 0' })).toBeInTheDocument()
  })

  it('shows one robot\'s live diagnostics with unknown and not-applicable readings labelled', async () => {
    renderAt(<TechnicalMonitoringPage />, '/technical/monitoring?robot=amr-01')
    const resources = within(await screen.findByRole('region', { name: 'Tài nguyên Mini PC' }))
    expect(resources.getByText('Đang cập nhật')).toBeInTheDocument()
    expect(resources.getByText('37%')).toBeInTheDocument()
    expect(resources.getAllByText('Không đo được').length).toBeGreaterThanOrEqual(2) // temperature and disk
    expect(resources.getByText(/Không áp dụng/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Cảm biến' })).getByText('Không trang bị')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'ROS 2' })).getByText('/amcl')).toBeInTheDocument()
    expect(requested).toContain('/api/technical/robots/amr-01/diagnostics')
  })

  it('says no Mini PC report has arrived instead of showing empty readings', async () => {
    detail = detailFixture({ lastDiagnosticsReceivedAt: null, diagnosticsFresh: false, miniPc: null, ros2: null, sensors: null })
    renderAt(<TechnicalMonitoringPage />, '/technical/monitoring?robot=amr-01')
    expect(await screen.findByText(/Backend chưa nhận báo cáo chẩn đoán nào từ Mini PC/)).toBeInTheDocument()
    for (const name of ['Tài nguyên Mini PC', 'Cảm biến', 'ROS 2']) {
      const panel = within(screen.getByRole('region', { name }))
      expect(panel.getByText('Chưa có dữ liệu', { selector: 'span' })).toBeInTheDocument()
      expect(panel.getByText('Chưa có dữ liệu.')).toBeInTheDocument()
    }
  })

  it('marks a stale diagnostics report as last known, not current', async () => {
    detail = detailFixture({ diagnosticsFresh: false })
    renderAt(<TechnicalMonitoringPage />, '/technical/monitoring?robot=amr-01')
    expect(await screen.findByText(/không phải trạng thái hiện tại/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Tài nguyên Mini PC' })).getByText('Dữ liệu cũ')).toBeInTheDocument()
  })

  it('opens the first robot when no robot is named', async () => {
    renderAt(<TechnicalMonitoringPage />, '/technical/monitoring')
    expect(await screen.findByRole('region', { name: 'Tài nguyên Mini PC' })).toBeInTheDocument()
    expect(requested).toContain('/api/technical/robots/amr-01/diagnostics')
  })
})
