import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import { useAuthStore } from '../../stores/auth-store'
import type { PhysicalRobotOption } from './api/technical'

// Round 5 (27/11): amr_01 passed on Betea 23/11 13:25, moved to tang-6, then back to Betea 26/11 14:31 with no check since.
const betea = {
  id: 'map-betea', areaKey: 'betea', areaName: 'Betea', versionNumber: 1, mapKey: 'betea-v1', packageFileName: 'betea.zip', packageSha256: 'a'.repeat(64),
  imageFileName: 'map.pgm', imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-11-20T08:00:00Z',
}
const mapItem = { map: betea, runningRobot: null, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: null, currentlyDeployedOn: [] }
const amr01: PhysicalRobotOption = {
  id: 'robot-1', robotCode: 'amr_01', displayName: 'Robot tham quan', firstAcceptedSyncAt: '2026-10-30T08:00:00Z', firstAcceptedMapKey: 'test123-v1', firstAcceptedFrameId: 'map',
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-11-27T02:00:00Z', rowVersion: 'AAAAAAAAAAA=',
  assignedMapVersionId: 'map-betea', assignedAreaName: 'Betea', assignedVersionNumber: 1, assignedMapKey: 'betea-v1', assignedFrameId: 'map',
  mapAssignedAt: '2026-11-26T07:31:00Z', mapAssignedByName: 'technicalStaff',
  latestDeployedMapKey: 'betea-v1', latestDeployedFrameId: 'map', latestDeploymentPassed: true,
  needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: true,
  readiness: { state: 'NOT_READY', reasonCode: 'ROBOT_DEPLOYMENT_CHECK_REQUIRED', reason: 'Robot amr_01 chưa kiểm tra triển khai trên Betea · betea · phiên bản 1 (gán lúc 26/11 14:31).',
    detail: 'Lần kiểm tra đạt gần nhất trên Betea · betea · phiên bản 1 lúc 23/11 13:25 có trước lần gán lúc 26/11 14:31, cần kiểm lại.',
    nextStep: 'DEPLOYMENT_CHECK', mapVersionId: 'map-betea', mapLabel: 'Betea · v1', deploymentCheckedAt: null, reportingOnAssignedMap: true },
}
const readyAmr01: PhysicalRobotOption = {
  ...amr01, readiness: { ...amr01.readiness, state: 'READY', reasonCode: null, reason: null, detail: null, nextStep: null, deploymentCheckedAt: '2026-11-27T01:00:00Z' },
}
const running: PhysicalRobotOption = { ...readyAmr01, currentTourId: 'tour-1', currentTourName: 'Tour sáng', currentTourState: 'RUNNING' }
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const runningRefusal = 'Robot amr_01 đang chạy Tour Tour sáng. Kết thúc Tour (hoặc kết thúc sớm) rồi mới ngừng sử dụng.'

let robots: PhysicalRobotOption[] = []

function api(url: URL, init?: RequestInit) {
  if (url.pathname === '/api/technical/physical-robots/robot-1/deactivate' && init?.method === 'POST')
    return new Response(JSON.stringify({ success: false, message: runningRefusal, errors: { code: 'ROBOT_IN_RUNNING_TOUR' } }), { status: 409, headers: { 'Content-Type': 'application/json' } })
  switch (url.pathname) {
    case '/api/maps/versions': return ok([mapItem])
    case '/api/maps/areas': return ok([{ areaKey: 'betea', displayName: 'Betea' }])
    case '/api/technical/physical-robots': return ok(robots)
    case '/api/robots/amr_01/credential': return ok({ robotCode: 'amr_01', status: 'ACTIVE', issuedAt: null, issuedByUserId: null, issuedByName: null, hint: 'ab12', revokedAt: null, revokedByUserId: null, revokedByName: null, rowVersion: 'AAAAAAAAAAA=', history: [] })
    default: return ok([])
  }
}

function renderAt(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/technical/robots" element={<TechnicalRobotsPage />} /></Routes>
  </MemoryRouter></QueryClientProvider>)
}

