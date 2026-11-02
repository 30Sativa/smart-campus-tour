import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TechnicalPoiFileImportPage from '../../routes/technical/TechnicalPoiFileImportPage'
import TechnicalPoiImportPage from '../../routes/technical/TechnicalPoiImportPage'
import { useAuthStore } from '../../stores/auth-store'
import { useToastStore } from '../../components/ui/toast-store'

const map = { id: 'map-v1', areaKey: 'floor6', areaName: 'Tầng 6', versionNumber: 2, mapKey: 'floor6-v2' }
const robot = { id: 'robot-1', robotCode: 'amr-01', displayName: 'AMR 01', connectionStatus: 'CONNECTED', latestDeployedMapKey: 'floor6-v2', latestDeploymentPassed: true }
const okFile = { fileName: 'poi_02.yaml', fileSha256: 'a'.repeat(64), poiId: 'POI_02', name: 'POI 02', x: 29.692, y: -5.439, yaw: -0.291, verified: true, action: 'CREATE', errorCode: null, errorMessage: null }
const badFile = { ...okFile, fileName: 'poi_03.yaml', fileSha256: 'b'.repeat(64), poiId: 'POI_03', action: null, errorCode: 'FRAME_MISMATCH', errorMessage: 'Tệp dùng frame odom, phiên bản bản đồ dùng frame map.' }

const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 300, message: 'OK', data, errors: null }), { status, headers: { 'Content-Type': 'application/json' } })
let previewFiles: unknown[] = [okFile]
let importRefusal: Response | null = null
let requests: { path: string; body?: FormData }[] = []

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TechnicalPoiFileImportPage /></MemoryRouter></QueryClientProvider>)
}

async function pickEverything() {
  renderPage()
  await screen.findByRole('option', { name: 'Tầng 6 · v2 · floor6' })
  fireEvent.change(screen.getByLabelText('Phiên bản bản đồ'), { target: { value: 'map-v1' } })
  await screen.findByRole('option', { name: /amr-01/ })
  fireEvent.change(screen.getByLabelText('Robot đã ghi pose'), { target: { value: 'amr-01' } })
  const input = document.getElementById('import-files') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['id: POI_02'], 'poi_02.yaml')] } })
}

describe('Technical POI file import', () => {
  beforeEach(() => {
    previewFiles = [okFile]
    importRefusal = null
    requests = []
    useToastStore.setState({ toasts: [] })
    useAuthStore.setState({ status: 'authenticated', accessToken: 'token', role: 'TechnicalStaff' } as never)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://test.local').pathname
      requests.push({ path, body: init?.body as FormData })
      if (path === '/api/maps/versions') return envelope([{ map, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, currentlyDeployedOn: [] }])
      if (path === '/api/technical/physical-robots') return envelope([robot])
      if (path === '/api/technical/poi-imports/preview') return envelope({ mapVersionId: map.id, robotCode: robot.robotCode, canImport: previewFiles.every(file => !(file as typeof okFile).errorCode), files: previewFiles })
      if (path === '/api/technical/poi-imports') return importRefusal ?? envelope({ requestId: 'r', mapVersionId: map.id, createdProposalIds: ['p-1'], updatedProposalIds: [], files: [okFile] })
      return envelope(null, 404)
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('previews the server verdict, then imports with the evidence note', async () => {
    await pickEverything()
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))

    expect(await screen.findByText('POI_02')).toBeInTheDocument()
    expect(screen.getByText('Tạo POI mới')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nhập' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Ghi tại Tầng 6.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Nhập' }))

    expect(await screen.findByRole('link', { name: 'Mở danh sách POI' })).toHaveAttribute('href', '/technical/poi-import')
    const sent = requests.find(item => item.path === '/api/technical/poi-imports')!.body!
    expect(sent.get('evidenceNote')).toBe('Ghi tại Tầng 6.')
    expect(sent.get('mapVersionId')).toBe('map-v1')
    expect(sent.get('robotCode')).toBe('amr-01')
    expect(sent.get('requestId')).toBeTruthy()
    expect(sent.getAll('files')).toHaveLength(1)
  })

  it('shows each file error and keeps Nhập off', async () => {
    previewFiles = [okFile, badFile]
    await pickEverything()
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))

    expect(await screen.findByText(badFile.errorMessage)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Ghi chú' } })
    expect(screen.getByRole('button', { name: 'Nhập' })).toBeDisabled()
  })

  it('refreshes the preview when the server refuses the import', async () => {
    importRefusal = envelope(null, 409)
    await pickEverything()
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await screen.findByText('POI_02')
    previewFiles = [badFile]
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Ghi chú' } })
    fireEvent.click(screen.getByRole('button', { name: 'Nhập' }))

    expect(await screen.findByText(badFile.errorMessage)).toBeInTheDocument()
    await waitFor(() => expect(requests.filter(item => item.path === '/api/technical/poi-imports/preview')).toHaveLength(2))
  })

  it('shows a pose-capture result without inventing observations', async () => {
    const revision = { id: 'rev-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'floor6-v2', name: 'POI 02', purpose: 'Nhập từ tệp', description: null, narrationText: null, fallbackVideoUrl: null, x: 1, y: 1, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-11-01T00:00:00Z', isSubmitted: true, submittedAt: '2026-11-01T00:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'rev-1', verificationMethod: 'POSE_CAPTURE' }
    const record = { id: 'check-1', proposalId: 'p-1', proposalRevisionId: 'rev-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'floor6-v2', robotCode: 'amr-01', resultCode: 'PASS', reached: null, stopped: null, localizationPassed: null, cameraPresetConfirmed: null, reason: null, evidenceNote: 'Ghi tại Tầng 6.', checkedByUserId: 'u', checkedAt: '2026-11-01T00:00:00Z', verificationMethod: 'POSE_CAPTURE', sourceFileSha256: 'c'.repeat(64) }
    const realFetch = vi.mocked(fetch).getMockImplementation()!
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), 'http://test.local').pathname
      if (path === '/api/technical/poi-verifications') return envelope([])
      if (path === '/api/staff/poi-proposals') return envelope([{ id: 'p-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=', revision, sourcePoiId: 'POI_02' }])
      if (path === '/api/staff/poi-proposals/p-1/history') return envelope({ proposalId: 'p-1', revisions: [revision], verificationRecords: [record] })
      return realFetch(input, init)
    }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TechnicalPoiImportPage /></MemoryRouter></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: /Đã đạt\s*1/ }))
    expect(await screen.findByText('Ghi pose trực tiếp trên robot')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xem kết quả' }))

    expect(await screen.findByText(/Không có quan sát tới nơi/)).toBeInTheDocument()
    expect(screen.getByText(/SHA-256 c{64}/)).toBeInTheDocument()
    expect(screen.queryByText(/Chưa đạt:/)).not.toBeInTheDocument()
  })

  it('drops the old verdict once the selection changes', async () => {
    await pickEverything()
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await screen.findByText('POI_02')

    fireEvent.change(document.getElementById('import-files') as HTMLInputElement, { target: { files: [new File(['x'], 'other.yaml')] } })

    expect(screen.queryByText('POI_02')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nhập' })).not.toBeInTheDocument()
  })
})
