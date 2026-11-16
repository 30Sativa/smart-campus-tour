import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManagePoiFormPage from '../../../routes/staff/manage/StaffManagePoiFormPage'
import StaffManagePoisPage from '../../../routes/staff/manage/StaffManagePoisPage'
import { useAuthStore } from '../../../stores/auth-store'
import { useToastStore } from '../../../components/ui/toast-store'
import { installSvgLayout, pointerAt } from './map/picker-test-support'

const rasterPngBlob = vi.hoisted(() => vi.fn(async () => new Blob(['preview'], { type: 'image/png' })))
vi.mock('./map/versioned-package', () => ({
  parseVersionedMapPackage: vi.fn(async () => ({ width: 2, height: 2, resolution: 0.5, origin: [10, 20, 0], frameId: 'map', imageSha256: 'b'.repeat(64), sourceYaml: 'image: map.pgm', pixels: new Uint8ClampedArray(16) })),
  rasterPngBlob,
}))
vi.mock('./map/load-map-image', () => ({ loadMapImage: vi.fn(async () => ({ pixels: null })) }))

const map = { id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1', packageFileName: 'library.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm', imageWidth: 2, imageHeight: 2, resolution: 0.5, originX: 10, originY: 20, originYaw: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z' }
const eligibleMap = { map, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: { id: 'check-1', mapVersionId: map.id, robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Simulated test evidence', checkedAt: '2026-10-27T10:00:00Z' }, currentlyDeployedOn: [{ robotCode: 'amr-01', checkedAt: '2026-10-27T10:00:00Z' }] }
const NativeURL = URL
const proposal = { id: 'proposal-1', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Library entry', purpose: 'Entrance', description: null, x: 10.25, y: 20.75, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: false, submittedAt: null, navigationStatus: 'NOT_CHECKED', verificationSourceRevisionId: null } }
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, message: 'OK', data, errors: null }), { status, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
let mapItem: object = eligibleMap
let restoreLayout: () => void

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/manage/pois" element={<StaffManagePoisPage />} />
    <Route path="/staff/manage/pois/new" element={<StaffManagePoiFormPage />} />
    <Route path="/staff/manage/pois/:poiId" element={<StaffManagePoiFormPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('Staff versioned POI workflow', () => {
  beforeEach(() => {
    restoreLayout = installSvgLayout()
    requests = []
    mapItem = eligibleMap
    useAuthStore.setState({ accessToken: 'staff-token', isAuthenticated: true, isAuthReady: true, user: { userId: 'staff-1', username: 'staff', role: 'Staff' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([mapItem])
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
    expect(screen.getByText('Robot đang chạy bản đồ này: amr-01')).toBeInTheDocument()
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
    fireEvent.pointerDown(svg, pointerAt(svg, 0.5, 0.5))
    fireEvent.pointerDown(svg, pointerAt(svg, 1.5, 0.5))
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Library entry' } })
    fireEvent.change(screen.getByLabelText('Mục đích'), { target: { value: 'Entrance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi kiểm chứng' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/submit')).toBe(true))
    const create = requests.find(r => r.url.pathname === '/api/staff/poi-proposals' && r.init?.method === 'POST')!
    const body = JSON.parse(String(create.init?.body))
    expect(body.draft).toMatchObject({ mapVersionId: 'map-v1', x: 10.25, y: 20.75, yaw: 0, name: 'Library entry' })
    expect(body.draft).not.toHaveProperty('narrationText')
    expect(body.draft).not.toHaveProperty('fallbackVideoUrl')
    expect(body.requestId).toBeTruthy()
    const submit = requests.find(r => r.url.pathname.endsWith('/submit'))!
    expect(JSON.parse(String(submit.init?.body))).toMatchObject({ expectedRevisionNumber: 1, expectedRowVersion: proposal.rowVersion })
    expect(requests.some(r => r.url.pathname === '/api/maps/versions/map-v1/package')).toBe(true)
  })

  it('rounds a heading typed in degrees to the stored radian precision, so the POI saves', async () => {
    renderAt('/staff/manage/pois/new')
    fireEvent.change(await screen.findByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
    fireEvent.pointerDown(svg, pointerAt(svg, 0.5, 0.5))
    fireEvent.pointerDown(svg, pointerAt(svg, 1.5, 0.5))
    fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '10.123456' } })
    fireEvent.change(screen.getByLabelText('Hướng (độ)'), { target: { value: '93' } })
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Library entry' } })
    fireEvent.change(screen.getByLabelText('Mục đích'), { target: { value: 'Entrance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals' && r.init?.method === 'POST')).toBe(true))
    const create = requests.find(r => r.url.pathname === '/api/staff/poi-proposals' && r.init?.method === 'POST')!
    const { draft } = JSON.parse(String(create.init?.body))
    expect(draft.yaw).toBe(1.623156)
    expect(draft.x).toBe(10.1235)
  })

  it('groups the camera angle with the robot pose and keeps the content fields in their own card', async () => {
    renderAt('/staff/manage/pois/new')
    const camera = await screen.findByRole('radiogroup', { name: 'Hoạt động đầu camera VR khi robot tới điểm' })
    expect(screen.getByRole('region', { name: 'Vị trí và hướng robot' })).toContainElement(camera)
    const content = screen.getByRole('complementary', { name: 'Nội dung điểm' })
    expect(content).not.toContainElement(camera)
    expect(content).toContainElement(screen.getByLabelText('Mục đích'))
    // Narration has its own section on the POI page (ADR-0060); a new POI is sent without it.
    expect(screen.queryByLabelText('Nội dung thuyết minh')).not.toBeInTheDocument()
    expect(screen.queryByText(/Video dự phòng/)).not.toBeInTheDocument()
  })

  it('shows the clearance message before submit and sends nothing for a pose too close to the map edge', async () => {
    mapItem = { ...eligibleMap, poiClearanceMeters: 0.3 }
    renderAt('/staff/manage/pois/new')
    fireEvent.change(await screen.findByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
    fireEvent.pointerDown(svg, pointerAt(svg, 0.5, 0.5))
    fireEvent.pointerDown(svg, pointerAt(svg, 1.5, 0.5))
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Library entry' } })
    fireEvent.change(screen.getByLabelText('Mục đích'), { target: { value: 'Entrance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi kiểm chứng' }))

    expect(await screen.findByText('Điểm quá sát vật cản (cần trống bán kính 0,30 m).', { selector: '[role="alert"]' })).toBeInTheDocument()
    expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals' && r.init?.method === 'POST')).toBe(false)
  })

  it('lets a content edit through when the pose is kept from the current revision', async () => {
    mapItem = { ...eligibleMap, poiClearanceMeters: 0.3 }
    renderAt('/staff/manage/pois/proposal-1')
    fireEvent.change(await screen.findByLabelText('Mục đích'), { target: { value: 'Mục đích mới' } })
    await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' }))

    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/draft')).toBe(true))
  })

  it('asks Staff to choose again when a revision holds an older camera value', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new NativeURL(String(input), 'http://localhost')
      if (url.pathname === '/api/maps/versions') return response([eligibleMap])
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response({ ...proposal, revision: { ...proposal.revision, cameraPreset: 'HEAD_LEFT' } })
      return response(null)
    }))
    renderAt('/staff/manage/pois/proposal-1')

    const camera = await screen.findByRole('radiogroup', { name: 'Hoạt động đầu camera VR khi robot tới điểm' })
    expect(screen.getByText('Hướng cũ HEAD_LEFT, cần chọn lại.')).toBeInTheDocument()
    expect(within(camera).getAllByRole('radio').some(radio => (radio as HTMLInputElement).checked)).toBe(false)
    expect(screen.getByText('Chọn lại hoạt động để xem mô phỏng.')).toBeInTheDocument()
  })

  it('shows a stored LEFT as the custom angle 90° left, and editing it saves a custom angle', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([eligibleMap])
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response({ ...proposal, revision: { ...proposal.revision, cameraPreset: 'LEFT' } })
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/draft') return response(proposal)
      return response(null)
    }))
    renderAt('/staff/manage/pois/proposal-1')

    await screen.findByRole('radiogroup', { name: 'Hoạt động đầu camera VR khi robot tới điểm' })
    expect(screen.getByRole('radio', { name: /Góc tùy chỉnh/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Trái 90°' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('spinbutton', { name: /^PAN/ })).toHaveValue(90)
    fireEvent.change(screen.getByRole('spinbutton', { name: /^PAN/ }), { target: { value: '60' } })
    expect(screen.getByRole('button', { name: 'Trái 90°' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/draft')).toBe(true))
    const save = requests.find(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/draft')!
    expect(JSON.parse(String(save.init?.body)).draft.cameraPreset).toBe('ANGLE:60,0')
  })

  it('blocks creating a POI from the list until a map has passed its technical check', async () => {
    const pendingMap = { ...eligibleMap, technicalCheckStatus: 'PENDING', canUseForPoiPreparation: false }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new NativeURL(String(input), 'http://localhost')
      if (url.pathname === '/api/maps/versions') return response([pendingMap])
      if (url.pathname === '/api/staff/poi-proposals') return response([])
      return response(null)
    }))

    renderAt('/staff/manage/pois')
    expect(await screen.findByText('Chưa thể tạo điểm tham quan')).toBeInTheDocument()
    expect(screen.getByText('Library · library-v1')).toBeInTheDocument()
    expect(screen.getByText('Chờ kỹ thuật kiểm tra')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tạo điểm mới' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tạo điểm mới' })).toHaveAccessibleDescription('Chưa có bản đồ nào đạt kiểm tra kỹ thuật')
    expect(screen.getByText('Chưa có bản đồ nào đạt kiểm tra kỹ thuật')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Tạo điểm mới' })).not.toBeInTheDocument()
  })

  it('warns when no robot is currently on a passed map but keeps that map selectable', async () => {
    const passedMapWithoutCurrentRobot = { ...eligibleMap, currentlyDeployedOn: [] }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([passedMapWithoutCurrentRobot])
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
      return response(null)
    }))

    renderAt('/staff/manage/pois/new')
    const picker = await screen.findByLabelText('Bản đồ') as HTMLSelectElement
    fireEvent.change(picker, { target: { value: 'map-v1' } })

    expect(await screen.findByText('Chưa có robot nào đang chạy bản đồ này. POI có thể không kiểm chứng được cho đến khi kỹ thuật triển khai lại.')).toBeInTheDocument()
    expect(picker.selectedOptions[0].disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' })).toBeEnabled()
  })

  it('revises with the current revision and rowversion and shows rejection reason/history', async () => {
    renderAt('/staff/manage/pois/proposal-1')
    expect((await screen.findAllByText(/Bản lưu \d\d\/\d\d \d\d:\d\d · Không đạt/)).length).toBeGreaterThan(0)
    // The reason shows in the FAIL banner above the tabs and in the history tab.
    expect((await screen.findAllByText(/Lý do: POI chưa tới được/)).length).toBe(2)
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Library updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname.endsWith('/draft') && r.init?.method === 'PUT')).toBe(true))
    const revise = requests.find(r => r.url.pathname.endsWith('/draft'))!
    expect(JSON.parse(String(revise.init?.body))).toMatchObject({ expectedCurrentRevision: 1, expectedRowVersion: proposal.rowVersion, draft: { mapVersionId: 'map-v1', name: 'Library updated' } })
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
    expect(await screen.findByText(/Bản đồ của điểm này hiện không đủ điều kiện/)).toBeInTheDocument()
    expect((screen.getByLabelText('Bản đồ') as HTMLSelectElement).selectedOptions[0].disabled).toBe(true)
    const name = screen.getByLabelText('Tên POI')
    fireEvent.change(name, { target: { value: 'Bản nháp người dùng giữ lại' } })
    expect(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' })).toBeDisabled()
    expect(name).toHaveValue('Bản nháp người dùng giữ lại')
    expect(screen.getAllByText(/Không có robot nào có kết quả kiểm tra kỹ thuật mới nhất đạt/).length).toBeGreaterThan(0)
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
    expect(screen.getByText(/Bản đồ của điểm này hiện không đủ điều kiện/)).toBeInTheDocument()
    expect(screen.getByLabelText('X (m)')).toBeDisabled()
    expect(screen.getByLabelText('Y (m)')).toBeDisabled()
    expect(screen.getByLabelText('Hướng (độ)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' })).toBeDisabled()
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
    fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '10.25' } })
    fireEvent.change(screen.getByLabelText('Y (m)'), { target: { value: '20.75' } })
    fireEvent.change(screen.getByLabelText('Hướng (độ)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' }))
    await waitFor(() => expect(requests.some(request => request.url.pathname === '/api/staff/poi-proposals' && request.init?.method === 'POST')).toBe(true))
    expect(screen.getAllByRole('alert').at(-1)).toHaveTextContent('Map vừa mất điều kiện kỹ thuật.')
    expect(screen.getByLabelText('Tên POI')).toHaveValue('Draft to keep')
    expect(screen.getByLabelText('Mục đích')).toHaveValue('Entrance')
    expect(screen.getByLabelText('X (m)')).toHaveValue(10.25)
  })

  describe('saving only what changed', () => {
    const serve = (revision: object, extra: object = {}) => vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([eligibleMap])
      if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response({ ...proposal, ...extra, revision: { ...proposal.revision, ...revision } })
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/submit') return response({ ...proposal, revision: { ...proposal.revision, ...revision, isSubmitted: true } })
      return response(null)
    }))
    const writes = () => requests.filter(r => r.init?.method === 'PUT' || r.init?.method === 'POST').map(r => r.url.pathname)

    it('locks saving on an unchanged passed POI, offers no re-send and says why', async () => {
      serve({ isSubmitted: true, navigationStatus: 'PASS' }, { narration: { approved: { revisionNumber: 1, approvedByUserId: 'staff-2', approvedByName: 'Lan', approvedAt: '2026-11-15T03:00:00Z' }, draft: null } })
      renderAt('/staff/manage/pois/proposal-1')
      expect(await screen.findByText('Đã đạt, dùng được trong tuyến.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' })).toHaveAccessibleDescription('Đã đạt, dùng được trong tuyến.')
      expect(screen.queryByRole('button', { name: /gửi kiểm/ })).not.toBeInTheDocument()
    })

    // ADR-0060: a PASS alone no longer makes the POI usable in a route.
    it('says a passed POI still waits for an approved narration before a route can use it', async () => {
      serve({ isSubmitted: true, navigationStatus: 'PASS' }, { narration: { approved: null, draft: { revisionNumber: 1, lastEditedByUserId: 'staff-1', lastEditedByName: 'Tôi', lastEditedAt: '2026-11-15T03:00:00Z', rowVersion: 'n1' } } })
      renderAt('/staff/manage/pois/proposal-1')
      expect(await screen.findByText('Đã đạt kiểm chứng. Còn chờ duyệt thuyết minh trước khi dùng cho tuyến.')).toBeInTheDocument()
      expect(screen.queryByText('Đã đạt, dùng được trong tuyến.')).not.toBeInTheDocument()
    })

    // ADR-0061 investigation ("Test_1" renamed to "B" lost its PASS): values exactly as the API returns them
    // (X, Y decimal(10,4), Yaw decimal(9,6), canonical camera). Opening the form, switching the picker mode and
    // focusing/leaving the pose fields must not touch them, and a rename must send them back unchanged.
    it.each(['FRONT', 'LEFT', 'RIGHT', 'NONE', 'SWEEP', 'SWEEP:60', 'ANGLE:30,-10', 'ANGLE:12.5,3.5'])(
      'a name-only edit of a passed POI sends its pose and camera %s unchanged and keeps the PASS', async camera => {
        const pose = { x: 10.2333, y: 20.7667, yaw: 0.785398, cameraPreset: camera }
        serve({ isSubmitted: true, navigationStatus: 'PASS', ...pose })
        renderAt('/staff/manage/pois/proposal-1')
        const name = await screen.findByLabelText('Tên POI')
        await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
        fireEvent.click(screen.getByRole('button', { name: 'Chọn hướng' }))
        fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
        for (const field of ['X (m)', 'Y (m)', 'Hướng (độ)']) { fireEvent.focus(screen.getByLabelText(field)); fireEvent.blur(screen.getByLabelText(field)) }
        expect(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' })).toBeDisabled()

        fireEvent.change(name, { target: { value: 'B' } })
        expect(screen.getByText('Lưu sẽ tạo bản mới và giữ kết quả đạt.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' }))
        await waitFor(() => expect(writes()).toContain('/api/staff/poi-proposals/proposal-1/draft'))
        const sent = JSON.parse(String(requests.find(r => r.url.pathname.endsWith('/draft'))!.init!.body)).draft
        expect(sent).toMatchObject({ name: 'B', ...pose })
      })

    // A revision that only renamed the POI keeps the PASS of its fingerprint without being submitted again.
    it('treats an unsubmitted revision that kept its PASS as passed, not as a draft', async () => {
      serve({ isSubmitted: false, navigationStatus: 'PASS', verificationSourceRevisionId: 'revision-0' })
      renderAt('/staff/manage/pois/proposal-1')
      // The status notice moved into the page header (owner's tab layout); it still says the PASS was kept.
      expect(within(await screen.findByRole('region', { name: 'Tình trạng POI' })).getByText('Đạt · giữ kết quả của bản lưu trước')).toBeInTheDocument()
      expect(screen.queryByText('Đã lưu, chưa gửi kiểm.')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' })).toBeDisabled()
      expect(screen.queryByRole('button', { name: /gửi kiểm/ })).not.toBeInTheDocument()
    })

    it('says a content edit keeps the PASS and a camera change needs a new check', async () => {
      serve({ isSubmitted: true, navigationStatus: 'PASS' })
      renderAt('/staff/manage/pois/proposal-1')
      fireEvent.change(await screen.findByLabelText('Mục đích'), { target: { value: 'Mục đích mới' } })
      expect(screen.getByText('Lưu sẽ tạo bản mới và giữ kết quả đạt.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: /gửi kiểm/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: /Góc tùy chỉnh/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Trái 90°' }))
      expect(screen.getByRole('img', { name: 'Nhìn từ trên: PAN 90° trái' })).toBeInTheDocument()
      expect(screen.getByText('Lưu sẽ tạo bản mới và phải gửi kiểm chứng lại. Tuyến và Tour đang dùng bản cũ không bị ảnh hưởng.')).toBeInTheDocument()
      // A camera change on a POI sent before: save without sending, or send it again.
      expect(screen.queryByRole('button', { name: 'Lưu (giữ kết quả Đạt)' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Lưu và gửi kiểm lại' })).toBeEnabled()
    })

    it('saves the VR head behaviour chosen in Camera & tư liệu, with its own sweep amplitude, and refuses a bad angle', async () => {
      serve({})
      renderAt('/staff/manage/pois/proposal-1')
      await screen.findByRole('radiogroup', { name: 'Hoạt động đầu camera VR khi robot tới điểm' })
      fireEvent.click(screen.getByRole('radio', { name: /Góc tùy chỉnh/ }))
      fireEvent.change(screen.getByRole('spinbutton', { name: /^PAN/ }), { target: { value: '45' } })
      fireEvent.change(screen.getByRole('slider', { name: 'Thanh kéo TILT' }), { target: { value: '-10' } })
      expect(screen.getByRole('img', { name: 'Nhìn từ trên: PAN 45° trái' })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Nhìn ngang: TILT 10° cúi' })).toBeInTheDocument()
      fireEvent.change(screen.getByRole('spinbutton', { name: /^PAN/ }), { target: { value: '200' } })
      expect(screen.getByText(/Góc PAN phải từ -170 đến 170 độ/)).toBeInTheDocument()
      expect(screen.getByText(/Còn thiếu: hoạt động đầu camera hợp lệ/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: /Quét trái, phải/ }))
      expect(screen.getByText(/quay chậm sang trái, rồi sang phải, rồi về chỗ cũ/)).toBeInTheDocument()
      fireEvent.change(screen.getByRole('spinbutton', { name: /^Biên độ mỗi bên/ }), { target: { value: '90' } })
      fireEvent.click(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' }))
      await waitFor(() => expect(writes()).toContain('/api/staff/poi-proposals/proposal-1/draft'))
      const save = requests.find(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/draft')!
      expect(JSON.parse(String(save.init?.body)).draft.cameraPreset).toBe('SWEEP:90')
    })

    it('sends an unchanged draft for checking without saving a copy of it first', async () => {
      serve({})
      renderAt('/staff/manage/pois/proposal-1')
      expect(await screen.findByText('Đã lưu, chưa gửi kiểm.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi kiểm chứng' }))
      await waitFor(() => expect(writes()).toEqual(['/api/staff/poi-proposals/proposal-1/submit']))
    })

    it('does not offer saving while a submitted revision waits for its check', async () => {
      serve({ isSubmitted: true })
      renderAt('/staff/manage/pois/proposal-1')
      expect(await screen.findByText('Đang chờ kỹ thuật kiểm tra.')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Tên khác' } })
      expect(screen.getByText(/chưa lưu được thay đổi/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Lưu và gửi kiểm lại' })).toBeDisabled()
    })
  })

  it('says what each save changed and which save each technical result belongs to', async () => {
    const first = { ...proposal.revision, navigationFingerprint: 'aa', navigationStatus: 'PASS', isSubmitted: true }
    const renamed = { ...first, id: 'revision-2', revisionNumber: 2, name: 'Library renamed', createdAt: '2026-10-28T10:00:00Z', verificationSourceRevisionId: 'revision-1' }
    const moved = { ...renamed, id: 'revision-3', revisionNumber: 3, x: 11.25, cameraPreset: 'LEFT', navigationFingerprint: 'bb', navigationStatus: 'FAIL', verificationSourceRevisionId: 'revision-3', createdAt: '2026-10-29T10:00:00Z' }
    const check = { proposalId: 'proposal-1', mapVersionId: 'map-v1', mapKey: 'library-v1', robotCode: 'amr-01', reason: null, evidenceNote: 'Ghi tại chỗ.', checkedByUserId: 'tech-1', sourceFileSha256: null }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([mapItem])
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response({ ...proposal, currentRevision: 3, revision: moved })
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/history') return response({ proposalId: 'proposal-1', revisions: [moved, first, renamed], verificationRecords: [
        { ...check, id: 'check-1', proposalRevisionId: 'revision-1', revisionNumber: 1, resultCode: 'PASS', verificationMethod: 'POSE_CAPTURE', reached: null, stopped: null, localizationPassed: null, cameraPresetConfirmed: null, checkedAt: '2026-10-27T11:00:00Z' },
        { ...check, id: 'check-3', proposalRevisionId: 'revision-3', revisionNumber: 3, resultCode: 'FAIL', verificationMethod: 'MANUAL_CHECK', reached: true, stopped: true, localizationPassed: true, cameraPresetConfirmed: false, reason: 'Đầu không quay', checkedAt: '2026-10-29T11:00:00Z' },
      ] })
      return response(null)
    }))
    // The history now lives in its own tab, in groups that start closed, newest first (owner's tab layout).
    renderAt('/staff/manage/pois/proposal-1?tab=lich-su')
    const history = await screen.findByRole('region', { name: 'Lịch sử thay đổi' })
    const versions = await within(history).findByText('Phiên bản POI (3)')
    expect(versions.closest('details')).not.toHaveAttribute('open')
    for (const title of ['Phiên bản POI (3)', 'Kết quả kiểm chứng (2)', 'Lịch sử thuyết minh (0)']) fireEvent.click(within(history).getByText(title))
    const saves = await within(history).findAllByText(/^Bản lưu/)
    expect(saves).toHaveLength(3)
    expect(saves[0]).toHaveTextContent('Không đạt · so với bản trước: đổi điều hướng: vị trí, camera')
    expect(saves[1]).toHaveTextContent(/Đạt · giữ kết quả của bản lưu \d\d\/\d\d \d\d:\d\d · so với bản trước: chỉ đổi nội dung \(tên\)/)
    expect(saves[2]).not.toHaveTextContent('so với bản trước')

    expect(within(history).getByText('Ghi pose trực tiếp trên robot')).toBeInTheDocument()
    const steps = within(history).getAllByRole('list', { name: 'Các bước kiểm' })
    expect(steps).toHaveLength(1)
    const items = within(steps[0]).getAllByRole('listitem')
    expect(items.map(item => item.textContent)).toEqual([
      'Robot tới đúng POI: Đạt', 'Robot dừng đúng vị trí: Đạt', 'Định vị đạt: Đạt', expect.stringMatching(/^Đầu camera làm đúng: .+: Không đạt$/)])
    expect(items[3]).toHaveAttribute('data-failed', 'true')
    expect(items[0]).not.toHaveAttribute('data-failed')
    expect(within(history).getAllByText(/^Kết quả cho bản lưu \d\d\/\d\d/)).toHaveLength(2)
  })

  it('keeps a retired POI read-only and offers "Dùng lại"', async () => {
    const retired = { ...proposal, retiredAt: '2026-11-15T05:00:00Z', canReactivate: true, canRetire: false, revision: { ...proposal.revision, navigationStatus: 'PASS', isSubmitted: true } }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([mapItem])
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/reactivate') return response({ ...retired, retiredAt: null, canReactivate: false, canRetire: true, rowVersion: 'CAcGBQQDAgE=' })
      if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response(retired)
      if (url.pathname === '/api/staff/poi-proposals/proposal-1/history') return response({ proposalId: 'proposal-1', revisions: [retired.revision], verificationRecords: [] })
      return response(null)
    }))
    renderAt('/staff/manage/pois/proposal-1')
    expect(await screen.findByText(/POI này đã ngưng dùng\. Tuyến và Tour đã lưu vẫn giữ điểm này/)).toBeInTheDocument()
    expect(screen.getByLabelText('Tên POI')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('X (m)')).toBeDisabled()
    // A retired PASS POI offers only the keep-PASS save, and it is locked.
    expect(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Dùng lại' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/reactivate')).toBe(true))
    const body = JSON.parse(String(requests.find(r => r.url.pathname.endsWith('/reactivate'))!.init?.body))
    expect(body).toEqual({ requestId: expect.any(String), expectedRowVersion: proposal.rowVersion })
    await waitFor(() => expect(screen.queryByText(/POI này đã ngưng dùng\./)).not.toBeInTheDocument())
    expect(screen.getByLabelText('Tên POI')).not.toHaveAttribute('readonly')
  })

  describe('save buttons, toasts and the FAIL banner follow the kind of change', () => {
    beforeEach(() => { useToastStore.setState({ toasts: [] }) })
    const historyGets = () => requests.filter(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/history' && !r.init?.method).length

    it('saves a content-only edit of a passed POI with one button, says the PASS is kept and refreshes the history', async () => {
      const passed = { ...proposal.revision, isSubmitted: true, submittedAt: '2026-10-27T10:02:00Z', navigationStatus: 'PASS' }
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
        if (url.pathname === '/api/maps/versions') return response([eligibleMap])
        if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
        if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response({ ...proposal, revision: passed })
        if (url.pathname === '/api/staff/poi-proposals/proposal-1/history') return response({ proposalId: 'proposal-1', revisions: [passed], verificationRecords: [] })
        if (url.pathname === '/api/staff/poi-proposals/proposal-1/draft') return response({ ...proposal, currentRevision: 2, rowVersion: 'CAcGBQQDAgE=', revision: { ...passed, id: 'revision-2', revisionNumber: 2, purpose: 'Mục đích mới', isSubmitted: false, verificationSourceRevisionId: 'revision-1' } })
        return response(null)
      }))
      renderAt('/staff/manage/pois/proposal-1')
      fireEvent.change(await screen.findByLabelText('Mục đích'), { target: { value: 'Mục đích mới' } })
      await waitFor(() => expect(historyGets()).toBe(1))
      expect(screen.queryByRole('button', { name: /gửi kiểm/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu (giữ kết quả Đạt)' }))

      await waitFor(() => expect(useToastStore.getState().toasts).toContainEqual(expect.objectContaining({ title: 'Đã lưu POI “Library entry”', detail: 'Vẫn đạt kiểm chứng, không cần kiểm lại.' })))
      expect(requests.some(r => r.url.pathname.endsWith('/submit'))).toBe(false)
      await waitFor(() => expect(historyGets()).toBe(2))
    })

    it('offers save-only or send again when the position of a POI sent before changes', async () => {
      renderAt('/staff/manage/pois/proposal-1')
      await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
      fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '10.5' } })
      expect(screen.getByRole('button', { name: 'Lưu, chưa gửi kiểm' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Lưu và gửi kiểm chứng' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Lưu và gửi kiểm lại' }))
      await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/submit')).toBe(true))
      expect(useToastStore.getState().toasts).toContainEqual(expect.objectContaining({ title: 'Đã gửi kiểm lại POI “Library entry”' }))
      expect(JSON.parse(String(requests.find(r => r.url.pathname.endsWith('/draft'))!.init!.body)).draft.x).toBe(10.5)
    })

    it('shows the FAIL in effect on every tab and "Sửa vị trí" opens the position tab', async () => {
      const scrollIntoView = vi.fn()
      Element.prototype.scrollIntoView = scrollIntoView
      renderAt('/staff/manage/pois/proposal-1?tab=lich-su')
      const banner = await screen.findByRole('region', { name: 'Kết quả kiểm chứng không đạt' })
      expect(screen.getByRole('tab', { name: 'Lịch sử' })).toHaveAttribute('aria-selected', 'true')
      expect(await within(banner).findByText('Lý do: POI chưa tới được')).toBeInTheDocument()
      expect(within(within(banner).getByRole('list', { name: 'Bước không đạt' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Robot tới đúng POI'])
      expect(within(banner).getByText(/^Robot amr-01 · ghi lúc \d\d\/\d\d \d\d:\d\d$/)).toBeInTheDocument()

      fireEvent.click(within(banner).getByRole('button', { name: 'Sửa vị trí' }))
      expect(screen.getByRole('tab', { name: 'Vị trí & camera' })).toHaveAttribute('aria-selected', 'true')
      expect(document.getElementById('poi-panel-vi-tri')).not.toHaveAttribute('hidden')
      expect(screen.getByRole('region', { name: 'Kết quả kiểm chứng không đạt' })).toBeInTheDocument()
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    })

    it('shows no FAIL banner for a POI that has not failed', async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = new NativeURL(String(input), 'http://localhost')
        if (url.pathname === '/api/maps/versions') return response([eligibleMap])
        if (url.pathname === '/api/staff/poi-proposals/proposal-1') return response(proposal)
        return response(null)
      }))
      renderAt('/staff/manage/pois/proposal-1')
      expect(await screen.findByText('Đã lưu, chưa gửi kiểm.')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Kết quả kiểm chứng không đạt' })).not.toBeInTheDocument()
    })

    it('shows the heading in radians under the degree field', async () => {
      renderAt('/staff/manage/pois/new')
      fireEvent.change(await screen.findByLabelText('Bản đồ'), { target: { value: 'map-v1' } })
      await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
      expect(screen.queryByText(/^= .+ rad$/)).not.toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Hướng (độ)'), { target: { value: '93' } })
      expect(screen.getByText('= 1.623156 rad')).toBeInTheDocument()
      expect(screen.getByLabelText('Hướng (độ)')).toHaveValue(93)
    })
  })
})
