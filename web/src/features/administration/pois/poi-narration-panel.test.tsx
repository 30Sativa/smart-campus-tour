import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManagePoiFormPage from '../../../routes/staff/manage/StaffManagePoiFormPage'
import { useAuthStore } from '../../../stores/auth-store'
import type { PoiNarrationRevision, PoiNarrationSummary } from '../../technical/api/technical'

vi.mock('./map/versioned-package', () => ({
  parseVersionedMapPackage: vi.fn(async () => ({ width: 2, height: 2, resolution: 0.5, origin: [10, 20, 0], frameId: 'map', imageSha256: 'b'.repeat(64), sourceYaml: 'image: map.pgm', pixels: new Uint8ClampedArray(16) })),
  rasterPngBlob: vi.fn(async () => new Blob(['preview'], { type: 'image/png' })),
}))
vi.mock('./map/load-map-image', () => ({ loadMapImage: vi.fn(async () => ({ pixels: null })) }))

const map = { id: 'map-v1', areaKey: 'library', areaName: 'Library', versionNumber: 1, mapKey: 'library-v1', packageFileName: 'library.zip', packageSha256: 'a'.repeat(64), imageFileName: 'map.pgm', imageWidth: 2, imageHeight: 2, resolution: 0.5, originX: 10, originY: 20, originYaw: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25, frameId: 'map', validationStatus: 'VALID', uploadedAt: '2026-10-27T10:00:00Z' }
const mapItem = { map, latestDeployment: null, technicalCheckStatus: 'PASSED', canUseForPoiPreparation: true, preparationBlockReasonCode: null, preparationBlockReason: null, preparationEvidence: null, currentlyDeployedOn: [{ robotCode: 'amr-01', checkedAt: '2026-10-27T10:00:00Z' }] }
const revision = { id: 'revision-1', revisionNumber: 1, mapVersionId: 'map-v1', mapKey: 'library-v1', name: 'Thư viện', purpose: 'Giới thiệu', description: null, x: 10.25, y: 20.75, yaw: 0, cameraPreset: 'FRONT', createdAt: '2026-10-27T10:00:00Z', isSubmitted: true, submittedAt: '2026-10-27T10:00:00Z', navigationStatus: 'PASS', verificationSourceRevisionId: null }
const NativeURL = URL

const version = (overrides: Partial<PoiNarrationRevision>): PoiNarrationRevision => ({
  id: `n-${overrides.revisionNumber ?? 1}`, proposalId: 'proposal-1', revisionNumber: 1, state: 'DRAFT',
  narrationText: 'Đây là thư viện.', fallbackVideoUrl: null,
  createdByUserId: 'staff-2', createdByName: 'Lan', createdAt: '2026-11-15T02:00:00Z',
  lastEditedByUserId: 'staff-2', lastEditedByName: 'Lan', lastEditedAt: '2026-11-15T02:00:00Z',
  approvedByUserId: null, approvedByName: null, approvedAt: null, rowVersion: 'rv-1', ...overrides,
})
const approvedVersion = version({ revisionNumber: 1, state: 'APPROVED', narrationText: 'Bản đã duyệt.', approvedByUserId: 'staff-3', approvedByName: 'Minh', approvedAt: '2026-11-14T03:00:00Z' })

const summaryOf = (versions: PoiNarrationRevision[]): PoiNarrationSummary => {
  const approved = versions.find(item => item.state === 'APPROVED')
  const draft = versions.find(item => item.state === 'DRAFT')
  return {
    approved: approved ? { revisionNumber: approved.revisionNumber, approvedByUserId: approved.approvedByUserId!, approvedByName: approved.approvedByName!, approvedAt: approved.approvedAt! } : null,
    draft: draft ? { revisionNumber: draft.revisionNumber, lastEditedByUserId: draft.lastEditedByUserId, lastEditedByName: draft.lastEditedByName, lastEditedAt: draft.lastEditedAt, rowVersion: draft.rowVersion } : null,
  }
}

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const refused = (code: string, message = 'Refused') => new Response(JSON.stringify({ success: false, message, data: null, errors: { code } }), { status: 409, headers: { 'Content-Type': 'application/json' } })

