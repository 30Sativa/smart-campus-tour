import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManagePoiFormPage from '../../../routes/staff/manage/StaffManagePoiFormPage'
import { useAuthStore } from '../../../stores/auth-store'
import { installSvgLayout, pointerAt } from './map/picker-test-support'

const rasterPngBlob = vi.hoisted(() => vi.fn(async () => new Blob(['preview'], { type: 'image/png' })))
vi.mock('./map/versioned-package', () => ({
  parseVersionedMapPackage: vi.fn(async () => ({ width: 2, height: 2, resolution: 0.5, origin: [10, 20, 0], frameId: 'map', imageSha256: 'b'.repeat(64), sourceYaml: 'image: map.pgm', pixels: new Uint8ClampedArray(16) })),
  rasterPngBlob,
}))
vi.mock('./map/load-map-image', () => ({ loadMapImage: vi.fn(async () => ({ pixels: null })) }))

const map = { id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1', packageFileName: 'library.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm', imageWidth: 2, imageHeight: 2, resolution: 0.5, originX: 10, originY: 20, originYaw: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z' }
const eligibleMap = { map, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: { id: 'check-1', mapVersionId: map.id, robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Simulated test evidence', checkedAt: '2026-10-27T10:00:00Z' } }
const NativeURL = URL
const proposal = { id: 'proposal-1', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Library entry', purpose: 'Entrance', description: null, narrationText: 'Giới thiệu thư viện.', fallbackVideoUrl: null, x: 10.25, y: 20.75, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: false, submittedAt: null, navigationStatus: 'NOT_CHECKED', verificationSourceRevisionId: null } }
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, message: 'OK', data, errors: null }), { status, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
let restoreLayout: () => void

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/manage/pois/new" element={<StaffManagePoiFormPage />} />
    <Route path="/staff/manage/pois/:poiId" element={<StaffManagePoiFormPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('Staff versioned POI workflow', () => {
  beforeEach(() => {
    restoreLayout = installSvgLayout()
    requests = []
    useAuthStore.setState({ accessToken: 'staff-token', isAuthenticated: true, isAuthReady: true, user: { userId: 'staff-1', username: 'staff', role: 'Staff' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([eligibleMap])
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
      if (url.pathname === '/api/staff/poi-proposals' && init?.method === 'POST') return response(proposal)
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/submit') return response({ ...proposal, revision: { ...proposal.revision, isSubmitted: true, submittedAt: '2026-10-27T10:02:00Z' } })
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response({ ...proposal, revision: { ...proposal.revision, isSubmitted: true, submittedAt: '2026-10-27T10:02:00Z', navigationStatus: 'FAIL' } })
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/history') return response({ proposalId: 'proposal-1', revisions: [{ ...proposal.revision, navigationStatus: 'FAIL', isSubmitted: true }], verificationRecords: [{ id: 'check-1', proposalId: 'proposal-1', proposalRevisionId: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', robotCode: 'amr-01', resultCode: 'FAIL', reached: false, stopped: true, localizationPassed: true, cameraPresetConfirmed: true, reason: 'POI chưa tới được', evidenceNote: 'Backend simulated verification evidence', checkedAt: '2026-10-27T10:03:00Z' }] })
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/draft' && init?.method === 'PUT') return response({ ...proposal, currentRevision: 2, rowVersion: 'CAcGBQQDAgE=', revision: { ...proposal.revision, id: 'revision-2', revisionNumber: 2, name: 'Library updated', navigationStatus: 'NOT_CHECKED' } })
      return response(null)
    }))
    class TestURL extends NativeURL {}
    Object.defineProperties(TestURL, { createObjectURL: { value: vi.fn(() => 'blob:map-preview') }, revokeObjectURL: { value: vi.fn() } })
    vi.stubGlobal('URL', TestURL)
  })
  afterEach(() => { restoreLayout(); vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('loads the selected map package, converts a picked cell to world coordinates and creates/submits a proposal', async () => {
    renderAt('/staff/manage/pois/new')
    fireEvent.change(await screen.findByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
    fireEvent.pointerDown(svg, pointerAt(svg, 0.5, 0.5))
    fireEvent.pointerDown(svg, pointerAt(svg, 1.5, 0.5))
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Library entry' } })
    fireEvent.change(screen.getByLabelText('Mục đích'), { target: { value: 'Entrance' } })
    fireEvent.change(screen.getByLabelText('Nội dung thuyết minh'), { target: { value: 'Giới thiệu thư viện.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi kiểm chứng' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/submit')).toBe(true))
    const create = requests.find(r => r.url.pathname === '/api/staff/poi-proposals' && r.init?.method === 'POST')!
    const body = JSON.parse(String(create.init?.body))
    expect(body.draft).toMatchObject({ mapVersionId: 'map-v1', x: 10.25, y: 20.75, yaw: 0, name: 'Library entry', narrationText: 'Giới thiệu thư viện.', fallbackVideoUrl: null })
    expect(body.requestId).toBeTruthy()
    const submit = requests.find(r => r.url.pathname.endsWith('/submit'))!
    expect(JSON.parse(String(submit.init?.body))).toMatchObject({ expectedRevisionNumber: 1, expectedRowVersion: proposal.rowVersion })
    expect(requests.some(r => r.url.pathname === '/api/maps/versions/map-v1/package')).toBe(true)
  })

  it('revises with the current revision and rowversion and shows rejection reason/history', async () => {
    renderAt('/staff/manage/pois/proposal-1')
    expect(await screen.findByText(/Revision 1 · FAIL/)).toBeInTheDocument()
    expect(await screen.findByText(/Lý do: POI chưa tới được/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Library updated' } })
    fireEvent.change(screen.getByLabelText('Nội dung thuyết minh'), { target: { value: 'Nội dung đã cập nhật.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu revision nháp' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname.endsWith('/draft') && r.init?.method === 'PUT')).toBe(true))
    const revise = requests.find(r => r.url.pathname.endsWith('/draft'))!
    expect(JSON.parse(String(revise.init?.body))).toMatchObject({ expectedCurrentRevision: 1, expectedRowVersion: proposal.rowVersion, draft: { mapVersionId: 'map-v1', name: 'Library updated', narrationText: 'Nội dung đã cập nhật.' } })
  })

  it('shows ineligible maps disabled and preserves edits if eligibility changes on the server', async () => {
    const blockedMap = { ...eligibleMap, technicalCheckStatus: 'FAILED', canUseForPoiPreparation: false,
      preparationBlockReasonCode: 'TECHNICAL_CHECK_NOT_PASSED', preparationBlockReason: 'Không có robot nào có kết quả kiểm tra kỹ thuật mới nhất đạt cho phiên bản bản đồ này.', preparationEvidence: { ...eligibleMap.preparationEvidence, localizationPassed: false, passed: false } }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([blockedMap])
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response(proposal)
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/history') return response({ proposalId: 'proposal-1', revisions: [proposal.revision], verificationRecords: [] })
      if (url.pathname.endsWith('/draft') && init?.method === 'PUT') return response({ success: false, message: blockedMap.preparationBlockReason, data: null, errors: { code: blockedMap.preparationBlockReasonCode } }, 409)
      return response(null)
    }))
    renderAt('/staff/manage/pois/proposal-1')
    expect(await screen.findByText(/Map của đề xuất hiện không đủ điều kiện/)).toBeInTheDocument()
    expect((screen.getByLabelText('Bản đồ') as HTMLSelectElement).selectedOptions[0].disabled).toBe(true)
    const name = screen.getByLabelText('Tên POI')
    fireEvent.change(name, { target: { value: 'Bản nháp người dùng giữ lại' } })
    expect(screen.getByRole('button', { name: 'Lưu revision nháp' })).toBeDisabled()
    expect(name).toHaveValue('Bản nháp người dùng giữ lại')
    expect(screen.getAllByText(/Không có robot nào có kết quả kiểm tra kỹ thuật mới nhất đạt/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Chưa có bản đồ được kỹ thuật xác nhận đạt/)).toBeInTheDocument()
  })

  it('loads an exact historical map missing from the capped list and keeps its POI preview read-only', async () => {
    const blockedMap = { ...eligibleMap, technicalCheckStatus: 'FAILED', canUseForPoiPreparation: false,
      preparationBlockReasonCode: 'TECHNICAL_CHECK_NOT_PASSED', preparationBlockReason: 'Bản đồ cần được kiểm tra lại.', preparationEvidence: null }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([])
      if (url.pathname === '/api/maps/versions/map-v1') return response(blockedMap)
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response(proposal)
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/history') return response({ proposalId: 'proposal-1', revisions: [proposal.revision], verificationRecords: [] })
      return response(null)
    }))
    renderAt('/staff/manage/pois/proposal-1')
    expect(await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })).toBeInTheDocument()
    expect(requests.some(request => request.url.pathname === '/api/maps/versions/map-v1')).toBe(true)
    expect(screen.getByText(/Map của đề xuất hiện không đủ điều kiện/)).toBeInTheDocument()
    expect(screen.getByLabelText('X (m)')).toBeDisabled()
    expect(screen.getByLabelText('Y (m)')).toBeDisabled()
    expect(screen.getByLabelText('Yaw (rad)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lưu revision nháp' })).toBeDisabled()
    expect(screen.getByLabelText('Tên POI')).toHaveValue('Library entry')
    expect(screen.getByLabelText('Bản đồ')).toHaveValue('map-v1')
  })

  it('keeps the typed POI draft visible when backend eligibility changes during entry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([eligibleMap])
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
      if (url.pathname === '/api/staff/poi-proposals' && init?.method === 'POST') return new Response(JSON.stringify({ success: false, message: 'Map vừa mất điều kiện kỹ thuật.', data: null, errors: { code: 'TECHNICAL_CHECK_NOT_PASSED' } }), { status: 409, headers: { 'Content-Type': 'application/json' } })
      return response(null)
    }))
    renderAt('/staff/manage/pois/new')
    fireEvent.change(await screen.findByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Draft to keep' } })
    fireEvent.change(screen.getByLabelText('Mục đích'), { target: { value: 'Entrance' } })
    fireEvent.change(screen.getByLabelText('Nội dung thuyết minh'), { target: { value: 'Nội dung giới thiệu.' } })
    fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '10.25' } })
    fireEvent.change(screen.getByLabelText('Y (m)'), { target: { value: '20.75' } })
    fireEvent.change(screen.getByLabelText('Yaw (rad)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu revision nháp' }))
    await waitFor(() => expect(requests.some(request => request.url.pathname === '/api/staff/poi-proposals' && request.init?.method === 'POST')).toBe(true))
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('Map vừa mất điều kiện kỹ thuật.')
    expect(screen.getByLabelText('Tên POI')).toHaveValue('Draft to keep')
    expect(screen.getByLabelText('Mục đích')).toHaveValue('Entrance')
    expect(screen.getByLabelText('Nội dung thuyết minh')).toHaveValue('Nội dung giới thiệu.')
    expect(screen.getByLabelText('X (m)')).toHaveValue(10.25)
  })
})
