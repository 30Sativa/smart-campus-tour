import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPoiFormPage from '../../../routes/admin/AdminPoiFormPage'
import AdminPoisPage from '../../../routes/admin/AdminPoisPage'
import { useAuthStore } from '../../../stores/auth-store'
import { poiQueryKeys } from './hooks'
import type { PoiDetails } from './types'
import { installSvgLayout, pointerAt } from './map/picker-test-support'

vi.mock('./map/load-map-image', () => ({ loadMapImage: vi.fn(async () => ({ pixels: null })) }))
let restoreLayout: () => void

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

function HistoryControls() {
  const navigate = useNavigate()
  const location = useLocation()
  return <><button onClick={() => navigate(-1)}>Browser Back</button><div aria-label="Current path">{location.pathname}</div></>
}

function renderAt(path: string, showCatalog = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={showCatalog ? ['/admin/pois', path] : [path]}>
        {showCatalog && <HistoryControls />}
        <Routes>
          <Route path="/admin/pois" element={showCatalog ? <AdminPoisPage /> : <div>Danh sách POI</div>} />
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
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' }))
  fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Y (m)'), { target: { value: '0' } })
}

function reviewCreate() {
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
}

function openPoseStep() {
  fireEvent.click(screen.getByRole('button', { name: /Vị trí & hướng/ }))
}

