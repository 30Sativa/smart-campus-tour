import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import TechnicalPoisPage from '../../routes/technical/TechnicalPoisPage'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import { useAuthStore } from '../../stores/auth-store'
import type { PhysicalRobotOption } from './api/technical'

// Round 4 (24/11): amr_01 is ready on Betea · v1, the POI "test" and the route wait on Tầng 6 · tang-6 · v1. The strip
// above the robot dialogs said "Robot đã sẵn sàng" for the POI while the robot was ready on the other map.
const map = (id: string, areaKey: string, areaName: string, mapKey: string) => ({
  id, areaKey, areaName, versionNumber: 1, mapKey, packageFileName: `${areaKey}.zip`, packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-11-24T08:00:00Z',
})
const tang6 = map('map-tang6', 'tang-6', 'Tầng 6', 'tang-6-v1')
const test123 = map('map-test123', 'test123', 'Tầng 6', 'test123-v1')
const betea = map('map-betea', 'betea', 'Betea', 'betea-v1')
const mapItem = (m: typeof tang6) => ({ map: m, runningRobot: null, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: null, currentlyDeployedOn: [] })
const robotReadyOn = (mapVersionId: string, areaName: string, mapKey: string): PhysicalRobotOption => ({
  id: 'robot-1', robotCode: 'amr_01', displayName: 'Robot tham quan', firstAcceptedSyncAt: '2026-11-20T08:00:00Z', firstAcceptedMapKey: mapKey, firstAcceptedFrameId: 'map',
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-11-24T09:05:00Z', rowVersion: 'AAAAAAAAAAA=',
  assignedMapVersionId: mapVersionId, assignedAreaName: areaName, assignedVersionNumber: 1, assignedMapKey: mapKey, assignedFrameId: 'map', mapAssignedAt: '2026-11-20T08:00:00Z', mapAssignedByName: 'Technical',
  latestDeployedMapKey: mapKey, latestDeployedFrameId: 'map', latestDeploymentPassed: true,
  needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: false,
  readiness: { state: 'READY', reasonCode: null, reason: null, mapVersionId, mapLabel: `${areaName} · v1`, deploymentCheckedAt: '2026-11-24T09:00:00Z', reportingOnAssignedMap: true, nextStep: null, detail: null },
})
const readyOnBetea = robotReadyOn('map-betea', 'Betea', 'betea-v1')
const readyOnTang6 = robotReadyOn('map-tang6', 'Tầng 6', 'tang-6-v1')
const revision = { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-tang6', mapKey: 'tang-6-v1', name: 'test', purpose: 'Sảnh', description: null, x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-11-24T08:00:00Z', isSubmitted: true, submittedAt: '2026-11-24T08:01:00Z', navigationStatus: 'NOT_CHECKED' }
const route = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 1, name: 'Tuyến tầng 6', mapVersionId: 'map-tang6', mapKey: 'tang-6-v1', stops: [{}, {}], dwellDurationSeconds: 60, expectedDurationSeconds: 300, verificationStatus: 'NOT_TESTED', isSubmitted: true, testRuns: [], effectiveTestRunId: null, revisionHistory: [] }
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let robots: PhysicalRobotOption[] = []

