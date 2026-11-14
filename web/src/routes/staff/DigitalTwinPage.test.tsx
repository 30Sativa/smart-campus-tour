import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fleetKey, type FleetRobot, type FleetSnapshot } from '../../features/staff/operations/fleet-telemetry'
import { useAuthStore } from '../../stores/auth-store'
import DigitalTwinPage from './DigitalTwinPage'

// WebGL is checked in a browser; here the scene only says what it was given.
type SceneRobot = { id: string; name: string; synthetic?: boolean; stale: boolean; labelNote?: string; focused: boolean }
vi.mock('../../features/digital-twin/TwinScene', () => ({
  default: ({ robots, focus, route }: { robots: SceneRobot[]; focus?: { position: number[] } | null; route?: { stops: { name: string }[]; targetIndex: number | null } | null }) =>
    <div data-testid="scene">
      <span data-testid="scene-robots">{robots.map(robot => `${robot.name}${robot.synthetic ? '(sim)' : ''}${robot.stale ? `[${robot.labelNote}]` : ''}${robot.focused ? '*' : ''}`).join(',')}</span>
      <span data-testid="scene-focus">{focus ? 'focus' : 'none'}</span>
      <span data-testid="scene-route">{route ? `${route.stops.map(stop => stop.name).join('>')} @${route.targetIndex}` : 'no route'}</span>
    </div>,
}))

const robot = (patch: Partial<FleetRobot> = {}): FleetRobot => ({
  id: 'amr_01', name: 'AMR 01', connectionState: 'Live', batteryPercent: 80, lastSeenAt: new Date().toISOString(),
  telemetryAgeSeconds: 0, source: 'Physical', pose: { x: -0.319, y: -0.535, yaw: 0, capturedAt: new Date().toISOString() },
  poseAgeSeconds: 0.5, localized: true, motionReady: true, syncFresh: true, poseFresh: true, executionStatus: 'IDLE',
  mapKey: 'map2-v2', frameId: 'map', legId: null, faultCode: null, needsCheck: false, ...patch,
})

