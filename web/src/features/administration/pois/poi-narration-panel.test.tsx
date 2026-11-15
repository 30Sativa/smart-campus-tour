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
let proposalExtra: Record<string, unknown>

function serve() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new NativeURL(String(input), 'http://localhost'); requests.push({ url, init })
    if (url.pathname === '/api/maps/versions') return ok([mapItem])
    if (url.pathname === '/api/maps/versions/map-v1/package') return new Response(new Blob(['zip']))
    if (url.pathname === '/api/staff/poi-proposals/proposal-1') return ok({ id: 'proposal-1', currentRevision: 1, rowVersion: 'p-rv', revision, narration: summaryOf(versions), ...proposalExtra })
    if (url.pathname === '/api/staff/poi-proposals/proposal-1/narrations') return ok(versions)
    if (url.pathname === '/api/staff/poi-proposals/proposal-1/history') return ok({ proposalId: 'proposal-1', revisions: [revision], verificationRecords: [] })
    if (url.pathname.startsWith('/api/staff/poi-proposals/proposal-1/narrations/')) return writeResponse()
    return ok(null)
  }))
}

// Narration has its own tab on the POI page (owner's layout); a hidden tab is out of the accessibility tree.
function renderPage(path = '/staff/manage/pois/proposal-1?tab=thuyet-minh') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
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
    proposalExtra = {}
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
    expect(await section.findByText('Bản đang soạn đầu tiên')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Tình trạng POI' })).getByText('Chưa có')).toBeInTheDocument()
    fireEvent.change(section.getByLabelText('Nội dung thuyết minh'), { target: { value: '  Chào mừng tới thư viện.  ' } })
    fireEvent.click(section.getByRole('button', { name: 'Lưu bản đang soạn' }))
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
    expect(section.getByRole('button', { name: 'Lưu bản đang soạn' })).toBeDisabled()
    fireEvent.change(section.getByLabelText(/Video dự phòng HTTPS/), { target: { value: 'https://cdn.example/v.mp4' } })
    fireEvent.click(section.getByRole('button', { name: 'Lưu bản đang soạn' }))
    await waitFor(() => expect(writes('/narrations/draft')).toHaveLength(1))
    expect(body('/narrations/draft')).toMatchObject({ expectedRowVersion: 'rv-draft', narrationText: 'Bản nháp mới.', fallbackVideoUrl: 'https://cdn.example/v.mp4' })

    fireEvent.click(section.getByRole('button', { name: 'Bỏ bản này' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bỏ bản này' }))
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
    fireEvent.click(section.getByRole('button', { name: 'Lưu bản đang soạn' }))
    await waitFor(() => expect(writes('/narrations/draft')).toHaveLength(1))
    expect(body('/narrations/draft')).toMatchObject({ narrationText: 'Bản đã duyệt.' })
    expect(body('/narrations/draft')).not.toHaveProperty('expectedRowVersion')
  })

  it('gives the draft’s last editor no Approve button and says who approves', async () => {
    versions = [version({ lastEditedByUserId: 'staff-1', lastEditedByName: 'Tôi' })]
    renderPage()
    const section = await panel()
    const box = within(await section.findByRole('group', { name: 'Duyệt' }))
    expect(box.getByText('Bạn sửa bản này lần cuối. Chờ một Staff khác duyệt.')).toBeInTheDocument()
    expect(box.queryByRole('button')).not.toBeInTheDocument()
    expect(section.queryByRole('button', { name: /^Duyệt/ })).not.toBeInTheDocument()
  })

  it('lets another Staff approve after confirming the exact text', async () => {
    versions = [approvedVersion, version({ revisionNumber: 2, narrationText: 'Nội dung sắp duyệt.', rowVersion: 'rv-2' })]
    renderPage()
    const section = await panel()
    expect(within(await screen.findByRole('region', { name: 'Tình trạng POI' })).getByText('Đã duyệt · có bản đang soạn')).toBeInTheDocument()
    // The approver reads what changed against the version in use: added words marked, removed words struck.
    const box = within(await section.findByRole('group', { name: 'Duyệt' }))
    const diff = box.getByLabelText('Phần chữ đã đổi')
    // "Bản đã duyệt." → "Nội dung sắp duyệt.": the shared last word stays plain.
    expect([...diff.querySelectorAll('ins')].map(node => node.textContent).join('|')).toBe('Nội dung sắp ')
    expect([...diff.querySelectorAll('del')].map(node => node.textContent).join('|')).toBe('Bản đã ')
    expect(diff).toHaveTextContent('Bản đã Nội dung sắp duyệt.')
    // Writer's buttons and the approval stay apart: the draft card has no Approve.
    expect(within(section.getByRole('group', { name: 'Bản đang soạn' })).queryByRole('button', { name: /^Duyệt/ })).not.toBeInTheDocument()
    fireEvent.click(box.getByRole('button', { name: 'Duyệt phiên bản 2' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Nội dung sắp duyệt.')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(writes('/narrations/2/approve')).toHaveLength(1))
    expect(body('/narrations/2/approve')).toMatchObject({ expectedRowVersion: 'rv-2' })
    // The narration history moved to the History tab.
    expect(screen.getByText(/^Phiên bản 2 · Bản đang soạn · sửa cuối Lan lúc/)).toBeInTheDocument()
  })

  it('shows the self-approval refusal in Vietnamese and reloads the narration', async () => {
    versions = [version({ rowVersion: 'rv-1' })]
    writeResponse = () => refused('NARRATION_SELF_APPROVAL_FORBIDDEN')
    renderPage()
    const section = await panel()
    fireEvent.click(await section.findByRole('button', { name: 'Duyệt phiên bản 1' }))
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
    fireEvent.click(section.getByRole('button', { name: 'Lưu bản đang soạn' }))
    expect(await section.findByText(/Thuyết minh vừa được người khác thay đổi/)).toBeInTheDocument()
    await waitFor(() => expect(listReads()).toBeGreaterThan(before))
    expect(section.getByLabelText('Nội dung thuyết minh')).toHaveValue('Tôi vừa sửa.')
  })

  it('keeps unsaved narration and POI edits when switching tabs, and shows the POI save bar only on the first tab', async () => {
    versions = [version({})]
    renderPage('/staff/manage/pois/proposal-1')
    const tabs = within(await screen.findByRole('tablist', { name: 'Phần của POI' }))
    expect(tabs.getByRole('tab', { name: 'Vị trí & camera' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Lưu POI (chưa gửi kiểm)' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tên POI'), { target: { value: 'Thư viện mới' } })

    fireEvent.click(tabs.getByRole('tab', { name: 'Thuyết minh' }))
    expect(screen.queryByRole('button', { name: 'Lưu POI (chưa gửi kiểm)' })).not.toBeInTheDocument()
    const section = await panel()
    fireEvent.change(await section.findByLabelText('Nội dung thuyết minh'), { target: { value: 'Đang gõ dở.' } })
    fireEvent.click(tabs.getByRole('tab', { name: 'Lịch sử' }))
    expect(screen.queryByRole('button', { name: 'Lưu POI (chưa gửi kiểm)' })).not.toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Lịch sử thay đổi' })).toBeInTheDocument()

    fireEvent.click(tabs.getByRole('tab', { name: 'Vị trí & camera' }))
    expect(screen.getByLabelText('Tên POI')).toHaveValue('Thư viện mới')
    fireEvent.click(tabs.getByRole('tab', { name: 'Thuyết minh' }))
    expect((await panel()).getByLabelText('Nội dung thuyết minh')).toHaveValue('Đang gõ dở.')
  })

  it('says in the header whether a route can use the POI, by the server rule', async () => {
    versions = [version({})]
    renderPage()
    const header = within(await screen.findByRole('region', { name: 'Tình trạng POI' }))
    expect(header.getByText('Đạt')).toBeInTheDocument()
    expect(header.getByText('Đang soạn')).toBeInTheDocument()
    expect(header.getByText('Dùng được cho tuyến: Chưa, vì chưa có thuyết minh đã duyệt')).toBeInTheDocument()
  })

  it('keeps a retired POI read-only on every tab', async () => {
    versions = [approvedVersion, version({ revisionNumber: 2 })]
    proposalExtra = { retiredAt: '2026-11-15T05:00:00Z', canReactivate: true }
    renderPage()
    const section = await panel()
    expect(await section.findByText(/POI đã ngưng dùng; thuyết minh chỉ để xem/)).toBeInTheDocument()
    expect(section.queryByLabelText('Nội dung thuyết minh')).not.toBeInTheDocument()
    expect(section.queryByRole('button', { name: /Lưu bản đang soạn|Duyệt phiên bản|Soạn phiên bản mới|Bỏ bản này/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Tình trạng POI' })).getByText('Dùng được cho tuyến: Chưa, vì POI đã ngưng dùng')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dùng lại' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Vị trí & camera' }))
    expect(screen.getByLabelText('Tên POI')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Lưu POI (chưa gửi kiểm)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('tab', { name: 'Lịch sử' }))
    expect(within(await screen.findByRole('region', { name: 'Lịch sử thay đổi' })).queryByRole('button')).not.toBeInTheDocument()
  })

  it('labels the description as an internal note and links the narration tab', async () => {
    renderPage('/staff/manage/pois/proposal-1')
    expect(await screen.findByLabelText('Ghi chú nội bộ (không hiện cho học sinh)')).toBeInTheDocument()
    expect(screen.getByText(/Lời guide đọc cho học sinh là Thuyết minh/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'tab Thuyết minh' }))
    expect(screen.getByRole('tab', { name: 'Thuyết minh' })).toHaveAttribute('aria-selected', 'true')
    expect(await panel()).toBeTruthy()
  })
})