describe('Admin POI form', () => {
  beforeEach(() => {
    restoreLayout = installSvgLayout()
    useAuthStore.setState({
      accessToken: 'test-access-token', isAuthenticated: true, isAuthReady: true,
      user: { userId: 'admin-id', username: 'admin', role: 'Admin' },
    })
  })

  afterEach(() => {
    restoreLayout()
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('creates with yaw zero and uses the persisted decimal range in browser constraints', async () => {
    let createPayload: Record<string, unknown> | null = null
    const fetchMock = stubApi((url, init) => {
      if (url.pathname === '/api/admin/pois' && init?.method === 'POST') {
        createPayload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, message: 'POI created inactive.', data: { id: 'poi-created' }, errors: null })
      }
      if (url.pathname === '/api/admin/pois/poi-created') {
        return jsonResponse({ success: true, message: 'POI retrieved.', data: poiDetails({ id: 'poi-created' }), errors: null })
      }
      return jsonResponse({ success: true, data: [poiDetails({ id: 'poi-created', name: 'New library' })], pagination: { page: 1, pageSize: 20, totalPages: 1, totalItems: 1 } })
    })
    const { client } = renderAt('/admin/pois/new', true)
    client.setQueryDefaults(poiQueryKeys.all, { staleTime: Infinity })
    client.setQueryData(poiQueryKeys.list({ sort: 'name', page: 1, size: 20 }), {
      data: [], pagination: { page: 1, pageSize: 20, totalPages: 1, totalItems: 0 },
    })

    fillCreateForm()
    expect(screen.queryByRole('button', { name: 'Tạo POI không khả dụng' })).not.toBeInTheDocument()
    const yaw = screen.getByLabelText('Yaw (rad)') as HTMLInputElement
    expect(yaw).toHaveAttribute('min', '-3.141593')
    expect(yaw).toHaveAttribute('max', '3.141593')
    expect(yaw).toHaveAttribute('step', '0.000001')
    for (const value of ['0', '0.5', '1.570796', '-1.570796']) {
      fireEvent.change(yaw, { target: { value } })
      expect(yaw.validity.valid).toBe(true)
      expect(yaw).toBeVisible()
    }
    fireEvent.change(yaw, { target: { value: '0' } })
    reviewCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo POI không khả dụng' }))

    await waitFor(() => expect(createPayload).not.toBeNull())
    expect(createPayload).toMatchObject({ name: 'New library', mapKey: 'map2-v2', mapFrame: 'map', yaw: 0 })
    expect(await screen.findByRole('heading', { name: 'Quản lý POI' })).toBeVisible()
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/admin/pois')
    expect(screen.getByRole('status')).toHaveTextContent('Đã tạo POI “New library” thành công.')
    expect(await screen.findByRole('link', { name: 'New library' })).toHaveAttribute('href', '/admin/pois/poi-created')
    expect(screen.queryByLabelText('Tên POI')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/admin/pois/poi-created'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }))
    expect(screen.queryByText(/Đã tạo POI/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New library' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browser Back' }))
    await waitFor(() => expect(screen.getByLabelText('Current path')).toHaveTextContent('/admin/pois'))
    expect(screen.queryByLabelText('Tên POI')).not.toBeInTheDocument()
  })

  it('keeps the create draft and displays an error without a success notice when the API rejects it', async () => {
    stubApi(() => jsonResponse({ success: false, message: 'POI creation failed.', data: null, errors: null }, 400))
    renderAt('/admin/pois/new', true)
    fillCreateForm()
    fireEvent.change(screen.getByLabelText('Yaw (rad)'), { target: { value: '0' } })
    reviewCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo POI không khả dụng' }))
    expect(await screen.findByText('POI creation failed.')).toBeVisible()
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/admin/pois/new')
    expect(screen.getByLabelText('Tên POI')).toHaveValue('New library')
    expect(screen.getByLabelText('X (m)')).toHaveValue(0)
    expect(screen.queryByText(/Đã tạo POI/)).not.toBeInTheDocument()
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
      mapKey: 'map2-v1',
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

  it('creates from map position and heading, saving the quantized ROS pose', async () => {
    let payload: Record<string, unknown> | null = null
    stubApi((url, init) => {
      if (url.pathname === '/api/admin/pois' && init?.method === 'POST') {
        payload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, data: { id: 'created' } })
      }
      return jsonResponse({ success: true, data: poiDetails({ id: 'created', mapKey: 'map2-v2', x: 5.025, y: -5.025, yaw: 1.570796 }) })
    })
    renderAt('/admin/pois/new')
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Map-picked POI' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.pointerDown(svg, pointerAt(svg, 406.5, 527.5))
    expect(screen.getByLabelText('X (m)')).toHaveValue(5.025)
    expect(screen.getByLabelText('Y (m)')).toHaveValue(-5.025)
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(screen.getByText('Nhập x, y và yaw bằng số hợp lệ.')).toBeVisible()
    expect(payload).toBeNull()
    fireEvent.pointerDown(svg, pointerAt(svg, 406.5, 507.5))
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(1.570796)
    reviewCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo POI không khả dụng' }))
    await waitFor(() => expect(payload).toMatchObject({ mapKey: 'map2-v2', mapFrame: 'map', x: 5.025, y: -5.025, yaw: 1.570796 }))
  })

  it.each(['new', 'poi-1'])('preserves exact manual coordinates when switching methods for %s', async (id) => {
    const fetchMock = stubApi(() => jsonResponse({ success: true, data: poiDetails({ mapKey: 'map2-v2' }) }))
    renderAt(`/admin/pois/${id}`)
    const name = await screen.findByLabelText('Tên POI')
    if (id === 'new') fireEvent.change(name, { target: { value: 'Tour Start' } })
    openPoseStep()
    expect(screen.getByRole('radio', { name: 'Chọn trên bản đồ' })).toBeChecked()
    expect(screen.getByLabelText('X (m)')).not.toBeVisible()

    fireEvent.click(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' }))
    expect(screen.queryByRole('group', { name: 'Bản đồ occupancy ROS' })).not.toBeInTheDocument()
    for (const [field, value] of [['X (m)', '-0.319'], ['Y (m)', '-0.535'], ['Yaw (rad)', '0.077']]) {
      expect(screen.getByLabelText(field)).toBeVisible()
      fireEvent.change(screen.getByLabelText(field), { target: { value } })
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Chọn trên bản đồ' }))
    await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(screen.getByRole('button', { name: 'Di chuyển bản đồ' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('X (m)')).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Nhập / chỉnh tọa độ' }))
    expect(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' })).toBeChecked()
    expect(screen.getByLabelText('X (m)')).toHaveValue(-0.319)
    expect(screen.getByLabelText('Y (m)')).toHaveValue(-0.535)
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(0.077)
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'PUT')).toHaveLength(0)
  })

  it('finishes an incomplete map selection manually and saves the same position', async () => {
    let payload: Record<string, unknown> | null = null
    stubApi((_url, init) => {
      if (init?.method === 'POST') {
        payload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, data: { id: 'created' } })
      }
      return jsonResponse({ success: true, data: poiDetails({ id: 'created' }) })
    })
    renderAt('/admin/pois/new')
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Mixed entry' } })
    openPoseStep()
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    fireEvent.pointerDown(svg, pointerAt(svg, 406.5, 527.5))
    fireEvent.click(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' }))
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(null)
    fireEvent.change(screen.getByLabelText('Yaw (rad)'), { target: { value: '0.077' } })
    reviewCreate()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo POI không khả dụng' }))
    await waitFor(() => expect(payload).toMatchObject({ x: 5.025, y: -5.025, yaw: 0.077 }))
  })

  it('keeps manual entry selected after changing maps and requires a new pose', async () => {
    const fetchMock = stubApi(() => jsonResponse({ success: true, data: poiDetails({ mapKey: 'map2-v2' }) }))
    renderAt('/admin/pois/poi-1')
    await screen.findByLabelText('Tên POI')
    openPoseStep()
    fireEvent.click(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' }))
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map2-v1' } })
    expect(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' })).toBeChecked()
    expect(screen.getByLabelText('X (m)')).toBeVisible()
    expect(screen.getByLabelText('X (m)')).toHaveValue(null)
    expect(screen.getByLabelText('Y (m)')).toHaveValue(null)
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(null)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Nhập x, y và yaw bằng số hợp lệ.')).toBeVisible()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  })

  it.each(['new', 'poi-1'])('imports YAML into a %s draft without sending a mutation until Save', async (id) => {
    let payload: Record<string, unknown> | null = null
    const fetchMock = stubApi((_url, init) => {
      if (init?.method === 'POST' || init?.method === 'PUT') {
        payload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, data: { id: 'poi-1' } })
      }
      return jsonResponse({ success: true, data: poiDetails({ mapKey: 'map2-v2' }) })
    })
    renderAt(`/admin/pois/${id}`)
    const name = await screen.findByLabelText('Tên POI')
    if (id === 'new') fireEvent.change(name, { target: { value: 'My POI' } })
    const originalName = (name as HTMLInputElement).value
    openPoseStep()
    fireEvent.click(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' }))
    const file = new File(['id: START\nname: Imported name\nmap_yaml: map2.yaml\nframe_id: map\npose: {x: -0.319, y: -0.535, yaw: 0.077}\nverified: true'], 'poi_start.yaml')
    fireEvent.change(screen.getByLabelText('Chọn file POI YAML'), { target: { files: [file] } })
    expect(screen.getByLabelText('Bản đồ')).toBeDisabled()
    expect(screen.getByLabelText('X (m)')).toBeDisabled()
    if (id !== 'new') expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
    await screen.findByText(/Đã điền tọa độ từ poi_start.yaml/)
    expect(screen.getByLabelText('X (m)')).toHaveValue(-0.319)
    expect(screen.getByLabelText('Y (m)')).toHaveValue(-0.535)
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(0.077)
    expect(screen.getByLabelText('Tên POI')).toHaveValue(originalName)
    expect(screen.getByLabelText('Bản đồ')).toHaveValue('map2-v2')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST' || init?.method === 'PUT')).toHaveLength(0)
    if (id === 'new') reviewCreate()
    fireEvent.click(screen.getByRole('button', { name: id === 'new' ? 'Tạo POI không khả dụng' : 'Lưu thay đổi' }))
    await waitFor(() => expect(payload).toMatchObject({ name: originalName, mapKey: 'map2-v2', mapFrame: 'map', x: -0.319, y: -0.535, yaw: 0.077 }))
    if (id !== 'new') expect(payload).toMatchObject({ expectedRowVersion: firstVersion })
    expect(payload).not.toHaveProperty('verified')
    expect(payload).not.toHaveProperty('quaternion')
  })

  it('keeps the draft untouched on YAML errors and permits retrying the same file', async () => {
    stubApi(() => jsonResponse({ success: true, data: poiDetails({ mapKey: 'map2-v2' }) }))
    renderAt('/admin/pois/poi-1')
    await screen.findByLabelText('Tên POI')
    openPoseStep()
    fireEvent.click(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' }))
    const input = screen.getByLabelText('Chọn file POI YAML')
    fireEvent.change(input, { target: { files: [new File(['map_yaml: map1.yaml\nframe_id: map\npose: {x: 0, y: 0, yaw: 0}'], 'poi.yaml')] } })
    await screen.findByText(/map_yaml không khớp/)
    expect(screen.getByLabelText('X (m)')).toHaveValue(1.25)
    expect(screen.getByLabelText('Y (m)')).toHaveValue(-2.5)
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(0)
    fireEvent.change(input, { target: { files: [new File(['map_yaml: map2.yaml\nframe_id: map\npose: {x: 0, y: 0, yaw: 0}'], 'poi.yaml')] } })
    await screen.findByText(/Đã điền tọa độ từ poi.yaml/)
    expect(screen.queryByText(/map_yaml không khớp/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('X (m)')).toHaveValue(0)
  })

  it.each(['Escape', 'pan'] as const)('shows validation after %s cancels heading with an empty yaw in map entry', async (cancel) => {
    const fetchMock = stubApi(() => jsonResponse({ success: true, data: poiDetails({ mapKey: 'map2-v1' }) }))
    renderAt('/admin/pois/poi-1')
    await screen.findByLabelText('Tên POI')
    openPoseStep()
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' }) as unknown as SVGSVGElement
    const yaw = screen.getByLabelText('Yaw (rad)')
    expect(yaw).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Chọn vị trí' }))
    fireEvent.pointerDown(svg, pointerAt(svg, 406.5, 527.5))
    expect(yaw).toHaveValue(null)
    if (cancel === 'Escape') fireEvent.keyDown(svg, { key: 'Escape' })
    else fireEvent.click(screen.getByRole('button', { name: 'Di chuyển bản đồ' }))
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(await screen.findByText('Nhập x, y và yaw bằng số hợp lệ.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  })

  it('shows validation when a map rebind leaves the pose empty in map entry', async () => {
    const fetchMock = stubApi(() => jsonResponse({ success: true, data: poiDetails() }))
    renderAt('/admin/pois/poi-1')
    await screen.findByText(/Chưa có ảnh cho đúng map\/frame này/)
    openPoseStep()
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map2-v1' } })
    const svg = await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(screen.getByLabelText('Yaw (rad)')).not.toBeVisible()
    fireEvent.keyDown(svg, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Nhập x, y và yaw bằng số hợp lệ.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
  })

  it('keeps unsupported map and pose unchanged for content edits, requiring a new pose on map selection', async () => {
    const original = poiDetails({ mapKey: 'demo-poi-baseline-v1', yaw: 3.141593 })
    let payload: Record<string, unknown> | null = null
    stubApi((_url, init) => {
      if (init?.method === 'PUT') {
        payload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, data: null })
      }
      return jsonResponse({ success: true, data: original })
    })
    renderAt('/admin/pois/poi-1')
    await screen.findByText(/Chưa có ảnh cho đúng map\/frame này/)
    expect(screen.queryByRole('group', { name: 'Bản đồ occupancy ROS' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Mô tả'), { target: { value: 'Content correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(payload).toMatchObject({ mapKey: original.mapKey, x: original.x, y: original.y, yaw: 3.141593, expectedRowVersion: firstVersion }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeEnabled())
    openPoseStep()
    fireEvent.change(screen.getByLabelText('Bản đồ'), { target: { value: 'map2-v1' } })
    expect(screen.getByLabelText('X (m)')).toHaveValue(null)
    expect(screen.getByLabelText('Y (m)')).toHaveValue(null)
    expect(screen.getByLabelText('Yaw (rad)')).toHaveValue(null)
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
  })

  it('does not draw a map2 pose in the wrong frame', async () => {
    stubApi(() => jsonResponse({ success: true, data: poiDetails({ mapKey: 'map2-v1', mapFrame: 'odom' }) }))
    renderAt('/admin/pois/poi-1')
    await screen.findByText(/Chưa có ảnh cho đúng map\/frame này/)
    expect(screen.queryByRole('group', { name: 'Bản đồ occupancy ROS' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('MapFrame')).toHaveValue('odom')
  })

  it('blocks all mutations during a READY/RUNNING lock but leaves the map view usable', async () => {
    stubApi(() => jsonResponse({ success: true, data: poiDetails({
      mapKey: 'map2-v1',
      usage: { hasRouteStopReferences: true, hasHistoricalTourReferences: false, hasReadyOrRunningTours: true, canEditPose: false, canEditContentAndAvailability: false },
    }) }))
    renderAt('/admin/pois/poi-1')
    await screen.findByLabelText('Tên POI')
    openPoseStep()
    await screen.findByRole('group', { name: 'Bản đồ occupancy ROS' })
    expect(screen.getByLabelText('Tên POI')).toBeDisabled()
    expect(screen.getByLabelText('Bản đồ')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Chọn vị trí' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Kích hoạt POI' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Phóng to' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Nhập file YAML' })).not.toBeInTheDocument()
  })

  it('allows content correction for a stored out-of-bounds pose, rejecting a new out-of-bounds pose', async () => {
    const stored = poiDetails({ mapKey: 'map2-v1', x: 500, y: 500 })
    let payload: Record<string, unknown> | null = null
    stubApi((_url, init) => {
      if (init?.method === 'PUT') {
        payload = JSON.parse(String(init.body)) as Record<string, unknown>
        return jsonResponse({ success: true, data: null })
      }
      return jsonResponse({ success: true, data: stored })
    })
    renderAt('/admin/pois/poi-1')
    await screen.findByLabelText('Mô tả')
    fireEvent.change(screen.getByLabelText('Mô tả'), { target: { value: 'Copy only' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(payload).toMatchObject({ x: 500, y: 500, description: 'Copy only' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeEnabled())
    payload = null
    openPoseStep()
    fireEvent.click(screen.getByRole('radio', { name: 'Nhập tọa độ thủ công' }))
    fireEvent.change(screen.getByLabelText('X (m)'), { target: { value: '501' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Pose nằm ngoài phạm vi bản đồ đã chọn.')).toBeInTheDocument()
    expect(payload).toBeNull()
  })
})
