import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageRegistrationsPage from '../../../routes/staff/manage/StaffManageRegistrationsPage'
import StaffShell from '../../staff/StaffShell'
import { useAuthStore } from '../../../stores/auth-store'
import { useToastStore } from '../../../components/ui/toast-store'
import { dateBoundary, reviewTime } from './presentation'
import type { EmailChangeDecisionInput, ReviewDetails, ReviewInput, StaffEmailChange } from './types'

const firstVersion = 'AAAAAAAAAAE='
const secondVersion = 'AAAAAAAAAAI='
const initial: ReviewDetails = {
  summary: { id: 'registration', tourId: 'tour', tourName: 'Tour SQL', tourScheduledStartAt: '2026-10-20T02:00:00Z', tourState: 'SCHEDULED',
    schoolName: 'Trường A', groupName: 'Đoàn A', state: 'SUBMITTED', rowCount: 1, representativeName: 'Đại diện A', submittedAt: '2026-10-08T03:00:00Z', updatedAt: '2026-10-08T03:00:00Z' },
  contactName: 'Người liên hệ', contactEmail: 'contact@example.com', rowVersion: firstVersion, tourRowVersion: secondVersion,
  rejectionReason: null, reviewedAt: null, reviewedByUserId: null,
  roster: [{ id: 'row', rowVersion: firstVersion, invitationRowVersion: null, participationState: 'PENDING', canApprove: true, canReject: true, reviewReason: null, rowNumber: 4, rowType: 'SHARED_VIEWING', displayName: 'Phòng A', email: 'room@example.com', className: null }], review: { allowed: true, reason: null }, correctEmail: { allowed: true, reason: null },
}
let registration: ReviewDetails
let decisions: { action: string; rowId: string; input: ReviewInput }[]
let requests: URL[]
let unexpectedMutations: string[]
let failure: 'list' | 'detail' | 'stale' | 'reload' | 'network' | 'duplicate' | 'invalid' | 'forbidden' | 'uncertain-commit' | null
let clients: QueryClient[]
let emailChanges: StaffEmailChange[]
let emailDecisions: { id: string; action: string; input: EmailChangeDecisionInput }[]
let emailChangeExpired: boolean
const emailChange = (overrides: Partial<StaffEmailChange> = {}): StaffEmailChange => ({
  id: 'change-1', registrationId: 'registration', rowId: 'row', rowNumber: 4, currentEmail: 'room@example.com', proposedEmail: 'new@example.com',
  state: 'PENDING', requestedByUserId: 'rep', createdAt: '2026-10-09T03:00:00Z', reviewedAt: null, reviewedByUserId: null, reviewReason: null,
  rowVersion: 'request-version', tourRowVersion: 'tour-version', registrationRowVersion: 'registration-version', rosterRowVersion: 'row-version',
  canReview: true, expiresAt: new Date(Date.now() + 5 * 3600_000).toISOString(), ...overrides,
})
function response(data: unknown, status = 200, extra: object = {}) {
  return new Response(JSON.stringify({ success: status === 200, message: 'OK', data, ...extra }), { status })
}
function renderAt(path = '/staff/manage/registrations/pending?review=registration', mode: 'pending' | 'all' = 'pending') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/manage/registrations" element={<StaffManageRegistrationsPage mode={mode} />} />
    <Route path="/staff/manage/registrations/pending" element={<StaffManageRegistrationsPage mode={mode} />} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return client
}
beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  clients = []; requests = []; decisions = []; unexpectedMutations = []; registration = structuredClone(initial); failure = null
  emailChanges = []; emailDecisions = []; emailChangeExpired = false
  useAuthStore.getState().setAuth('staff-token', { userId: 'sql-staff', username: 'staff', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer staff-token')
    const url = new URL(input, 'https://api.example.test'); requests.push(url)
    if (url.pathname === '/api/registrations/registration/invitations')
      return response({ enabled: false, canIssue: false, items: [] })
    if (url.pathname.startsWith('/api/staff/manage/roster-email-change-requests')) {
      if (options?.method !== 'POST') { expect(url.searchParams.get('state')).toBe('PENDING'); return response(structuredClone(emailChanges)) }
      const [, id, action] = /\/([^/]+)\/(accept|reject)$/.exec(url.pathname)!
      emailDecisions.push({ id, action, input: JSON.parse(options.body as string) as EmailChangeDecisionInput })
      emailChanges = emailChanges.filter(item => item.id !== id)
      return emailChangeExpired
        ? response(null, 409, { message: 'Yêu cầu không còn chờ xử lý hoặc dòng không còn được chấp nhận.', errors: { code: 'EMAIL_CHANGE_STATE_CONFLICT', fields: null } })
        : response(null)
    }
    expect(url.pathname).toMatch(/^\/api\/staff\/manage\/registrations/)
    if (options?.method === 'POST') {
      const match = /^\/api\/staff\/manage\/registrations\/([^/]+)\/rows\/([^/]+)\/(accept|reject)$/.exec(url.pathname)
      if (!match) { unexpectedMutations.push(url.pathname); return response(null, 404) }
      const [, registrationId, rowId, action] = match
      if (registrationId !== 'registration') { unexpectedMutations.push(url.pathname); return response(null, 404) }
      decisions.push({ action, rowId, input: JSON.parse(options.body as string) as ReviewInput })
      if (failure === 'stale') return response(null, 409, { message: 'Dữ liệu đã thay đổi.', errors: { code: 'STALE_VERSION', fields: null } })
      if (failure === 'network') throw new TypeError('Disconnected')
      const row = registration.roster.find(item => item.id === rowId)!
      row.participationState = action === 'accept' ? 'ACCEPTED' : 'REJECTED'
      row.reviewReason = decisions.at(-1)?.input.reason ?? null
      row.canApprove = false; row.canReject = false; row.rowVersion = secondVersion
      registration.summary.state = registration.roster.some(item => item.participationState === 'ACCEPTED') ? 'APPROVED'
        : registration.roster.some(item => item.participationState === 'PENDING') ? 'SUBMITTED' : 'REJECTED'
      registration.rejectionReason = registration.summary.state === 'REJECTED' ? row.reviewReason ?? null : null
      registration.rowVersion = secondVersion
      return response(null)
    }
    if (url.pathname.endsWith('/registration')) {
      if (failure === 'detail' || failure === 'reload') return response(null, 500)
      return response(structuredClone(registration))
    }
    if (failure === 'list') return response(null, 500)
    const rows = url.searchParams.get('state') === 'SUBMITTED' && registration.summary.state !== 'SUBMITTED' && !registration.roster.some(row => row.participationState === 'PENDING') ? [] : [structuredClone(registration.summary)]
    return response(rows, 200, { pagination: { page: Number(url.searchParams.get('page') ?? 1), pageSize: 10, totalItems: 25, totalPages: 3 } })
  }))
})
afterEach(() => { expect(unexpectedMutations).toEqual([]); clients.forEach(c => c.clear()); useAuthStore.getState().logout(); vi.unstubAllGlobals(); focusManager.setFocused(undefined) })