let requests: Array<{ url: URL; init?: RequestInit }>
let versions: PoiNarrationRevision[]
let writeResponse: () => Response

function serve() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
    if (url.pathname === '/api/maps/versions') return ok([mapItem])
    if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
    if (url.pathname === '/api/staff/poi-proposals/proposal-1') return ok({ id: 'proposal-1', currentRevision: 1, rowVersion: 'p-rv', revision, narration: summaryOf(versions) })
    if (url.pathname === '/api/staff/poi-proposals/proposal-1/narrations') return ok(versions)
    if (url.pathname.startsWith('/api/staff/poi-proposals/proposal-1/narrations/')) return writeResponse()
    return ok(null)
  }))
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/manage/pois/proposal-1']}><Routes>
    <Route path="/staff/manage/pois/:poiId" element={<StaffManagePoiFormPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
const panel = async () => within(await screen.findByRole('region', { name: 'Thuyết minh' }))
const writes = (suffix: string) => requests.filter(r => r.url.pathname.endsWith(suffix) && r.init?.method && r.init.method !== 'GET')
const body = (suffix: string) => JSON.parse(String(writes(suffix).at(-1)!.init!.body))
const listReads = () => requests.filter(r => r.url.pathname === '/api/staff/poi-proposals/proposal-1/narrations').length

describe('POI narration section (ADR-0060)', () => {
  beforeEach(() => {
    requests = []
    versions = []
    writeResponse = () => ok(version({}))
    useAuthStore.setState({ accessToken: 't', isAuthenticated: true, isAuthReady: true, user: { userId: 'staff-1', username: 'staff', role: 'Staff' } })
    class TestURL extends NativeURL {}
    Object.defineProperties(TestURL, { createObjectURL: { value: vi.fn(() => 'blob:map') }, revokeObjectURL: { value: vi.fn() } })
    vi.stubGlobal('URL', TestURL)
    serve()
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('creates the first draft without a row version', async () => {
    renderPage()
    const section = await panel()
    expect(await section.findByText('Bản nháp đầu tiên')).toBeInTheDocument()
    expect(section.getByText('Chưa có thuyết minh')).toBeInTheDocument()
    fireEvent.change(section.getByLabelText('Nội dung thuyết minh'), { target: { value: '  Chào mừng tới thư viện.  ' } })
    fireEvent.click(section.getByRole('button', { name: 'Lưu nháp thuyết minh' }))
    await waitFor(() => expect(writes('/narrations/draft')).toHaveLength(1))
    expect(writes('/narrations/draft')[0].init!.method).toBe('PUT')
    const sent = body('/narrations/draft')
    expect(sent).toMatchObject({ narrationText: 'Chào mừng tới thư viện.', fallbackVideoUrl: null })
    expect(sent).not.toHaveProperty('expectedRowVersion')
    expect(sent.requestId).toBeTruthy()
  })

  it('edits a draft with its row version, refuses a non-HTTPS video and discards after a confirmation', async () => {
    versions = [version({ narrationText: 'Bản nháp cũ.', rowVersion: 'rv-draft' })]
    renderPage()
    const section = await panel()
    const text = await section.findByLabelText('Nội dung thuyết minh')
    expect(text).toHaveValue('Bản nháp cũ.')
    expect(section.getByText(/Sửa lần cuối bởi Lan lúc/)).toBeInTheDocument()
    fireEvent.change(text, { target: { value: 'Bản nháp mới.' } })
    fireEvent.change(section.getByLabelText(/Video dự phòng HTTPS/), { target: { value: 'http://video' } })
    expect(section.getByText('Video dự phòng phải là đường dẫn HTTPS.')).toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Lưu nháp thuyết minh' })).toBeDisabled()
    fireEvent.change(section.getByLabelText(/Video dự phòng HTTPS/), { target: { value: 'https://cdn.example/v.mp4' } })
    fireEvent.click(section.getByRole('button', { name: 'Lưu nháp thuyết minh' }))
    await waitFor(() => expect(writes('/narrations/draft')).toHaveLength(1))
    expect(body('/narrations/draft')).toMatchObject({ expectedRowVersion: 'rv-draft', narrationText: 'Bản nháp mới.', fallbackVideoUrl: 'https://cdn.example/v.mp4' })

    fireEvent.click(section.getByRole('button', { name: 'Bỏ nháp thuyết minh' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bỏ nháp' }))
    await waitFor(() => expect(writes('/narrations/1/discard')).toHaveLength(1))
    expect(body('/narrations/1/discard')).toMatchObject({ expectedRowVersion: 'rv-draft' })
  })

  it('composes a new version from the approved text', async () => {
    versions = [approvedVersion]
    renderPage()
    const section = await panel()
    expect(await section.findByText('Bản đã duyệt.')).toBeInTheDocument()
    expect(section.getByText(/Duyệt bởi Minh lúc/)).toBeInTheDocument()
    expect(section.queryByLabelText('Nội dung thuyết minh')).not.toBeInTheDocument()
    fireEvent.click(section.getByRole('button', { name: 'Soạn phiên bản mới' }))
    expect(section.getByLabelText('Nội dung thuyết minh')).toHaveValue('Bản đã duyệt.')
    fireEvent.click(section.getByRole('button', { name: 'Lưu nháp thuyết minh' }))
    await waitFor(() => expect(writes('/narrations/draft')).toHaveLength(1))
    expect(body('/narrations/draft')).toMatchObject({ narrationText: 'Bản đã duyệt.' })
    expect(body('/narrations/draft')).not.toHaveProperty('expectedRowVersion')
  })

  it('locks Approve for the draft’s last editor and explains why', async () => {
    versions = [version({ lastEditedByUserId: 'staff-1', lastEditedByName: 'Tôi' })]
    renderPage()
    const section = await panel()
    const approve = await section.findByRole('button', { name: 'Duyệt thuyết minh' })
    expect(approve).toBeDisabled()
    expect(approve).toHaveAccessibleDescription('Bạn là người sửa bản này lần cuối. Cần một Staff khác duyệt.')
  })

  it('lets another Staff approve after confirming the exact text', async () => {
    versions = [approvedVersion, version({ revisionNumber: 2, narrationText: 'Nội dung sắp duyệt.', rowVersion: 'rv-2' })]
    renderPage()
    const section = await panel()
    expect(await section.findByText('Đã duyệt · có bản nháp mới')).toBeInTheDocument()
    fireEvent.click(section.getByRole('button', { name: 'Duyệt thuyết minh' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Nội dung sắp duyệt.')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(writes('/narrations/2/approve')).toHaveLength(1))
    expect(body('/narrations/2/approve')).toMatchObject({ expectedRowVersion: 'rv-2' })
    expect(section.getByText('Phiên bản 2 · Bản nháp · sửa cuối Lan')).toBeInTheDocument()
  })

  it('shows the self-approval refusal in Vietnamese and reloads the narration', async () => {
    versions = [version({ rowVersion: 'rv-1' })]
    writeResponse = () => refused('NARRATION_SELF_APPROVAL_FORBIDDEN')
    renderPage()
    const section = await panel()
    fireEvent.click(await section.findByRole('button', { name: 'Duyệt thuyết minh' }))
    const before = listReads()
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Duyệt' }))
    expect(await section.findByText(/Cần một Staff khác duyệt. Dữ liệu mới nhất đã được tải lại./)).toBeInTheDocument()
    await waitFor(() => expect(listReads()).toBeGreaterThan(before))
  })

  it('shows a stale-version refusal on save and reloads, keeping what was typed', async () => {
    versions = [version({})]
    writeResponse = () => refused('STALE_VERSION')
    renderPage()
    const section = await panel()
    fireEvent.change(await section.findByLabelText('Nội dung thuyết minh'), { target: { value: 'Tôi vừa sửa.' } })
    const before = listReads()
    fireEvent.click(section.getByRole('button', { name: 'Lưu nháp thuyết minh' }))
    expect(await section.findByText(/Thuyết minh vừa được người khác thay đổi/)).toBeInTheDocument()
    await waitFor(() => expect(listReads()).toBeGreaterThan(before))
    expect(section.getByLabelText('Nội dung thuyết minh')).toHaveValue('Tôi vừa sửa.')
  })
})
