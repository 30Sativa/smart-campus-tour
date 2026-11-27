import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import TechnicalPoisPage from '../../routes/technical/TechnicalPoisPage'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import TechnicalRouteTestsPage from '../../routes/technical/TechnicalRouteTestsPage'
import { useAuthStore } from '../../stores/auth-store'
import type { PhysicalRobotOption } from './api/technical'
import { robotSetupPath } from './robot-readiness'
import { returnTarget, technicalReturnPath } from './technical-nav'

// Round 3 (23/11): from the POI check to preparing the robot and back, without losing the POI. amr_01 was moved to
// Tầng 6 · tang-6 · v1 while its MiniPC still sent test123-v1, the other "Tầng 6".
const map = (id: string, areaKey: string, mapKey: string) => ({
  id, areaKey, areaName: 'Tầng 6', versionNumber: 1, mapKey, packageFileName: `${areaKey}.zip`, packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-11-23T08:00:00Z',
})
const tang6 = map('map-tang6', 'tang-6', 'tang-6-v1')
const test123 = map('map-test123', 'test123', 'test123-v1')
const mapItem = (m: typeof tang6) => ({ map: m, runningRobot: null, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: null, currentlyDeployedOn: [] })
const baseRobot: PhysicalRobotOption = {
  id: 'robot-1', robotCode: 'amr_01', displayName: 'Robot tham quan tầng 6', firstAcceptedSyncAt: '2026-11-20T08:00:00Z', firstAcceptedMapKey: 'test123-v1', firstAcceptedFrameId: 'map',
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-11-23T09:05:00Z', rowVersion: 'AAAAAAAAAAA=',
  assignedMapVersionId: 'map-test123', assignedAreaName: 'Tầng 6', assignedVersionNumber: 1, assignedMapKey: 'test123-v1', assignedFrameId: 'map', mapAssignedAt: '2026-11-20T08:00:00Z', mapAssignedByName: 'Technical',
  latestDeployedMapKey: 'betea-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true,
  needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: false,
  readiness: { state: 'NOT_READY', reasonCode: 'ROBOT_DEPLOYMENT_CHECK_REQUIRED', reason: 'Robot amr_01 chưa kiểm tra triển khai trên Tầng 6 · test123 · phiên bản 1.', mapVersionId: 'map-test123', mapLabel: 'Tầng 6 · v1', deploymentCheckedAt: null, reportingOnAssignedMap: true, nextStep: 'DEPLOYMENT_CHECK', detail: null },
}
/** amr_01 after 16:06: holds tang-6, its MiniPC still sends test123-v1. */
const wrongMapRobot: PhysicalRobotOption = {
  ...baseRobot, connectionStatus: 'WRONG_MAP', assignedMapVersionId: 'map-tang6', assignedMapKey: 'tang-6-v1', mapAssignedAt: '2026-11-23T09:06:00Z',
  lastRejectedReport: { mapKey: 'test123-v1', frameId: 'map', at: '2026-11-23T09:20:00Z', message: 'Robot đang gửi dữ liệu theo test123-v1, bị từ chối vì đang gán tang-6-v1. Đổi MapKey/FrameId trên MiniPC.' },
  readiness: { ...baseRobot.readiness, mapVersionId: 'map-tang6', reason: 'Robot amr_01 chưa kiểm tra triển khai trên Tầng 6 · tang-6 · phiên bản 1 (gán lúc 23/11 16:06).',
    detail: 'Lần kiểm tra triển khai mới nhất của robot amr_01 là trên Betea · betea · phiên bản 1.', reportingOnAssignedMap: false, nextStep: 'CONFIGURE_MINIPC' },
}
const readyRobot: PhysicalRobotOption = {
  ...wrongMapRobot, connectionStatus: 'CONNECTED', lastRejectedReport: null, latestDeployedMapKey: 'tang-6-v1',
  readiness: { ...wrongMapRobot.readiness, state: 'READY', reasonCode: null, reason: null, detail: null, reportingOnAssignedMap: true, nextStep: null, deploymentCheckedAt: '2026-11-23T09:30:00Z' },
}
const revision = { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-tang6', mapKey: 'tang-6-v1', name: 'test', purpose: 'Sảnh', description: null, x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-11-23T08:00:00Z', isSubmitted: true, submittedAt: '2026-11-23T08:01:00Z', navigationStatus: 'NOT_CHECKED' }
const route = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 1, name: 'Tuyến tầng 6', mapVersionId: 'map-tang6', mapKey: 'tang-6-v1', stops: [{}, {}], dwellDurationSeconds: 60, expectedDurationSeconds: 300, verificationStatus: 'NOT_TESTED', isSubmitted: true, testRuns: [], effectiveTestRunId: null, revisionHistory: [] }
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let robots: PhysicalRobotOption[] = []

