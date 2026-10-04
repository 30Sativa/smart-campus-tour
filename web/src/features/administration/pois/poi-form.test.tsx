import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPoiFormPage from '../../../routes/admin/AdminPoiFormPage'
import { useAuthStore } from '../../../stores/auth-store'
import { poiQueryKeys } from './hooks'
import type { PoiDetails } from './types'

const firstVersion = 'AQIDBAUGBwg='
const secondVersion = 'CAcGBQQDAgE='

function poiDetails(overrides: Partial<PoiDetails> = {}): PoiDetails {
  return {
    id: 'poi-1', name: 'Library', description: 'Original description', mapKey: 'campus-map-v1', mapFrame: 'map',
    x: 1.25, y: -2.5, yaw: 0, narrationText: null, audioUrl: null, narrationSeconds: null,
    fallbackVideoUrl: null, isActive: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: null,
    rowVersion: firstVersion,
    usage: {
      hasRouteStopReferences: false, hasHistoricalTourReferences: false, hasReadyOrRunningTours: false,
      canEditPose: true, canEditContentAndAvailability: true,
    },
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type FetchHandler = (url: URL, init?: RequestInit) => Response | Promise<Response>

function stubApi(handler: FetchHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input), 'http://localhost'), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/pois/new" element={<AdminPoiFormPage />} />
          <Route path="/admin/pois/:poiId" element={<AdminPoiFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

function fillCreateForm() {
  fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'New library' } })
  fireEvent.change(screen.getByLabelText('MapKey'), { target: { value: 'campus-map-v1' } })
  fireEvent.change(screen.getByLabelText('MapFrame'), { target: { value: 'map' } })
  fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Y (m)'), { target: { value: '0' } })
}

describe('Admin POI form', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'test-access-token', isAuthenticated: true, isAuthReady: true,
      user: { userId: 'admin-id', username: 'admin', role: 'Admin' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('creates with yaw zero and uses the persisted decimal range in browser constraints', async () => {
    let createPayload: Record<string, unknown> | null = null
    stubApi((url, init) => {
      if (url.pathname === '/api/admin/pois' && init?.method === 'POST') {
        createPayload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, message: 'POI created inactive.', data: { id: 'poi-created' }, errors: null })
      }
      if (url.pathname === '/api/admin/pois/poi-created') {
        return jsonResponse({ success: true, message: 'POI retrieved.', data: poiDetails({ id: 'poi-created' }), errors: null })
      }
      return jsonResponse({ success: true, message: 'POIs retrieved.', data: [], pagination: {}, errors: null })
    })
    renderAt('/admin/pois/new')

    fillCreateForm()
    const yaw = screen.getByLabelText('Yaw (rad)') as HTMLInputElement
    expect(yaw).toHaveAttribute('min', '-3.141593')
    expect(yaw).toHaveAttribute('max', '3.141593')
    expect(yaw).toHaveAttribute('step', '0.000001')
    for (const value of ['0', '0.5', '1.570796', '-1.570796']) {
      fireEvent.change(yaw, { target: { value } })
      expect(yaw.validity.valid).toBe(true)
    }
    fireEvent.change(yaw, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo POI không khả dụng' }))

    await waitFor(() => expect(createPayload).not.toBeNull())
    expect(createPayload).toMatchObject({ name: 'New library', yaw: 0 })
  })

  it('keeps dirty fields through a query refetch and submits the original RowVersion on conflict', async () => {
    const original = poiDetails()
    const remote = poiDetails({
      name: 'Another Admin update', description: 'Remote description', yaw: 0.5,
      rowVersion: secondVersion,
    })
    let detailCalls = 0
    let updatePayload: Record<string, unknown> | null = null
    stubApi((url, init) => {
      if (url.pathname === '/api/admin/pois/poi-1' && init?.method === 'PUT') {
        updatePayload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: false, message: 'This POI changed since it was loaded. Reload it and try again.', data: null, errors: null }, 409)
      }
      if (url.pathname === '/api/admin/pois/poi-1') {
        detailCalls += 1
        const data = detailCalls === 1 ? original : remote
        return jsonResponse({ success: true, message: 'POI retrieved.', data, errors: null })
      }
      return jsonResponse({ success: true, message: 'POIs retrieved.', data: [], pagination: {}, errors: null })
    })
    const { client } = renderAt('/admin/pois/poi-1')

    const name = await screen.findByLabelText('Tên POI')
    await waitFor(() => expect(name).toHaveValue('Library'))
    fireEvent.change(name, { target: { value: 'My unsaved edit' } })
    fireEvent.change(screen.getByLabelText('Yaw (rad)'), { target: { value: '0' } })

    await client.invalidateQueries({ queryKey: poiQueryKeys.detail('poi-1') })
    await waitFor(() => expect(detailCalls).toBeGreaterThan(1))
    expect(screen.getByLabelText('Tên POI')).toHaveValue('My unsaved edit')
    expect(screen.getByLabelText('Mô tả')).toHaveValue('Original description')

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(updatePayload).not.toBeNull())
    expect(updatePayload).toMatchObject({ name: 'My unsaved edit', yaw: 0, expectedRowVersion: firstVersion })
    expect(await screen.findByText('This POI changed since it was loaded. Reload it and try again.')).toBeInTheDocument()
    expect(screen.getByLabelText('Tên POI')).toHaveValue('My unsaved edit')
  })

  it('does not let a locked stored yaw block a content-only edit', async () => {
    const locked = poiDetails({
      yaw: 3.141593,
      usage: {
        hasRouteStopReferences: true, hasHistoricalTourReferences: false, hasReadyOrRunningTours: false,
        canEditPose: false, canEditContentAndAvailability: true,
      },
    })
    let updatePayload: Record<string, unknown> | null = null
    stubApi((url, init) => {
      if (url.pathname === '/api/admin/pois/poi-1' && init?.method === 'PUT') {
        updatePayload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, message: 'POI updated.', data: null, errors: null })
      }
      if (url.pathname === '/api/admin/pois/poi-1') {
        return jsonResponse({ success: true, message: 'POI retrieved.', data: locked, errors: null })
      }
      return jsonResponse({ success: true, message: 'POIs retrieved.', data: [], pagination: {}, errors: null })
    })
    renderAt('/admin/pois/poi-1')

    const yaw = await screen.findByLabelText('Yaw (rad)')
    expect(yaw).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Mô tả'), { target: { value: 'Updated copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    await waitFor(() => expect(updatePayload).not.toBeNull())
    expect(updatePayload).toMatchObject({ description: 'Updated copy', yaw: 3.141593 })
  })
})