function api(url: URL) {
  switch (url.pathname) {
    case '/api/maps/versions': return ok([mapItem(tang6), mapItem(test123), mapItem(betea)])
    case '/api/technical/map-areas': return ok([{ areaKey: 'tang-6', displayName: 'Tầng 6' }, { areaKey: 'test123', displayName: 'Tầng 6' }, { areaKey: 'betea', displayName: 'Betea' }])
    case '/api/technical/physical-robots': return ok(robots)
    case '/api/technical/poi-verifications': return ok([{ proposalId: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=', revision }])
    case '/api/technical/route-verifications/queue': return ok([route])
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
      <Route path="/technical/robots" element={<TechnicalRobotsPage />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>)
}

const poiBack = encodeURIComponent('/technical/pois?poi=proposal-1')
const routeBack = encodeURIComponent('/technical/route-tests?route=rev-1')
const setupDialog = async () => within(await screen.findByRole('dialog', { name: 'Robot tham quan' }))

describe('the way back says ready only on the map of the POI or route', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => api(new URL(String(input), 'http://localhost'))))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('from the POI form to the map dialog: ready on Betea is not ready for a POI on tang-6', async () => {
    robots = [readyOnBetea]
    renderAt('/technical/pois')
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Gán robot cho bản đồ này' }))
    const picker = within(await screen.findByRole('dialog', { name: 'Triển khai Tầng 6 · tang-6 · v1 cho robot' }))
    await picker.findByRole('option', { name: /amr_01/ })
    fireEvent.change(picker.getByLabelText('Robot'), { target: { value: 'robot-1' } })
    fireEvent.click(picker.getByRole('button', { name: 'Tiếp tục' }))
    expect(screen.getByTestId('location')).toHaveTextContent(`/technical/robots?robot=robot-1&map=map-tang6&returnTo=${poiBack}`)

    const strip = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr_01' })).getByRole('note', { name: 'Quay lại' })
    expect(await within(strip).findByText(/chưa phải bản đồ của POI này/)).toHaveTextContent('Đang chuẩn bị amr_01 để kiểm chứng POI test (Tầng 6 · tang-6 · v1). amr_01 hiện sẵn sàng trên Betea · v1, chưa phải bản đồ của POI này. ·')
    expect(strip).not.toHaveTextContent('Robot đã sẵn sàng')
    expect(within(strip).getByRole('link', { name: 'Quay lại POI' })).toHaveAttribute('href', '/technical/pois?poi=proposal-1')
  })

  it('keeps the green button when the robot is ready on the POI map', async () => {
    robots = [readyOnTang6]
    renderAt(`/technical/robots?robot=robot-1&returnTo=${poiBack}`)
    const dialog = await setupDialog()
    expect(await dialog.findByRole('link', { name: 'Robot đã sẵn sàng · Quay lại kiểm chứng POI test' })).toHaveAttribute('href', '/technical/pois?poi=proposal-1')
    expect(dialog.getByRole('note', { name: 'Quay lại' })).toHaveClass('bg-[#f0fdf4]')
  })

  it('says the same for a route test on another map', async () => {
    robots = [readyOnBetea]
    renderAt(`/technical/robots?robot=robot-1&returnTo=${routeBack}`)
    const strip = within((await setupDialog()).getByRole('note', { name: 'Quay lại' }))
    expect(await strip.findByText('Đang chuẩn bị amr_01 để chạy thử tuyến Tuyến tầng 6 (Tầng 6 · tang-6 · v1). amr_01 hiện sẵn sàng trên Betea · v1, chưa phải bản đồ của tuyến này. ·')).toBeInTheDocument()
    expect(strip.queryByText(/Robot đã sẵn sàng/)).not.toBeInTheDocument()
    expect(strip.getByRole('link', { name: 'Quay lại tuyến' })).toHaveAttribute('href', '/technical/route-tests?route=rev-1')
  })

  it('keeps the green button for a route on the map the robot is ready on', async () => {
    robots = [readyOnTang6]
    renderAt(`/technical/robots?robot=robot-1&returnTo=${routeBack}`)
    expect(await (await setupDialog()).findByRole('link', { name: 'Robot đã sẵn sàng · Quay lại chạy thử tuyến Tuyến tầng 6' })).toHaveAttribute('href', '/technical/route-tests?route=rev-1')
  })

  it('stays neutral when the POI is no longer found, even for a ready robot', async () => {
    robots = [readyOnTang6]
    renderAt(`/technical/robots?robot=robot-1&returnTo=${encodeURIComponent('/technical/pois?poi=deleted-1')}`)
    const dialog = await setupDialog()
    const strip = dialog.getByRole('note', { name: 'Quay lại' })
    // The POI lists load after the dialog; wait for them so "not found" is not just "not loaded yet".
    const requested = () => vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname)
    await waitFor(() => expect(requested()).toEqual(expect.arrayContaining(['/api/technical/poi-verifications', '/api/staff/poi-proposals'])))
    await act(() => new Promise(resolve => setTimeout(resolve, 20)))
    expect(strip).toHaveTextContent('Đang chuẩn bị robot · Quay lại')
    expect(strip).toHaveClass('bg-[#eff6ff]')
    expect(within(strip).getByRole('link', { name: 'Quay lại' })).toHaveAttribute('href', '/technical/pois?poi=deleted-1')
  })
})