const setupDialog = async () => within(await screen.findByRole('dialog', { name: 'Robot tham quan' }))
const runningLine = 'Robot đang chạy Tour Tour sáng. Kết thúc Tour rồi mới đổi.'

describe('round 5: a check before the assignment, and a robot running a Tour', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => api(new URL(String(input), 'http://localhost'), init)))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('says the pass from before the assignment needs redoing, with its time when the server sends it', async () => {
    robots = [{ ...amr01, readiness: { ...amr01.readiness, deploymentCheckedAt: '2026-11-23T06:25:00Z' } }]
    renderAt('/technical/robots?robot=robot-1')
    const step = within((await setupDialog()).getByRole('region', { name: '3. Kiểm tra tại robot' }))

    expect(step.getByText('Lần trước: Đạt 23/11/2026 13:25, trước lần gán 26/11/2026 14:31. Cần kiểm lại.')).toBeInTheDocument()
    expect(step.queryByText(/^Lần trước: Đạt 23\/11\/2026 13:25$/)).not.toBeInTheDocument()
  })

  it('says the same without a time when the server no longer counts that check, and step 5 stays to do', async () => {
    robots = [amr01]
    renderAt('/technical/robots?robot=robot-1')
    const dialog = await setupDialog()

    expect(within(dialog.getByRole('region', { name: '3. Kiểm tra tại robot' })).getByText('Lần trước: Đạt, trước lần gán 26/11/2026 14:31. Cần kiểm lại.')).toBeInTheDocument()
    const checklist = within(dialog.getByRole('region', { name: 'Thiết lập robot' }))
    expect(checklist.getByText('Kiểm tra triển khai đạt trên bản đồ được gán')).toHaveTextContent('bước tiếp theo')
    expect(checklist.getByText('4/5 bước')).toBeInTheDocument()
  })

  it('keeps the plain line for a check after the assignment', async () => {
    robots = [readyAmr01]
    renderAt('/technical/robots?robot=robot-1')
    const step = within((await setupDialog()).getByRole('region', { name: '3. Kiểm tra tại robot' }))

    expect(step.getByText('Lần trước: Đạt 27/11/2026 08:00')).toBeInTheDocument()
    expect(step.queryByText(/Cần kiểm lại/)).not.toBeInTheDocument()
  })

  it('names the first connection map as such', async () => {
    robots = [readyAmr01]
    renderAt('/technical/robots?robot=robot-1')
    const connection = within((await setupDialog()).getByRole('region', { name: 'Kết nối' }))

    expect(connection.getByText('Map / frame lần kết nối đầu')).toBeInTheDocument()
    expect(connection.getByText('test123-v1 · map')).toBeInTheDocument()
    expect(connection.queryByText('Map / frame xác nhận')).not.toBeInTheDocument()
  })

  it('locks changing the map and deactivating while the robot runs a Tour, but not stopping dispatch', async () => {
    robots = [running]
    renderAt('/technical/robots?robot=robot-1')
    const dialog = await setupDialog()

    const mapStep = within(dialog.getByRole('region', { name: '1. Chọn bản đồ' }))
    expect(mapStep.getByRole('button', { name: 'Đổi bản đồ' })).toBeDisabled()
    expect(mapStep.getByText(runningLine)).toBeInTheDocument()
    const lifecycle = within(dialog.getByRole('region', { name: 'Trạng thái sử dụng' }))
    expect(lifecycle.getByRole('button', { name: 'Ngừng sử dụng' })).toBeDisabled()
    expect(lifecycle.getByText(runningLine)).toBeInTheDocument()
    expect(within(dialog.getByRole('region', { name: 'Điều phối Tour' })).getByRole('button', { name: 'Tắt điều phối' })).toBeEnabled()
  })

  it('locks saving and clearing the map in the map dialog reached by a link', async () => {
    robots = [running]
    renderAt('/technical/robots?robot=robot-1&map=map-betea')
    const dialog = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr_01' }))

    expect(dialog.getByText(runningLine)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Gỡ gán bản đồ' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Lưu bản đồ' })).toBeDisabled()
  })

  it('locks a new key but keeps revoking, and warns that revoking cuts the Tour off', async () => {
    robots = [running]
    renderAt('/technical/robots?robot=robot-1')
    fireEvent.click((await setupDialog()).getByRole('button', { name: 'Quản lý khóa' }))
    const panel = within(await screen.findByRole('dialog', { name: 'Khóa Fleet Sync · amr_01' }))

    expect(await panel.findByRole('button', { name: 'Cấp lại' })).toBeDisabled()
    expect(panel.getByText(runningLine)).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Thu hồi' }))
    const confirm = await screen.findByRole('dialog', { name: 'Thu hồi khóa của amr_01?' })
    expect(confirm).toHaveTextContent('Robot đang chạy Tour Tour sáng; thu hồi khóa làm robot mất kết nối giữa Tour.')
  })

  it('shows the server refusal when an old page tries to deactivate a robot that started a Tour', async () => {
    robots = [readyAmr01]
    renderAt('/technical/robots?robot=robot-1')
    const lifecycle = within((await setupDialog()).getByRole('region', { name: 'Trạng thái sử dụng' }))
    fireEvent.click(lifecycle.getByRole('button', { name: 'Ngừng sử dụng' }))
    const confirm = within(await screen.findByRole('dialog', { name: 'Ngừng sử dụng amr_01?' }))
    fireEvent.change(confirm.getByLabelText(/Lý do ngừng sử dụng/), { target: { value: 'Bảo trì' } })
    fireEvent.click(confirm.getByRole('button', { name: 'Ngừng sử dụng' }))

    await waitFor(() => expect(confirm.getByRole('alert')).toHaveTextContent(runningRefusal))
  })

  // Round 6: after a Reconcile the robot waits for inspection while its Tour is still RUNNING until End Early. The locks
  // follow the Tour state, as the server does, not the "Chờ kiểm tra tại chỗ" badge.
  it.each([
    ['RUNNING', true],
    ['CANCELLED', false],
    ['COMPLETED', false],
  ] as const)('a robot waiting for inspection with its Tour %s: map, deactivation and new key locked = %s', async (state, locked) => {
    robots = [{ ...running, needsInspection: true, currentTourState: state }]
    const view = renderAt('/technical/robots?robot=robot-1')
    const dialog = await setupDialog()
    const expectLock = (button: HTMLElement) => locked ? expect(button).toBeDisabled() : expect(button).toBeEnabled()

    expectLock(within(dialog.getByRole('region', { name: '1. Chọn bản đồ' })).getByRole('button', { name: 'Đổi bản đồ' }))
    expectLock(within(dialog.getByRole('region', { name: 'Trạng thái sử dụng' })).getByRole('button', { name: 'Ngừng sử dụng' }))
    expect(within(dialog.getByRole('region', { name: 'Điều phối Tour' })).getByRole('button', { name: 'Tắt điều phối' })).toBeEnabled()
    expect(dialog.queryAllByText(runningLine)).toHaveLength(locked ? 2 : 0)
    fireEvent.click(dialog.getByRole('button', { name: 'Quản lý khóa' }))
    const panel = within(await screen.findByRole('dialog', { name: 'Khóa Fleet Sync · amr_01' }))
    expectLock(await panel.findByRole('button', { name: 'Cấp lại' }))
    expect(panel.getByRole('button', { name: 'Thu hồi' })).toBeEnabled()
    expect(panel.queryByText(runningLine) !== null).toBe(locked)
    view.unmount()

    renderAt('/technical/robots?robot=robot-1&map=map-betea')
    const mapDialog = within(await screen.findByRole('dialog', { name: 'Bản đồ của amr_01' }))
    expectLock(mapDialog.getByRole('button', { name: 'Gỡ gán bản đồ' }))
    expectLock(mapDialog.getByRole('button', { name: 'Lưu bản đồ' }))
  })
})