describe('Staff registration review boundary', () => {
  it('loads the Staff API and does not expose the legacy Admin-only direct email correction', async () => {
    renderAt('/staff/manage/registrations?review=registration', 'all')
    expect(await screen.findByRole('table', { name: 'Roster đăng ký' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sửa email dòng/ })).not.toBeInTheDocument()
    expect(requests.some(url => url.pathname.startsWith('/api/staff/manage/registrations'))).toBe(true)
    expect(requests.some(url => url.pathname.startsWith('/api/admin/registrations'))).toBe(false)
  })

  it('filters the redesigned tabs on the server and resets pagination', async () => {
    renderAt('/staff/manage/registrations?page=3', 'all')
    await screen.findByRole('table', { name: 'Đăng ký từ đại diện' })
    expect(requests[0].searchParams.get('page')).toBe('3')
    fireEvent.click(screen.getByRole('button', { name: 'Đã duyệt' }))
    await waitFor(() => expect(requests.some(u => u.searchParams.get('state') === 'APPROVED' && u.searchParams.get('page') === '1')).toBe(true))
    expect(screen.queryByRole('button', { name: 'Gửi thông tin' })).not.toBeInTheDocument()
    expect(screen.queryByText('Đã gửi thông tin')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tour từ ngày (UTC+7)'), { target: { value: '2026-10-08' } })
    await waitFor(() => expect(requests.some(u => u.searchParams.get('from') === '2026-10-07T17:00:00.000Z')).toBe(true))
  })

  it('uses server filtering and totals, and distinguishes shared viewing from student counts', async () => {
    renderAt()
    expect(await screen.findByRole('table', { name: 'Đăng ký từ đại diện' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Roster đăng ký' })).toBeInTheDocument()
    expect(screen.getByText('Điểm xem chung')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(requests.find(u => u.pathname === '/api/staff/manage/registrations')?.searchParams.get('state')).toBe('SUBMITTED')
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(requests.some(u => u.searchParams.get('page') === '2')).toBe(true))
    expect(screen.queryByText('Số học sinh')).not.toBeInTheDocument()
  })

  it('accepts only the selected row with confirmation and the current SQL versions', async () => {
    renderAt('/staff/manage/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('button', { name: 'Chấp nhận Phòng A' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chấp nhận dòng Phòng A?' })
    expect(within(dialog).getByText(/chỉ dòng này được chấp nhận/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chấp nhận dòng' }))
    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))
    await screen.findByRole('region', { name: 'Hỗ trợ lời mời' })
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({ action: 'accept', rowId: 'row', input: { requestId: expect.any(String), expectedRegistrationRowVersion: firstVersion, expectedTourRowVersion: secondVersion, expectedRowVersion: firstVersion } })
    expect(requests.some(url => url.pathname === '/api/staff/manage/registrations/registration/rows/row/accept')).toBe(true)
    expect(requests.some(url => url.pathname.endsWith('/approve') || url.pathname.endsWith('/reject'))).toBe(false)
    expect(screen.queryByRole('button', { name: 'Gửi thông tin' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mã đoàn:/)).not.toBeInTheDocument()
  })

  it('keeps a mixed ACCEPTED/PENDING registration in the pending queue and reviews only its pending row', async () => {
    registration = structuredClone(initial)
    registration.summary.state = 'APPROVED'
    registration.roster = [
      { ...registration.roster[0], id: 'accepted-row', participationState: 'ACCEPTED', canApprove: false, canReject: false },
      { ...registration.roster[0], id: 'pending-row', rowNumber: 5, displayName: 'Thiết bị B', email: 'b@example.com' },
    ]
    renderAt()
    expect(await screen.findByRole('button', { name: 'Chấp nhận Thiết bị B' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chấp nhận Phòng A' })).not.toBeInTheDocument()
    expect(requests.some(url => url.searchParams.get('state') === 'SUBMITTED')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận Thiết bị B' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Chấp nhận dòng Thiết bị B?' })).getByRole('button', { name: 'Chấp nhận dòng' }))
    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0))
    expect(decisions).toHaveLength(1)
    expect(decisions[0].rowId).toBe('pending-row')
    expect(registration.roster.find(row => row.id === 'accepted-row')?.participationState).toBe('ACCEPTED')
  })

  const twoPendingRows = () => {
    registration.roster = [
      { ...initial.roster[0], id: 'row-a', displayName: 'Lan' },
      { ...initial.roster[0], id: 'row-b', rowNumber: 5, displayName: 'Minh', email: 'minh@example.com' },
    ]
  }

  it('accepts the selected rows one at a time, each against a fresh registration version', async () => {
    twoPendingRows()
    renderAt('/staff/manage/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Chọn tất cả 2 dòng chờ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận đã chọn (2)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chấp nhận 2 dòng đã chọn?' })
    expect(within(dialog).getByText(/Lan, Minh/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chấp nhận 2 dòng' }))
    await waitFor(() => expect(useToastStore.getState().toasts.map(toast => toast.title)).toContain('Đã chấp nhận 2 dòng'))
    expect(decisions.map(decision => [decision.action, decision.rowId, decision.input.expectedRegistrationRowVersion])).toEqual([
      ['accept', 'row-a', firstVersion], ['accept', 'row-b', secondVersion],
    ])
    expect(new Set(decisions.map(decision => decision.input.requestId)).size).toBe(2)
    expect(await screen.findByRole('region', { name: 'Hỗ trợ lời mời' })).toBeInTheDocument()
  })

  it('rejects only the ticked rows with one shared reason', async () => {
    twoPendingRows()
    renderAt('/staff/manage/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Chọn Minh' }))
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối đã chọn (1)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Từ chối dòng Minh?' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Lý do từ chối/ }), { target: { value: 'Sai email' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối dòng' }))
    await waitFor(() => expect(decisions).toHaveLength(1))
    expect(decisions[0]).toMatchObject({ action: 'reject', rowId: 'row-b', input: { reason: 'Sai email' } })
  })

  it('stops the run and says how far it got when a later row changed underneath', async () => {
    twoPendingRows()
    renderAt('/staff/manage/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Chọn tất cả 2 dòng chờ' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận đã chọn (2)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Chấp nhận 2 dòng đã chọn?' })
    // Another writer changes row B after the reviewer opened the snapshot.
    registration.roster[1].rowVersion = secondVersion
    registration.roster[1].displayName = 'Minh đã đổi'
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chấp nhận 2 dòng' }))
    expect(await screen.findByText(/Dữ liệu đã thay đổi hoặc Tour đã khóa/)).toBeInTheDocument()
    expect(decisions.map(decision => decision.rowId)).toEqual(['row-a'])
    expect(useToastStore.getState().toasts.map(toast => toast.title)).toContain('Đã chấp nhận 1 trong 2 dòng')
  })

  it('opens an approved registration on invitations only when nothing is left to review', async () => {
    registration.summary.state = 'APPROVED'
    registration.roster[0] = { ...registration.roster[0], participationState: 'ACCEPTED', canApprove: false, canReject: false }
    renderAt('/staff/manage/registrations?review=registration', 'all')
    expect(await screen.findByRole('region', { name: 'Hỗ trợ lời mời' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Roster đăng ký' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách dòng (1)' }))
    expect(await screen.findByRole('table', { name: 'Roster đăng ký' })).toBeInTheDocument()
  })

  it('requires a rejection reason and displays the saved reason', async () => {
    renderAt('/staff/manage/registrations?review=registration', 'all')
    const sheet = await screen.findByRole('dialog', { name: 'Đoàn A' })
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Từ chối Phòng A' }))
    const dialog = await screen.findByRole('dialog', { name: 'Từ chối dòng Phòng A?' })
    const submit = within(dialog).getByRole('button', { name: 'Từ chối dòng' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Lý do từ chối/ }), { target: { value: '  Sửa email  ' } })
    fireEvent.click(submit)
    expect(await screen.findByText('Lý do từ chối: Sửa email')).toBeInTheDocument()
    expect(decisions[0].action).toBe('reject')
    expect(decisions[0].input.reason).toBe('Sửa email')
    expect(decisions[0].input).toMatchObject({ requestId: expect.any(String), expectedRegistrationRowVersion: firstVersion, expectedTourRowVersion: secondVersion, expectedRowVersion: firstVersion })
  })

  it('keeps focus refresh from replacing a reviewed snapshot, then explicitly reloads after conflict', async () => {
    renderAt()
    const roster = await screen.findByRole('table', { name: 'Roster đăng ký' })
    expect(within(roster).getByRole('cell', { name: 'Phòng A' })).toBeInTheDocument()
    registration.rowVersion = secondVersion
    registration.roster[0].displayName = 'Phòng mới'
    registration.roster[0].rowVersion = secondVersion
    const reads = requests.filter(u => u.pathname.endsWith('/registration')).length
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
    expect(requests.filter(u => u.pathname.endsWith('/registration'))).toHaveLength(reads)
    expect(within(roster).queryByText('Phòng mới')).not.toBeInTheDocument()
    failure = 'stale'
    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận Phòng A' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Chấp nhận dòng Phòng A?' })).getByRole('button', { name: 'Chấp nhận dòng' }))
    expect(await screen.findByText(/Dữ liệu đã thay đổi hoặc Tour đã khóa/)).toBeInTheDocument()
    expect(decisions[0].input.expectedRowVersion).toBe(firstVersion)
    expect(screen.getByRole('button', { name: 'Chấp nhận Phòng A' })).toBeDisabled()
    failure = 'reload'
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(await screen.findByText('Không tải được đăng ký này.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chấp nhận Phòng A' })).not.toBeInTheDocument()
    failure = null
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(within(await screen.findByRole('table', { name: 'Roster đăng ký' })).getByRole('cell', { name: 'Phòng mới' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Chấp nhận Phòng mới' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Chấp nhận dòng Phòng mới?' })).getByRole('button', { name: 'Chấp nhận dòng' }))
    await waitFor(() => expect(decisions).toHaveLength(2))
    expect(decisions[1].input.expectedRowVersion).toBe(secondVersion)
  })

  it('shows load failure with retry and never fills the queue from mock data', async () => {
    failure = 'list'; renderAt('/staff/manage/registrations/pending')
    expect(await screen.findByText('Không thể tải danh sách đăng ký.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    failure = null
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('table', { name: 'Đăng ký từ đại diện' })).toBeInTheDocument()
  })

  it('keeps an unsuccessful decision visible without pretending approval succeeded', async () => {
    failure = 'network'; renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Chấp nhận Phòng A' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Chấp nhận dòng Phòng A?' })).getByRole('button', { name: 'Chấp nhận dòng' }))
    expect(await within(screen.getByRole('dialog', { name: 'Chấp nhận dòng Phòng A?' })).findByRole('alert')).toHaveTextContent('Không thực hiện được.')
    expect(registration.summary.state).toBe('SUBMITTED')
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('explains an inverted Tour date range instead of sending a request that can only fail', async () => {
    renderAt('/staff/manage/registrations?from=2026-10-10&to=2026-10-09', 'all')
    expect(await screen.findByText('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.')).toBeInTheDocument()
    expect(requests.some(u => u.pathname === '/api/staff/manage/registrations')).toBe(false)
    expect(screen.queryByText('Không thể tải danh sách đăng ký.')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tour đến ngày (UTC+7)'), { target: { value: '2026-10-10' } })
    await waitFor(() => expect(requests.some(u => u.searchParams.get('to') === '2026-10-10T17:00:00.000Z')).toBe(true))
  })

  it('counts the sidebar queue badge from the live SQL total, never from simulated registrations', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    clients.push(client)
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/manage/registrations/pending']}><Routes>
      <Route path="/staff" element={<StaffShell />}><Route path="manage/registrations/pending" element={<p>Hàng chờ</p>} /></Route>
    </Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByLabelText('25 đoàn chờ duyệt')).toBeInTheDocument()
    const count = requests.find(u => u.pathname === '/api/staff/manage/registrations' && u.searchParams.get('size') === '1')
    expect(count?.searchParams.get('state')).toBe('SUBMITTED')
  })

  it('hides the sidebar count when its SQL refresh fails instead of retaining a stale or simulated count', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    clients.push(client)
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/staff/manage/registrations/pending']}><Routes>
      <Route path="/staff" element={<StaffShell />}><Route path="manage/registrations/pending" element={<p>Hàng chờ</p>} /></Route>
    </Routes></MemoryRouter></QueryClientProvider>)
    await screen.findByLabelText('25 đoàn chờ duyệt')
    failure = 'list'
    await act(async () => { await client.invalidateQueries({ queryKey: ['admin-registration-review', 'sql-staff', 'list'] }) })
    await waitFor(() => expect(screen.queryByLabelText(/\d+ đoàn chờ duyệt/)).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Đăng ký đoàn' })).toBeInTheDocument()
  })

  describe('email-change requests', () => {
    const accepted = () => { registration.summary.state = 'APPROVED'; registration.roster[0] = { ...registration.roster[0], participationState: 'ACCEPTED', canApprove: false, canReject: false } }
    const openPanel = async () => {
      accepted()
      renderAt('/staff/manage/registrations?review=registration', 'all')
      return screen.findByRole('region', { name: 'Yêu cầu đổi email chờ duyệt' })
    }

    it('lists only this registration, with both emails, the sender, the sent time and the expiry', async () => {
      emailChanges = [emailChange(), emailChange({ id: 'other', registrationId: 'other-registration', proposedEmail: 'other@example.com' })]
      const panel = await openPanel()
      expect(within(panel).getByText('room@example.com')).toBeInTheDocument()
      expect(within(panel).getByText('new@example.com')).toBeInTheDocument()
      expect(within(panel).getByText('Dòng 4: Phòng A')).toBeInTheDocument()
      expect(within(panel).getByText(`Gửi bởi Đại diện A lúc ${reviewTime('2026-10-09T03:00:00Z')}`)).toBeInTheDocument()
      expect(within(panel).getByText(/^Hết hạn lúc /)).toBeInTheDocument()
      expect(within(panel).queryByText('other@example.com')).not.toBeInTheDocument()
    })

    it('shows no section when nothing waits', async () => {
      accepted()
      renderAt('/staff/manage/registrations?review=registration', 'all')
      const sheet = await screen.findByRole('dialog', { name: 'Đoàn A' })
      await within(sheet).findByRole('region', { name: 'Hỗ trợ lời mời' })
      expect(within(sheet).queryByRole('region', { name: 'Yêu cầu đổi email chờ duyệt' })).not.toBeInTheDocument()
    })

    it('drops the expiry line once it has passed', async () => {
      emailChanges = [emailChange({ expiresAt: new Date(Date.now() - 60_000).toISOString() })]
      const panel = await openPanel()
      expect(within(panel).queryByText(/Hết hạn lúc/)).not.toBeInTheDocument()
    })

    it('accepts with all four versions after confirmation and refreshes the roster', async () => {
      emailChanges = [emailChange()]
      const panel = await openPanel()
      const reads = requests.filter(url => url.pathname.endsWith('/registration')).length
      fireEvent.click(within(panel).getByRole('button', { name: 'Duyệt đổi email dòng 4' }))
      const dialog = await screen.findByRole('dialog', { name: 'Duyệt yêu cầu đổi email dòng 4?' })
      expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }))
      await waitFor(() => expect(useToastStore.getState().toasts.map(toast => toast.title)).toContain('Đã duyệt yêu cầu đổi email'))
      expect(emailDecisions).toEqual([{ id: 'change-1', action: 'accept', input: { requestId: expect.any(String), expectedRequestRowVersion: 'request-version',
        expectedTourRowVersion: 'tour-version', expectedRegistrationRowVersion: 'registration-version', expectedRowVersion: 'row-version' } }])
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Yêu cầu đổi email chờ duyệt' })).not.toBeInTheDocument())
      expect(screen.queryByRole('dialog', { name: /Duyệt yêu cầu/ })).not.toBeInTheDocument()
      await waitFor(() => expect(requests.filter(url => url.pathname.endsWith('/registration')).length).toBeGreaterThan(reads))
    })

    it('rejects only with a reason', async () => {
      emailChanges = [emailChange()]
      const panel = await openPanel()
      fireEvent.click(within(panel).getByRole('button', { name: 'Từ chối đổi email dòng 4' }))
      const dialog = await screen.findByRole('dialog', { name: 'Từ chối yêu cầu đổi email dòng 4?' })
      const submit = within(dialog).getByRole('button', { name: 'Từ chối' })
      expect(submit).toBeDisabled()
      fireEvent.change(within(dialog).getByRole('textbox', { name: /Lý do từ chối/ }), { target: { value: '  Email không đúng  ' } })
      fireEvent.click(submit)
      await waitFor(() => expect(useToastStore.getState().toasts.map(toast => toast.title)).toContain('Đã từ chối yêu cầu đổi email'))
      expect(emailDecisions[0]).toMatchObject({ action: 'reject', input: { reason: 'Email không đúng' } })
    })

    it('keeps a 409 for an expired request inside the dialog, with no success and no way to resend', async () => {
      emailChanges = [emailChange()]
      emailChangeExpired = true
      const panel = await openPanel()
      fireEvent.click(within(panel).getByRole('button', { name: 'Duyệt đổi email dòng 4' }))
      const dialog = await screen.findByRole('dialog', { name: 'Duyệt yêu cầu đổi email dòng 4?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Yêu cầu không còn chờ xử lý')
      expect(useToastStore.getState().toasts).toHaveLength(0)
      // The list refreshed and lost the request; the dialog still holds it and cannot send it again.
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Yêu cầu đổi email chờ duyệt' })).not.toBeInTheDocument())
      expect(screen.getByRole('dialog', { name: 'Duyệt yêu cầu đổi email dòng 4?' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Duyệt' })).toBeDisabled()
      expect(emailDecisions).toHaveLength(1)
    })

    it('says so when the requests cannot be loaded', async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: string) => {
        const url = new URL(input, 'https://api.example.test')
        if (url.pathname.startsWith('/api/staff/manage/roster-email-change-requests')) return response(null, 500)
        if (url.pathname.endsWith('/registration')) return response(structuredClone(registration))
        return response([], 200, { pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 } })
      }))
      renderAt('/staff/manage/registrations?review=registration', 'all')
      expect(await screen.findByText('Không tải được yêu cầu đổi email.')).toBeInTheDocument()
    })
  })

  describe('the T-24h line in the queue', () => {
    const inHours = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString()
    it('shows while the moment is ahead', async () => {
      registration.summary.tourScheduledStartAt = inHours(48)
      renderAt()
      const table = await screen.findByRole('table', { name: 'Đăng ký từ đại diện' })
      expect(within(table).getByText(/^Hết hạn lúc /)).toBeInTheDocument()
    })
    it('is gone once the moment has passed', async () => {
      registration.summary.tourScheduledStartAt = inHours(12)
      renderAt()
      const table = await screen.findByRole('table', { name: 'Đăng ký từ đại diện' })
      expect(within(table).queryByText(/Hết hạn lúc/)).not.toBeInTheDocument()
    })
  })

  it('uses Vietnam date boundaries with an exclusive upper bound', () => {
    expect(dateBoundary('2026-10-08')).toBe('2026-10-07T17:00:00.000Z')
    expect(dateBoundary('2026-10-08', true)).toBe('2026-10-08T17:00:00.000Z')
  })
})
