import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageRouteCatalogPage from '../../../routes/staff/manage/StaffManageRouteCatalogPage'
import StaffManageRouteDetailsPage from '../../../routes/staff/manage/StaffManageRouteDetailsPage'
import StaffManageRouteFormPage from '../../../routes/staff/manage/StaffManageRouteFormPage'
import { useAuthStore } from '../../../stores/auth-store'

const map = { id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1', packageFileName: 'library.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm', imageWidth: 2, imageHeight: 2, resolution: 0.5, originX: 10, originY: 20, originYaw: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z' }
const proposals = [
  { id: 'p-pass', currentRevision: 2, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-pass', revisionNumber: 2, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Verified entrance', purpose: 'Entry', description: null, x: 10.2, y: 20.4, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-pass' } },
  { id: 'p-pending', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-pending', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Pending POI', purpose: 'Pending', description: null, x: 1, y: 1, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'NOT_CHECKED', verificationSourceRevisionId: null } },
  { id: 'p-other-map', currentRevision: 1, rowVersion: 'AQIDBAUGBwg=', revision: { id: 'poi-rev-other', revisionNumber: 1, mapVersionId: 'map-v2', mapKey: 'library-v2', name: 'Other map POI', purpose: 'Other', description: null, x: 2, y: 2, yaw: 0, cameraPreset: 'FRONT', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: 'poi-rev-other' } },
]
const route = { routeId: 'route-1', revisionId: 'route-rev-1', revisionNumber: 1, name: 'Library tour', description: null, mapVersionId: 'map-v1', mapKey: 'library-v1', mapPackageSha256: 'a'.repeat(64), startX: 10, startY: 20, startYaw: 0, endMode: 'LAST_POI', endX: null, endY: null, endYaw: null, configurationFingerprint: 'c'.repeat(64), isSubmitted: false, verificationStatus: 'NOT_CHECKED', effectiveTestRunId: null, durationStatus: 'INCOMPLETE_CONTENT_AUDIO_DATA', dwellDurationSeconds: 30, stops: [{ poiRevisionId: 'poi-rev-pass', sourcePoiVerificationRecordId: 'verify-1', stopOrder: 1, dwellSeconds: 30, headSteps: [{ preset: 'FRONT', holdSeconds: 10 }], name: 'Verified entrance', x: 10.2, y: 20.4, yaw: 0, cameraPreset: 'FRONT' }], testRuns: [], revisionHistory: [{ revisionId: 'route-rev-1', revisionNumber: 1, mapVersionId: 'map-v1', mapPackageSha256: 'a'.repeat(64), configurationFingerprint: 'c'.repeat(64), isSubmitted: false, verificationStatus: 'NOT_CHECKED', effectiveTestRunId: null, createdAt: '2026-10-27T10:00:00Z' }], eligibilityIssues: ['INCOMPLETE_CONTENT_AUDIO_DATA'] }
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, message: 'OK', data, pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 }, errors: null }), { status, headers: { 'Content-Type': 'application/json' } })
let requests: Array<{ url: URL; init?: RequestInit }> = []

function renderAt(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/manage/routes" element={<StaffManageRouteCatalogPage />} />
    <Route path="/staff/manage/routes/new" element={<StaffManageRouteFormPage />} />
    <Route path="/staff/manage/routes/:routeId" element={<StaffManageRouteDetailsPage />} />
    <Route path="/staff/manage/routes/:routeId/edit" element={<StaffManageRouteFormPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('Staff versioned Route workflow', () => {
  beforeEach(() => {
    requests = []
    useAuthStore.setState({ isAuthReady: true, isAuthenticated: true, accessToken: 'staff-token', user: { userId: 'staff-1', username: 'staff', role: 'Staff' } })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost'); requests.push({ url, init })
      if (url.pathname === '/api/maps/versions') return response([{ map, latestDeployment: null }])
      if (url.pathname === '/api/staff/poi-proposals') return response(proposals)
      if (url.pathname === '/api/routes' && init?.method !== 'POST') return response([route])
      if (url.pathname === '/api/staff/routes' && init?.method === 'POST') return response(route)
      if (url.pathname === '/api/routes/route-1/revisions') return response(route)
      if (url.pathname === '/api/staff/routes/route-1/revisions/route-rev-1/submit') return response({ ...route, isSubmitted: true })
      return response(null)
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('selects only PASS POI revisions for the chosen map and creates/submits the exact route revision', async () => {
    renderAt('/staff/manage/routes/new')
    fireEvent.change(await screen.findByLabelText('Tên tuyến'), { target: { value: 'Library tour' } })
    fireEvent.change(screen.getByLabelText('Map version'), { target: { value: 'map-v1' } })
    expect(await screen.findByText('Verified entrance')).toBeInTheDocument()
    expect(screen.queryByText('Pending POI')).not.toBeInTheDocument()
    expect(screen.queryByText('Other map POI')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu revision nháp' }))
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    const create = requests.find(r => r.url.pathname === '/api/staff/routes' && r.init?.method === 'POST')!
    const createBody = JSON.parse(String(create.init?.body))
    expect(createBody).toMatchObject({ mapVersionId: 'map-v1', expectedCurrentRevision: 0, stops: [{ poiRevisionId: 'poi-rev-pass', dwellSeconds: 30 }] })
    expect(createBody.requestId).toBeTruthy()
    expect(requests.some(r => r.url.pathname === '/api/technical/poi-verifications')).toBe(false)
    expect(screen.getByText(/duration.*chưa đủ điều kiện lập lịch/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gửi kiểm chứng tuyến' }))
    await waitFor(() => expect(requests.some(r => r.url.pathname === '/api/staff/routes/route-1/revisions/route-rev-1/submit')).toBe(true))
    const submit = requests.find(r => r.url.pathname.endsWith('/submit'))!
    expect(JSON.parse(String(submit.init?.body))).toMatchObject({ expectedCurrentRevision: 1 })
  })

  it('reads the requested revision ID from the route history link', async () => {
    renderAt('/staff/manage/routes/route-1?revisionId=route-rev-old')
    expect(await screen.findByRole('heading', { name: 'Library tour' })).toBeInTheDocument()
    const detail = requests.find(r => r.url.pathname === '/api/routes/route-1/revisions')!
    expect(detail.url.searchParams.get('revisionId')).toBe('route-rev-old')
  })
})
