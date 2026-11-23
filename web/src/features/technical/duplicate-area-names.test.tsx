import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TechnicalMapsPage from '../../routes/technical/TechnicalMapsPage'
import TechnicalRobotsPage from '../../routes/technical/TechnicalRobotsPage'
import { useAuthStore } from '../../stores/auth-store'
import type { PhysicalRobotOption } from './api/technical'
import { areaLabel, duplicateAreaNames, mapShortLabel, sameAreaName } from './poi-labels'
import { ApiError } from '../../api/client'
import { mapUploadFieldErrors } from './technical-format'

// Two areas named "Tầng 6" (spec technical-readiness W9): the live data that made the robot chip ambiguous.
const TWO_TANG_6 = [{ areaKey: 'tang-6', displayName: 'Tầng 6' }, { areaKey: 'test123', displayName: 'Tầng 6 ' }, { areaKey: 'betea', displayName: 'Betea' }]

describe('area names', () => {
  it('matches names the way the server does: trimmed, case ignored', () => {
    expect(sameAreaName('tầng 6 ', 'Tầng 6')).toBe(true)
    expect(sameAreaName('Tầng 6', 'Tầng 7')).toBe(false)
  })

  it('prints the area key only beside a name another area shares', () => {
    const duplicates = duplicateAreaNames(TWO_TANG_6.map(area => ({ areaKey: area.areaKey, name: area.displayName })))
    expect(mapShortLabel({ areaName: 'Tầng 6', areaKey: 'test123', versionNumber: 1 }, duplicates)).toBe('Tầng 6 · test123 · v1')
    expect(mapShortLabel({ areaName: 'Betea', areaKey: 'betea', versionNumber: 2 }, duplicates)).toBe('Betea · v2')
    expect(areaLabel('Betea', 'betea', duplicates)).toBe('Betea')
  })

  it("puts the server's MAP_AREA_NAME_TAKEN sentence beside the area name", () => {
    const body = JSON.stringify({ success: false, message: 'Đã có khu vực tên Tầng 6 (tang-6). Chọn Khu vực đã có hoặc đặt tên khác.', errors: { code: 'MAP_AREA_NAME_TAKEN' } })
    expect(mapUploadFieldErrors(new ApiError(409, body))).toEqual({ areaName: 'Đã có khu vực tên Tầng 6 (tang-6). Chọn Khu vực đã có hoặc đặt tên khác.' })
  })
})

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const mapOf = (id: string, areaKey: string, areaName: string) => ({
  id, areaKey, areaName, versionNumber: 1, mapKey: `${areaKey}-v1`, packageFileName: `${areaKey}-v1.zip`, packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-11-20T10:00:00Z',
})
const itemOf = (map: ReturnType<typeof mapOf>) => ({ map, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null,
  preparationEvidence: null, currentlyDeployedOn: [], runningRobot: null })
const robot = (overrides: Partial<PhysicalRobotOption>): PhysicalRobotOption => ({
  id: 'robot-1', robotCode: 'amr_01', displayName: 'AMR 01', firstAcceptedSyncAt: '2026-11-20T10:00:00Z', firstAcceptedMapKey: 'test123-v1', firstAcceptedFrameId: 'map',
  connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-11-23T10:00:00Z', rowVersion: 'AAAAAAAAAAA=', assignedMapVersionId: 'map-test123', assignedAreaName: 'Tầng 6 ', assignedVersionNumber: 1,
  assignedMapKey: 'test123-v1', assignedFrameId: 'map', mapAssignedAt: '2026-11-20T10:00:00Z', mapAssignedByName: 'Technical', latestDeployedMapKey: 'test123-v1', latestDeployedFrameId: 'map',
  latestDeploymentPassed: true, needsInspection: false, currentTourId: null, currentTourName: null, currentTourState: null, isDispatchEnabled: false,
  readiness: { state: 'READY', reasonCode: null, reason: null, mapVersionId: 'map-test123', mapLabel: 'Tầng 6 · v1', deploymentCheckedAt: '2026-11-23T09:00:00Z', reportingOnAssignedMap: true },
  ...overrides,
})

let areas = TWO_TANG_6
function stubApi(robots: PhysicalRobotOption[] = []) {
  const maps = [itemOf(mapOf('map-tang-6', 'tang-6', 'Tầng 6')), itemOf(mapOf('map-test123', 'test123', 'Tầng 6 ')), itemOf(mapOf('map-betea', 'betea', 'Betea'))]
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/technical/map-areas') return envelope(areas)
    if (url.pathname === '/api/maps/versions') return envelope(maps)
    if (url.pathname === '/api/technical/physical-robots') return envelope(robots)
    return envelope(null)
  }))
}
const renderPage = (page: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>)

describe('shared area names on Technical screens', () => {
  beforeEach(() => {
    areas = TWO_TANG_6
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('refuses a new area whose name another area has while it is typed, then accepts a new name', async () => {
    stubApi()
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tải lên bản đồ mới' }))
    const dialog = within(await screen.findByRole('dialog'))
    await waitFor(() => expect(dialog.queryByText('Đang tải danh sách khu vực…')).not.toBeInTheDocument())
    fireEvent.change(dialog.getByLabelText('Tên khu vực'), { target: { value: '  betea ' } })
    expect(dialog.getByRole('alert')).toHaveTextContent('Đã có khu vực tên Betea (betea). Chọn Khu vực đã có hoặc đặt tên khác.')
    expect(dialog.getByLabelText('Tên khu vực')).toHaveAttribute('aria-invalid', 'true')
    // The key made from the taken name is that area's key too; one sentence says it, not two.
    expect(dialog.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Tải lên bản đồ' })).toBeDisabled()

    fireEvent.change(dialog.getByLabelText('Tên khu vực'), { target: { value: 'Betea tầng 2' } })
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument()
    expect(dialog.getByLabelText('Tên khu vực')).toHaveAttribute('aria-invalid', 'false')
  })

  it('names the area key in the robot chip when the area name is shared, and not otherwise', async () => {
    stubApi([robot({})])
    renderPage(<TechnicalRobotsPage />)
    expect(await screen.findByText('Sẵn sàng · Tầng 6 · test123 · v1')).toBeInTheDocument()
  })

  it('keeps the server label when no other area has the name', async () => {
    areas = [{ areaKey: 'test123', displayName: 'Tầng 6 ' }]
    stubApi([robot({})])
    renderPage(<TechnicalRobotsPage />)
    await waitFor(() => expect(screen.getByText(/^Sẵn sàng · /)).toHaveTextContent(/^Sẵn sàng · Tầng 6 · v1$/))
  })
})