const RUNNING = {
  id: 'tour-run', name: 'Tour sáng', description: null, routeId: 'r', routeName: 'Tuyến', activeRouteId: 'r', scheduledStartAt: '2026-11-15T02:00:00Z',
  state: 'RUNNING', createdByUserId: 'u', createdAt: '2026-11-01T00:00:00Z', updatedAt: null, rowVersion: 'v', registrationCount: 1, invitationCount: 1, routeRevisionId: 'rev',
  reservation: { robotCode: 'amr_02', startsAt: '2026-11-15T01:45:00Z', endsAt: '2026-11-15T03:00:00Z', measuredDurationSeconds: 600, expectedDurationSeconds: 900, releasedAt: null },
  execution: { operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', commandState: 'ACCEPTED', needsReconcile: false },
}
const DETAIL = {
  tour: RUNNING, reservation: RUNNING.reservation,
  execution: { currentRevisionStopId: 'stop-2', currentStep: 'NAVIGATING', operationalStatus: 'NORMAL' },
  routeRevision: { revisionId: 'rev', mapVersionId: 'mv', mapKey: 'map2-v2', startX: 0, startY: 0, endMode: 'LAST_POI', endX: null, endY: null, stops: [
    { id: 'stop-1', stopOrder: 1, name: 'Sảnh', poiRevisionId: 'p1', x: 0, y: 0, yaw: 0, dwellSeconds: 30 },
    { id: 'stop-2', stopOrder: 2, name: 'Phòng Lab', poiRevisionId: 'p2', x: 1, y: 1, yaw: 0, dwellSeconds: 30 },
  ] },
}

let running: unknown[] = []
function renderAt(path: string, robots: FleetRobot[] | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (robots) client.setQueryData<FleetSnapshot>(fleetKey, { robots, receivedAt: Date.now() })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/digital-twin" element={<DigitalTwinPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
const simSwitch = () => screen.getByRole('switch', { name: 'Robot mô phỏng' })

beforeEach(() => {
  running = []
  useAuthStore.getState().setAuth('test-token', { userId: 'u', username: 'staff', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const json = (data: unknown, extra = {}) => new Response(JSON.stringify({ success: true, data, ...extra }), { status: 200 })
    if (url.pathname === '/api/staff/manage/tours') {
      const rows = url.searchParams.get('phase') === 'RUNNING' ? running : []
      return json(rows, { pagination: { page: 1, pageSize: 20, totalItems: rows.length, totalPages: 1 } })
    }
    if (url.pathname === '/api/staff/manage/tours/tour-run') return json(DETAIL)
    return new Response(JSON.stringify({ success: false }), { status: 404 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('Digital Twin page', () => {
  it('shows only the real robot by default, with the simulation off and the camera on it', async () => {
    renderAt('/staff/digital-twin', [robot()])
    expect(screen.getByRole('heading', { name: 'Digital Twin', level: 1 })).toBeInTheDocument()
    expect(simSwitch()).not.toBeChecked()
    expect(await screen.findByTestId('scene-robots')).toHaveTextContent(/^amr_01\*$/)
    expect(screen.getByTestId('scene-focus')).toHaveTextContent('focus')
    expect(screen.getByTestId('fleet-summary')).toHaveTextContent('1 robot thật · amr_01 đang chờ')
    expect(screen.queryByText(/6 robot · Chưa kết nối miniPC/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Mô phỏng \(/)).not.toBeInTheDocument()
    // Traffic and density exist only with the simulation.
    expect(screen.getByRole('button', { name: 'Giao thông' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mật độ di chuyển' })).toBeDisabled()
  })

  it('never counts simulated robots: S1–S6 are dimmed extras, not real robots', async () => {
    renderAt('/staff/digital-twin', [robot()])
    fireEvent.click(simSwitch())
    const scene = await screen.findByTestId('scene-robots')
    expect(scene).toHaveTextContent('amr_01*,S1(sim),S2(sim),S3(sim),S4(sim),S5(sim),S6(sim)')
    expect(screen.getByTestId('fleet-summary')).toHaveTextContent(/^1 robot thật · amr_01 đang chờ$/)
    expect(screen.getByRole('heading', { name: 'Robot thật (1)' })).toBeInTheDocument()
    expect(screen.getByText('Mô phỏng (6)')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('dữ liệu mô phỏng, không phải robot thật')
    expect(screen.getByRole('button', { name: 'Mật độ di chuyển' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Mật độ di chuyển' }))
    expect(screen.getByRole('note')).toHaveTextContent('Mật độ di chuyển tính từ dữ liệu mô phỏng')
  })

  it('offers the simulation when no real robot has ever sent a pose', async () => {
    renderAt('/staff/digital-twin', [robot({ pose: null, poseAgeSeconds: null })])
    expect(screen.getByText('Chưa có robot thật nào gửi vị trí')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bật mô phỏng để xem demo' }))
    expect(simSwitch()).toBeChecked()
    expect(screen.queryByText('Chưa có robot thật nào gửi vị trí')).not.toBeInTheDocument()
    expect(await screen.findByTestId('scene-robots')).toHaveTextContent('S1(sim)')
  })

  it('locks the simulation off while a Tour is RUNNING, and draws that robot’s route', async () => {
    running = [RUNNING]
    renderAt('/staff/digital-twin?robot=amr_02', [robot(), robot({ id: 'amr_02', executionStatus: 'NAVIGATING' })])
    expect(await screen.findByText('Đang có Tour chạy, đã tắt mô phỏng')).toBeInTheDocument()
    expect(simSwitch()).toBeDisabled()
    expect(simSwitch()).not.toBeChecked()
    expect(await screen.findByTestId('scene-route')).toHaveTextContent('Sảnh>Phòng Lab @1')
    const card = screen.getByRole('listitem', { name: 'Robot amr_02' })
    expect(within(card).getByRole('link', { name: 'Tour sáng' })).toHaveAttribute('href', '/staff/live/tour-run')
    expect(within(card).getByText('2. Phòng Lab')).toBeInTheDocument()
    expect(screen.getByTestId('fleet-summary')).toHaveTextContent('2 robot thật · amr_01 đang chờ · amr_02 đang chạy')
  })

  it('reads ?robot= to choose the robot in view', async () => {
    renderAt('/staff/digital-twin?robot=AMR_02', [robot({ poseAgeSeconds: 0.1 }), robot({ id: 'amr_02', poseAgeSeconds: 1 })])
    expect(await screen.findByTestId('scene-robots')).toHaveTextContent('amr_01,amr_02*')
  })

  it('greys a stale robot and says how old its data is', async () => {
    renderAt('/staff/digital-twin', [robot({ poseAgeSeconds: 125 })])
    expect(await screen.findByTestId('scene-robots')).toHaveTextContent('amr_01[dữ liệu cũ, 2 phút trước]')
    expect(screen.getByTestId('fleet-summary')).toHaveTextContent('1 robot thật · amr_01 dữ liệu cũ')
  })

  it('names every icon-only button with a title and a label', () => {
    renderAt('/staff/digital-twin', [robot()])
    for (const name of ['Nhìn từ trên', 'Toàn màn hình', 'Hiện tên điểm dừng']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('title', name)
    }
  })
})
