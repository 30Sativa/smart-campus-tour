import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import TechnicalPoisPage from '../../routes/technical/TechnicalPoisPage'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import TechnicalRouteTestsPage from '../../routes/technical/TechnicalRouteTestsPage'
import { useAuthStore } from '../../stores/auth-store'

// W1 (23/11): "Gán robot cho bản đồ này" inside the POI check / route test form. The robot picker was rendered
// inside the outer <form> and Modal, so clicking "Tiếp tục" never reached the robot setup dialog.
const map = {
  id: 'map-v1', areaKey: 'tang-6', areaName: 'Tầng 6', versionNumber: 1, mapKey: 'tang-6-v1',
  packageFileName: 'tang-6.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z',
}
const robot = {
  id: 'robot-1', robotCode: 'amr_01', displayName: null, firstAcceptedSyncAt: '2026-10-27T10:00:00Z', firstAcceptedMapKey: null, firstAcceptedFrameId: null,
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-10-27T10:01:00Z', rowVersion: 'AAAAAAAAAAA=', assignedMapVersionId: null, assignedAreaName: null, assignedVersionNumber: null, assignedMapKey: null, assignedFrameId: null, mapAssignedAt: null, mapAssignedByName: null, latestDeployedMapKey: null, latestDeployedFrameId: null, latestDeploymentPassed: null,
  needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: false,
  readiness: { state: 'NOT_SET_UP', reasonCode: 'ROBOT_MAP_NOT_ASSIGNED', reason: 'Robot amr_01 chưa được gán bản đồ.', mapVersionId: null, mapLabel: null, deploymentCheckedAt: null, reportingOnAssignedMap: false },
}
const revision = { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'tang-6-v1', name: 'test', purpose: 'Sảnh', description: null, x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:01:00Z', navigationStatus: 'NOT_CHECKED' }
const route = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 1, name: 'Tuyến tầng 6', mapVersionId: 'map-v1', mapKey: 'tang-6-v1', stops: [{}, {}], dwellDurationSeconds: 60, expectedDurationSeconds: 300, verificationStatus: 'NOT_TESTED', isSubmitted: true, testRuns: [], effectiveTestRunId: null, revisionHistory: [] }
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })

function api(url: URL) {
  switch (url.pathname) {
    case '/api/maps/versions': return ok([{ map, runningRobot: null, latestDeployment: null, technicalCheckStatus: 'PENDING', canUseForPoiPreparation: false, preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: null, currentlyDeployedOn: [] }])
    case '/api/maps/areas': return ok([{ areaKey: 'tang-6', displayName: 'Tầng 6' }])
    case '/api/technical/physical-robots': return ok([robot])
    case '/api/technical/poi-verifications': return ok([{ proposalId: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=', revision }])
    case '/api/technical/poi-proposals': return ok([])
    case '/api/technical/route-verifications/queue': return ok([route])
    case '/api/technical/route-verifications/participants': return ok([])
    case '/api/routes': return ok([])
    case '/api/robots/amr_01/credential': return ok({ robotCode: 'amr_01', status: 'NOT_ISSUED', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: null, revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] })
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

/** Choose the robot in the picker and press its real submit button, as a person does. */
async function pickRobotAndContinue() {
  fireEvent.click(await screen.findByRole('button', { name: 'Gán robot cho bản đồ này' }))
  const pickerDialog = await screen.findByRole('dialog', { name: 'Triển khai Tầng 6 · tang-6 · v1 cho robot' })
  // Chrome stops a nested form's submit at the outer form, before React's root listener, so the picker's own form
  // must not sit inside the check form. jsdom does not copy that, which is why this checks the DOM itself.
  expect(pickerDialog.querySelector('form')?.parentElement?.closest('form')).toBeNull()
  expect(screen.queryByRole('dialog', { name: /^(Kiểm chứng|Chạy thử)/ })).not.toBeInTheDocument()
  const picker = within(pickerDialog)
  await picker.findByRole('option', { name: /amr_01/ })
  fireEvent.change(picker.getByLabelText('Robot'), { target: { value: 'robot-1' } })
  fireEvent.click(picker.getByRole('button', { name: 'Tiếp tục' }))
}

async function expectAssignmentOpen() {
  expect(screen.getByTestId('location')).toHaveTextContent('/technical/robots?robot=robot-1&map=map-v1')
  const assignment = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr_01' }))
  await assignment.findByRole('option', { name: /Phiên bản 1/ })
  expect(assignment.getByLabelText('Phiên bản bản đồ')).toHaveValue('map-v1')
}

describe('assigning a robot from a POI check or route test form', () => {
  // src/test/setup.ts also fails any test that renders a form inside a form.
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => api(new URL(String(input), 'http://localhost'))))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('goes from the POI check to the robot setup with the POI map chosen', async () => {
    renderAt('/technical/pois')
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả' }))
    await pickRobotAndContinue()
    await expectAssignmentOpen()
  })

  it('goes from the route test form to the robot setup with the route map chosen', async () => {
    renderAt('/technical/route-tests')
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả Tuyến tầng 6' }))
    await pickRobotAndContinue()
    await expectAssignmentOpen()
  })
})
