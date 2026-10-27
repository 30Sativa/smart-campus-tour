import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TechnicalConfirmationsPage from '../../routes/technical/TechnicalConfirmationsPage'
import TechnicalPoiImportPage from '../../routes/technical/TechnicalPoiImportPage'
import TechnicalMapsPage from '../../routes/technical/TechnicalMapsPage'
import { useAuthStore } from '../../stores/auth-store'

const map = {
  id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1',
  packageFileName: 'library-v1.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm',
  imageWidth: 100, imageHeight: 80, resolution: 0.05, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z',
}
const proposal = {
  id: 'proposal-1', currentRevision: 1, rowVersion: 'AAAAAAAAAAA=',
  revision: { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Library', purpose: 'Entrance', description: null, x: 1, y: 2, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:01:00Z', navigationStatus: 'NOT_CHECKED' },
}
const response = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []

function renderPage(page: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{page}</QueryClientProvider>)
}

describe('Technical Staff API integration', () => {
  beforeEach(() => {
    requests = []
    useAuthStore.getState().setAuth('token', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      requests.push({ url, init })
      if (url.pathname === '/api/maps/versions' && init?.method !== 'POST') return response([{ map, latestDeployment: null }])
      if (url.pathname === '/api/staff/poi-proposals') return response([proposal])
      if (url.pathname === '/api/technical/map-versions' && init?.method === 'POST') return response(map)
      if (url.pathname === '/api/technical/map-versions/map-v1/deployment-checks') return response({ id: 'check-1', mapVersionId: 'map-v1', robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true, passed: true, evidenceNote: 'Checked', checkedAt: '2026-10-27T10:00:00Z' })
      if (url.pathname.endsWith('/verification')) return response({ id: 'verification-1' })
      return response(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('lists real map versions and posts manual deployment evidence to the map-version endpoint', async () => {
    renderPage(<TechnicalMapsPage />)
    expect(await screen.findByText('library-v1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kiểm tra' }))
    fireEvent.change(screen.getByLabelText('Mã robot'), { target: { value: 'amr-01' } })
    fireEvent.click(screen.getByLabelText('Localization đạt'))
    fireEvent.click(screen.getByLabelText('Map hiển thị đúng'))
    fireEvent.change(screen.getByLabelText('Bằng chứng kiểm tra'), { target: { value: 'Checked in person' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kiểm tra' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/map-versions/map-v1/deployment-checks' && item.init?.method === 'POST')).toBe(true))
    const call = requests.find(item => item.url.pathname.endsWith('/deployment-checks') && item.init?.method === 'POST')!
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ robotCode: 'amr-01', packageSha256: map.packageSha256, localizationPassed: true, displayPassed: true })
  })

  it('records a POI check against its submitted revision and row version', async () => {
    renderPage(<TechnicalPoiImportPage />)
    expect(await screen.findByText('Library')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ghi kết quả' }))
    fireEvent.change(screen.getByLabelText('Robot vật lý'), { target: { value: 'amr-01' } })
    fireEvent.change(screen.getByLabelText('Ghi chú bằng chứng'), { target: { value: 'Đã đi kiểm tra tại chỗ.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả' }))
    await waitFor(() => expect(requests.some(item => item.url.pathname === '/api/technical/poi-proposals/proposal-1/revisions/1/verification')).toBe(true))
    const call = requests.find(item => item.url.pathname.endsWith('/verification'))!
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ expectedRevisionNumber: 1, expectedRowVersion: proposal.rowVersion, resultCode: 'PASS', robotCode: 'amr-01' })
  })

  it('does not present route certification as completed while its backend contract is pending', () => {
    renderPage(<TechnicalConfirmationsPage />)
    expect(screen.getByText(/Route certification vẫn pending/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument()
  })
})