function api(url: URL) {
  switch (url.pathname) {
    case '/api/maps/versions': return ok([mapItem(tang6), mapItem(test123)])
    case '/api/technical/map-areas': return ok([{ areaKey: 'tang-6', displayName: 'Tầng 6' }, { areaKey: 'test123', displayName: 'Tầng 6' }])
    case '/api/technical/physical-robots': return ok(robots)
    case '/api/technical/poi-verifications': return ok([{ proposalId: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=', revision }])
    case '/api/technical/poi-proposals': return ok([])
    case '/api/technical/route-verifications/queue': return ok([route])
    case '/api/technical/route-verifications/participants': return ok([])
    case '/api/robots/amr_01/credential': return ok({ robotCode: 'amr_01', status: 'ACTIVE', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: 'ab12', revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] })
    default: return ok([])
  }
}

function Where() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderAt(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>
    <Where />
    <Routes>
      <Route path="/technical/pois" element={<TechnicalPoisPage />} />
      <Route path="/technical/route-tests" element={<TechnicalRouteTestsPage />} />
      <Route path="/technical/robots" element={<TechnicalRobotsPage />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>)
}

const poiBack = encodeURIComponent('/technical/pois?poi=proposal-1')

describe('returnTo stays inside the Technical area', () => {
  it('keeps a Technical path and refuses an external, other-area or escaping one', () => {
    expect(technicalReturnPath('/technical/pois?poi=p-1')).toBe('/technical/pois?poi=p-1')
    for (const path of ['https://evil.test/technical/pois', '//evil.test/technical/pois', '/admin/accounts', '/staff', '/technical/../admin', '/technical/\\evil', 'javascript:alert(1)', '', null])
      expect(technicalReturnPath(path)).toBeNull()
    expect(robotSetupPath('r-1', undefined, '/admin/accounts')).toBe('/technical/robots?robot=r-1')
    expect(robotSetupPath('r-1', 'm-1', 'https://evil.test/')).toBe('/technical/robots?robot=r-1&map=m-1')
    expect(robotSetupPath('r-1', undefined, '/technical/route-tests?route=rev-1')).toBe(`/technical/robots?robot=r-1&returnTo=${encodeURIComponent('/technical/route-tests?route=rev-1')}`)
    expect(returnTarget('/technical/pois?poi=p-1')).toEqual({ kind: 'poi', id: 'p-1' })
    expect(returnTarget('/technical/route-tests?route=rev-1')).toEqual({ kind: 'route', id: 'rev-1' })
    expect(returnTarget('/technical/maps')).toBeNull()
  })
})

describe('preparing a robot from a POI check and coming back', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => api(new URL(String(input), 'http://localhost'))))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('names the robot running the other area of the same name when none runs the POI map', async () => {
    robots = [baseRobot]
    renderAt('/technical/pois')
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    expect(await screen.findByText('amr_01 đang chạy Tầng 6 · test123 · v1, khác bản đồ của POI này (Tầng 6 · tang-6 · v1).')).toBeInTheDocument()
    expect(screen.getByText('Robot sẽ rời bản đồ đang chạy, Tour trên bản đồ đó không chạy được với robot này, điều phối tự tắt.')).toBeInTheDocument()
    expect(screen.getByText('Nếu POI đặt nhầm bản đồ, nhờ Staff xoá POI và tạo lại trên bản đồ robot đang chạy.')).toBeInTheDocument()
  })

  it('reopens the POI check when the robot picker is cancelled, and carries returnTo on Tiếp tục', async () => {
    robots = [baseRobot]
    renderAt('/technical/pois')
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gán robot cho bản đồ này' }))
    const picker = within(await screen.findByRole('dialog', { name: 'Gán Tầng 6 · tang-6 · v1 cho robot' }))
    fireEvent.click(picker.getByRole('button', { name: 'Hủy' }))
    expect(await screen.findByRole('dialog', { name: 'Kiểm chứng test' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Gán robot cho bản đồ này' }))
    const again = within(await screen.findByRole('dialog', { name: 'Gán Tầng 6 · tang-6 · v1 cho robot' }))
    // The robot on the other "Tầng 6" is the one to move, so it starts chosen.
    await again.findByRole('option', { name: /amr_01/ })
    expect(again.getByLabelText('Robot')).toHaveValue('robot-1')
    fireEvent.click(again.getByRole('button', { name: 'Tiếp tục' }))
    expect(screen.getByTestId('location')).toHaveTextContent(`/technical/robots?robot=robot-1&map=map-tang6&returnTo=${poiBack}`)
    expect(within(await screen.findByRole('dialog', { name: 'Bản đồ của amr_01' })).getByRole('note', { name: 'Quay lại' })).toHaveTextContent('Đang chuẩn bị robot để kiểm chứng POI test · Quay lại POI')
  })

  it('shows the way back on the robot setup, and the main button once the robot is ready reopens the POI check', async () => {
    robots = [wrongMapRobot]
    const view = renderAt(`/technical/robots?robot=robot-1&returnTo=${poiBack}`)
    const dialog = within(await screen.findByRole('dialog', { name: 'Robot tham quan tầng 6' }))
    expect(await dialog.findByRole('note', { name: 'Quay lại' })).toHaveTextContent('Đang chuẩn bị robot để kiểm chứng POI test · Quay lại POI')
    expect(dialog.getByRole('link', { name: 'Quay lại POI' })).toHaveAttribute('href', '/technical/pois?poi=proposal-1')
    // W3: the server's main sentence, the history small below it, and the MiniPC step as the next thing to do.
    const status = within(dialog.getByRole('region', { name: 'Trạng thái sẵn sàng' }))
    expect(status.getByText('Robot amr_01 chưa kiểm tra triển khai trên Tầng 6 · tang-6 · phiên bản 1 (gán lúc 23/11 16:06).')).toBeInTheDocument()
    expect(status.getByText('Lần kiểm tra triển khai mới nhất của robot amr_01 là trên Betea · betea · phiên bản 1.')).toHaveClass('text-xs')
    expect(status.getByRole('button', { name: 'Cấu hình MiniPC' })).toBeInTheDocument()
    expect(status.queryByRole('button', { name: 'Kiểm tra triển khai' })).not.toBeInTheDocument()
    expect(within(dialog.getByRole('region', { name: 'Cấu hình MiniPC' })).getByRole('status')).toHaveTextContent('Robot đang gửi dữ liệu theo test123-v1, bị từ chối vì đang gán tang-6-v1. Đổi MapKey/FrameId trên MiniPC.')
    view.unmount()

    robots = [readyRobot]
    renderAt(`/technical/robots?robot=robot-1&returnTo=${poiBack}`)
    const back = await screen.findByRole('link', { name: 'Robot đã sẵn sàng · Quay lại kiểm chứng POI test' })
    fireEvent.click(back)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/technical\/pois$/)
    const form = within(await screen.findByRole('dialog', { name: 'Kiểm chứng test' }))
    expect(await form.findByText(/sẵn sàng trên Tầng 6 · tang-6 · v1/)).toBeInTheDocument()
  })

  it('drops returnTo from the URL when the dialog closes, and ignores one outside the Technical area', async () => {
    robots = [wrongMapRobot]
    const view = renderAt(`/technical/robots?robot=robot-1&returnTo=${poiBack}`)
    const dialog = within(await screen.findByRole('dialog', { name: 'Robot tham quan tầng 6' }))
    expect(await dialog.findByRole('note', { name: 'Quay lại' })).toHaveTextContent('Đang chuẩn bị robot để kiểm chứng POI test · Quay lại POI')
    fireEvent.click(dialog.getAllByRole('button', { name: 'Đóng' }).at(-1)!)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/technical\/robots$/)
    view.unmount()

    renderAt(`/technical/robots?robot=robot-1&returnTo=${encodeURIComponent('https://evil.test/technical/pois')}`)
    await screen.findByRole('dialog', { name: 'Robot tham quan tầng 6' })
    expect(screen.queryByRole('note', { name: 'Quay lại' })).not.toBeInTheDocument()
  })

  it('reopens the route test from ?route= and clears it', async () => {
    robots = [readyRobot]
    renderAt('/technical/route-tests?route=rev-1')
    expect(await screen.findByRole('dialog', { name: 'Chạy thử Tuyến tầng 6' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/technical\/route-tests$/)
  })

  it('says Sai bản đồ, not Mất kết nối, for a robot whose reports name another map', async () => {
    robots = [wrongMapRobot]
    renderAt('/technical/robots')
    const row = within((await screen.findByText('Robot tham quan tầng 6')).closest('tr')!)
    expect(row.getByText('Sai bản đồ')).toBeInTheDocument()
    expect(row.getByText('Robot đang gửi dữ liệu theo test123-v1, bị từ chối vì đang gán tang-6-v1. Đổi MapKey/FrameId trên MiniPC.')).toBeInTheDocument()
    expect(row.queryByText(/Mất kết nối/)).not.toBeInTheDocument()
  })
})
