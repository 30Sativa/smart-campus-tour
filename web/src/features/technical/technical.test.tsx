import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TechnicalConfirmationsPage from '../../routes/technical/TechnicalConfirmationsPage'
import TechnicalPoiImportPage from '../../routes/technical/TechnicalPoiImportPage'
import TechnicalMapsPage from '../../routes/technical/TechnicalMapsPage'
import { useAuthStore } from '../../stores/auth-store'
import { useToastStore } from '../../components/ui/toast-store'

const map = {
  id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1',
  packageFileName: 'library-v1.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z',
}
const mapItem = { map, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null,
  preparationEvidence: { id: 'check-1', mapVersionId: map.id, robotCode: 'amr-01', packageSha256: 'a'.repeat(64), localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Fixture evidence', checkedAt: '2026-10-27T10:00:00Z' } }
const proposal = {
  id: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=',
  revision: { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Library', purpose: 'Entrance', description: null, x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:01:00Z', navigationStatus: 'NOT_CHECKED' },
}
const queueItem = { proposalId: proposal.id, currentRevision: proposal.currentRevision, rowVersion: proposal.rowVersion, revision: proposal.revision }
const response = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []
let physicalRobots = [{ id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01' }]
let mapAreas = [{ areaKey: 'library', displayName: 'Library' }]
let failMapAreaLookup = false
let failDeploymentOnce = false
let failRobotLookup = false

function renderPage(page: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{page}</QueryClientProvider>)
}

describe('Technical Staff API integration', () => {
  beforeEach(() => {
    requests = []
    physicalRobots = [{ id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01' }]
    mapAreas = [{ areaKey: 'library', displayName: 'Library' }]
    failMapAreaLookup = false
    failDeploymentOnce = false
    failRobotLookup = false
    useToastStore.setState({ toasts: [] })
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      requests.push({ url, init })
      if (url.pathname === '/api/maps/versions' && init?.method !== 'POST') return response([mapItem])
      if (url.pathname === '/api/technical/map-areas') return failMapAreaLookup
        ? new Response(JSON.stringify({ success: false, message: 'Area lookup unavailable.' }), { status: 503 })
        : response(mapAreas)
      if (url.pathname === '/api/technical/physical-robots') return failRobotLookup
        ? new Response(JSON.stringify({ success: false, message: 'Robot lookup unavailable.' }), { status: 503 })
        : response(physicalRobots)
      if (url.pathname === '/api/technical/poi-verifications') return response([queueItem])
      if (url.pathname === '/api/technical/map-versions' && init?.method === 'POST') return response({ ...map, versionNumber: 2, mapKey: 'library-v2' })
      if (url.pathname === '/api/technical/map-versions/map-v1/deployment-checks' && init?.method === 'POST') {
        if (failDeploymentOnce) { failDeploymentOnce = false; return new Response(JSON.stringify({ success: false, message: 'Temporary server error.' }), { status: 503 }) }
        return response({ id: 'check-1', mapVersionId: 'map-v1', robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Checked', checkedAt: '2026-10-27T10:00:00Z' })
      }
      if (url.pathname.endsWith('/verification')) return response({ id: 'verification-1' })
      return response(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('lists real map versions and posts manual deployment evidence to the map-version endpoint', async () => {
    renderPage(<TechnicalMapsPage />)
    expect(await screen.findByText('Quản lý bản đồ')).toBeInTheDocument()
    expect(await screen.findByText('Library')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Khu vực' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Mã khu vực' })).toBeInTheDocument()
    expect(screen.getByText('Đã có kiểm tra kỹ thuật đạt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    await screen.findByRole('option', { name: /AMR 01 · amr-01/ })
    fireEvent.change(await screen.findByLabelText('Robot kiểm tra'), { target: { value: 'amr-01' } })
    fireEvent.click(screen.getByLabelText('Localization đạt'))
    fireEvent.click(screen.getByLabelText('Map hiển thị đúng'))
    fireEvent.change(screen.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Checked in person' } })
    failDeploymentOnce = true
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await screen.findByText('Temporary server error.')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' }))
    await waitFor(() => expect(requests.filter(item => item.url.pathname === '/api/technical/map-versions/map-v1/deployment-checks' && item.init?.method === 'POST')).toHaveLength(2))
    const calls = requests.filter(item => item.url.pathname.endsWith('/deployment-checks') && item.init?.method === 'POST')
    const call = calls[0]
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true })
    expect(JSON.parse(String(calls[1].init?.body)).requestId).toBe(JSON.parse(String(call.init?.body)).requestId)
  })

  it('uploads a new map version into the selected existing area and reports the server version', async () => {
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tải lên bản đồ mới' }))
    fireEvent.click(screen.getByLabelText('Khu vực đã có'))
    await screen.findByRole('option', { name: /Library · library/ })
    fireEvent.click(screen.getByLabelText('Khu vực mới'))
    fireEvent.change(screen.getByLabelText('Mã khu vực'), { target: { value: 'library' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Chuyển sang “Khu vực đã có”')
    expect(screen.getByRole('button', { name: 'Tải lên bản đồ' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Khu vực đã có'))
    await screen.findByRole('option', { name: /Library · library/ })
    fireEvent.change(screen.getByLabelText('Chọn khu vực'), { target: { value: 'library' } })
    expect(screen.getByLabelText('Chọn khu vực')).toHaveValue('library')
    expect(screen.queryByLabelText('Mã khu vực')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tên khu vực')).not.toBeInTheDocument()
    const fileInput = screen.getByLabelText('Package map (.zip)') as HTMLInputElement
    const file = new File(['zip'], 'new-map.zip', { type: 'application/zip' })
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] })
    fireEvent.change(fileInput)
    const uploadButton = screen.getByRole('button', { name: 'Tải lên bản đồ' })
    expect(uploadButton).not.toBeDisabled()
    fireEvent.submit(document.getElementById('map-upload-form')!)
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/map-versions' && item.init?.method === 'POST')).toBe(true))
    const call = requests.find(item => item.url.pathname === '/api/technical/map-versions' && item.init?.method === 'POST')!
    const form = call.init?.body as FormData
    expect(form.get('areaKey')).toBe('library')
    expect(form.get('areaName')).toBe('Library')
    expect(form.get('requestId')).toBeTruthy()
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Đã lưu library-v2 · v2')
  })

  it('shows an actionable empty robot state and keeps deployment save disabled', async () => {
    physicalRobots = []
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    expect(await screen.findByText('Chưa có robot vật lý được đăng ký. Cần hoàn tất cấu hình robot trước khi ghi kết quả kiểm tra.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu kết quả kiểm tra' })).toBeDisabled()
  })

  it('shows area lookup errors and retries the complete catalog', async () => {
    failMapAreaLookup = true
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Tải lên bản đồ mới' }))
    fireEvent.click(screen.getByLabelText('Khu vực đã có'))
    expect(await screen.findByText('Area lookup unavailable.')).toBeInTheDocument()
    failMapAreaLookup = false
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại danh sách khu vực' }))
    expect(await screen.findByRole('option', { name: /Library · library/ })).toBeInTheDocument()
  })

  it('shows registered robot lookup errors and retries before saving a check', async () => {
    failRobotLookup = true
    renderPage(<TechnicalMapsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ghi kết quả kiểm tra' }))
    expect(await screen.findByText('Robot lookup unavailable.')).toBeInTheDocument()
    failRobotLookup = false
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại danh sách robot' }))
    expect(await screen.findByRole('option', { name: /AMR 01 · amr-01/ })).toBeInTheDocument()
  })

  it('records a POI check against its submitted revision and row version', async () => {
    renderPage(<TechnicalPoiImportPage />)
    expect(await screen.findByText('Library')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kết quả' }))
    fireEvent.change(screen.getByLabelText('Robot vật lý'), { target: { value: 'amr-01' } })
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã đi kiểm tra tại chỗ.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/poi-proposals/proposal-1/revisions/1/verification')).toBe(true))
    expect(requests.some(item => item.url.pathname === '/api/technical/poi-verifications')).toBe(true)
    const call = requests.find(item => item.url.pathname.endsWith('/verification'))!
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ expectedRevisionNumber: 1, expectedRowVersion: proposal.rowVersion, resultCode: 'PASS', robotCode: 'amr-01' })
  })

  it('distinguishes the backend test-run contract from the unwired workspace and physical proof', () => {
    renderPage(<TechnicalConfirmationsPage />)
    expect(screen.getByText(/Backend đã có API queue và test-run/)).toBeInTheDocument()
    expect(screen.getByText(/màn hình này chưa được nối đầy đủ/)).toBeInTheDocument()
    expect(screen.getByText(/không chứng minh robot đã chạy thật/)).toBeInTheDocument()
    expect(screen.getByText(/không tự làm tuyến READY/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument()
  })
})
