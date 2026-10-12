import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminRegistrationsPage from '../../../routes/admin/AdminRegistrationsPage'
import AdminShell from '../AdminShell'
import { useAuthStore } from '../../../stores/auth-store'
import { dateBoundary } from './presentation'
import type { EmailCorrectionInput, ReviewDetails, ReviewInput } from './types'

const firstVersion = 'AAAAAAAAAAE='
const secondVersion = 'AAAAAAAAAAI='
const initial: ReviewDetails = {
  summary: { id: 'registration', tourId: 'tour', tourName: 'Tour SQL', tourScheduledStartAt: '2026-10-20T02:00:00Z', tourState: 'SCHEDULED',
    schoolName: 'Trường A', groupName: 'Đoàn A', state: 'SUBMITTED', rowCount: 1, representativeName: 'Đại diện A', submittedAt: '2026-10-08T03:00:00Z', updatedAt: '2026-10-08T03:00:00Z' },
  contactName: 'Người liên hệ', contactEmail: 'contact@example.com', rowVersion: firstVersion, tourRowVersion: secondVersion,
  rejectionReason: null, reviewedAt: null, reviewedByUserId: null,
  roster: [{ id: 'row', rowVersion: firstVersion, invitationRowVersion: null, rowNumber: 4, rowType: 'SHARED_VIEWING', displayName: 'Phòng A', email: 'room@example.com', className: null }], review: { allowed: true, reason: null }, correctEmail: { allowed: true, reason: null },
}
let registration: ReviewDetails
let decisions: { action: string; input: ReviewInput }[]
let corrections: EmailCorrectionInput[]
let requests: URL[]
let failure: 'list' | 'detail' | 'stale' | 'reload' | 'network' | 'duplicate' | 'invalid' | 'forbidden' | 'uncertain-commit' | null
let clients: QueryClient[]
function response(data: unknown, status = 200, extra: object = {}) {
  return new Response(JSON.stringify({ success: status === 200, message: 'OK', data, ...extra }), { status })
}
function renderAt(path = '/admin/registrations/pending?review=registration', mode: 'pending' | 'all' = 'pending') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/admin/registrations" element={<AdminRegistrationsPage mode={mode} />} />
    <Route path="/admin/registrations/pending" element={<AdminRegistrationsPage mode={mode} />} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return client
}
beforeEach(() => {
  clients = []; requests = []; decisions = []; corrections = []; registration = structuredClone(initial); failure = null
  useAuthStore.getState().setAuth('admin-token', { userId: 'sql-admin', username: 'admin', role: 'Admin' })
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer admin-token')
    const url = new URL(input, 'https://api.example.test'); requests.push(url)
    if (url.pathname === '/api/registrations/registration/invitations')
      return response({ enabled: false, canIssue: false, items: [] })
    expect(url.pathname).toMatch(/^\/api\/admin\/registrations/)
    if (url.pathname.endsWith('/roster/row/email')) {
      const input = JSON.parse(options?.body as string) as EmailCorrectionInput
      corrections.push(input)
      if (failure === 'duplicate') return response(null, 409, { message: 'Email đã tồn tại.', errors: { code: 'EMAIL_RESERVED' } })
      if (failure === 'invalid') return response(null, 400)
      if (failure === 'forbidden') return response(null, 403)
      if (failure === 'stale') return response(null, 409, { message: 'Dữ liệu đã thay đổi.', errors: { code: 'STALE_VERSION' } })
      if (failure === 'network') throw new TypeError('Disconnected')
      registration.roster[0].email = input.email.toLowerCase().trim()
      registration.roster[0].rowVersion = secondVersion
      registration.rowVersion = secondVersion
      if (failure === 'uncertain-commit') throw new TypeError('Reply lost after commit')
      return response(null)
    }
    if (options?.method === 'POST') {
      const action = url.pathname.endsWith('/approve') ? 'approve' : 'reject'
      decisions.push({ action, input: JSON.parse(options.body as string) as ReviewInput })
      if (failure === 'stale') return response(null, 409, { message: 'Dữ liệu đã thay đổi.', errors: { code: 'STALE_VERSION', fields: null } })
      if (failure === 'network') throw new TypeError('Disconnected')
      registration.summary.state = action === 'approve' ? 'APPROVED' : 'REJECTED'
      registration.rejectionReason = decisions.at(-1)?.input.reason ?? null
      registration.review = { allowed: false, reason: 'Chỉ đăng ký chờ duyệt mới được xét duyệt.' }
      registration.rowVersion = secondVersion
      return response(null)
    }
    if (url.pathname.endsWith('/registration')) {
      if (failure === 'detail' || failure === 'reload') return response(null, 500)
      return response(structuredClone(registration))
    }
    if (failure === 'list') return response(null, 500)
    const rows = url.searchParams.get('state') === 'SUBMITTED' && registration.summary.state !== 'SUBMITTED' ? [] : [structuredClone(registration.summary)]
    return response(rows, 200, { pagination: { page: Number(url.searchParams.get('page') ?? 1), pageSize: 10, totalItems: 25, totalPages: 3 } })
  }))
})
afterEach(() => { clients.forEach(c => c.clear()); useAuthStore.getState().logout(); vi.unstubAllGlobals(); focusManager.setFocused(undefined) })

describe('Admin registration SQL HTTP boundary', () => {
  it('corrects one identified shared row with opened versions, confirmation and committed reload', async () => {
    registration.roster.push({ ...registration.roster[0], id: 'other-row', rowNumber: 7, displayName: 'Người khác', email: 'other@example.com' })
    renderAt('/admin/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa email dòng 4' }))
    const dialog = screen.getByRole('dialog', { name: 'Sửa email dòng 4?' })
    expect(within(dialog).getByText(/chưa cấp mã hoặc gửi lời mời/i)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Email mới'), { target: { value: '  FIXED@example.com  ' } })
    expect(corrections).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận sửa email' }))
    expect(await screen.findByText('Email đã được cập nhật.')).toBeInTheDocument()
    expect(await screen.findByText('fixed@example.com')).toBeInTheDocument()
    expect(screen.getByText('other@example.com')).toBeInTheDocument()
    expect(corrections).toEqual([{ requestId: expect.any(String), email: 'FIXED@example.com', expectedRowVersion: firstVersion,
      expectedTourRowVersion: secondVersion, expectedRosterRowVersion: firstVersion, expectedInvitationRowVersion: null }])
    expect(decisions).toHaveLength(0)
    expect(registration.summary.state).toBe('SUBMITTED')
  })

  it('shows approved revocation consequences and keeps APPROVED after correction', async () => {
    registration.summary.state = 'APPROVED'; registration.review.allowed = false
    registration.roster[0].invitationRowVersion = secondVersion
    renderAt('/admin/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa email dòng 4' }))
    const dialog = screen.getByRole('dialog', { name: 'Sửa email dòng 4?' })
    expect(within(dialog).getByText(/gửi thư lỗi không khôi phục mã cũ/i)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Email mới'), { target: { value: 'approved@example.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận sửa email' }))
    expect(await screen.findByText(/Email đã được cập nhật. Mã cũ đã bị vô hiệu hóa/)).toBeInTheDocument()
    expect(corrections[0].expectedInvitationRowVersion).toBe(secondVersion)
    expect(registration.summary.state).toBe('APPROVED')
    expect(screen.getByRole('region', { name: 'Hỗ trợ lời mời' })).toBeInTheDocument()
  })

  it('keeps rejection metadata and waits for review without issuing access', async () => {
    registration.summary.state = 'REJECTED'; registration.review.allowed = false; registration.rejectionReason = 'Cần sửa email'
    renderAt('/admin/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa email dòng 4' }))
    fireEvent.change(screen.getByLabelText('Email mới'), { target: { value: 'fixed@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa email' }))
    await screen.findByText('Email đã được cập nhật.')
    expect(screen.getByText('Lý do từ chối: Cần sửa email')).toBeInTheDocument()
    expect(registration.summary.state).toBe('REJECTED')
    expect(screen.queryByRole('region', { name: 'Hỗ trợ lời mời' })).not.toBeInTheDocument()
  })

  it('retains exactly the request and snapshot after a lost committed response', async () => {
    failure = 'uncertain-commit'; renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa email dòng 4' }))
    fireEvent.change(screen.getByLabelText('Email mới'), { target: { value: 'fixed@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa xác nhận được kết quả')
    expect(screen.getByLabelText('Email mới')).toHaveAttribute('readonly')
    failure = null
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại cùng yêu cầu' }))
    await screen.findByText('Email đã được cập nhật.')
    expect(corrections).toHaveLength(2)
    expect(corrections[1]).toEqual(corrections[0])
  })

  it.each(['duplicate', 'invalid'] as const)('allows correcting a confirmed %s error using a new request', async mode => {
    failure = mode; renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa email dòng 4' }))
    fireEvent.change(screen.getByLabelText('Email mới'), { target: { value: 'taken@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(mode === 'duplicate' ? 'Email đã được đăng ký' : 'không hợp lệ')
    expect(screen.getByLabelText('Email mới')).not.toHaveAttribute('readonly')
    failure = null
    fireEvent.change(screen.getByLabelText('Email mới'), { target: { value: 'fixed@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa email' }))
    await screen.findByText('Email đã được cập nhật.')
    expect(corrections[1].requestId).not.toBe(corrections[0].requestId)
  })

  it.each(['stale', 'forbidden'] as const)('blocks writes after %s until an explicit successful reload', async mode => {
    failure = mode; renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa email dòng 4' }))
    fireEvent.change(screen.getByLabelText('Email mới'), { target: { value: 'fixed@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa email' }))
    await screen.findByText(/Dữ liệu đã thay đổi hoặc Tour đã khóa/)
    if (mode === 'forbidden') expect(screen.getByText(/Chỉ quản trị viên được sửa email/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sửa email dòng 4' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Duyệt đăng ký' })).not.toBeInTheDocument()
    failure = 'reload'; fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    await screen.findByText('Không tải được đăng ký này.')
    failure = null; registration.roster[0].rowVersion = secondVersion
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sửa email dòng 4' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Sửa email dòng 4' }))
    fireEvent.change(screen.getByLabelText('Email mới'), { target: { value: 'fixed@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận sửa email' }))
    await screen.findByText('Email đã được cập nhật.')
    expect(corrections[1].expectedRosterRowVersion).toBe(secondVersion)
  })

  it('disables email correction using the server gate and displays the reopen instruction', async () => {
    registration.summary.tourState = 'READY'; registration.correctEmail = { allowed: false, reason: 'Tour đã READY. Mở lại về SCHEDULED trước khi sửa email.' }
    renderAt()
    expect(await screen.findByRole('button', { name: 'Sửa email dòng 4' })).toBeDisabled()
    expect(screen.getByText(/Mở lại về SCHEDULED/)).toBeInTheDocument()
    expect(corrections).toHaveLength(0)
  })

  it('filters the redesigned tabs on the server and resets pagination', async () => {
    renderAt('/admin/registrations?page=3', 'all')
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
    expect(requests.find(u => u.pathname === '/api/admin/registrations')?.searchParams.get('state')).toBe('SUBMITTED')
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(requests.some(u => u.searchParams.get('page') === '2')).toBe(true))
    expect(screen.queryByText('Số học sinh')).not.toBeInTheDocument()
  })

  it('approves the opened SQL versions with confirmation and truthful access boundary', async () => {
    renderAt('/admin/registrations?review=registration', 'all')
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt đăng ký' }))
    const dialog = await screen.findByRole('dialog', { name: 'Duyệt Đoàn A?' })
    expect(within(dialog).getByText(/gửi email lỗi vẫn giữ đăng ký đã duyệt/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByText('Quyết định đã được lưu.')).toBeInTheDocument()
    await screen.findByRole('region', { name: 'Hỗ trợ lời mời' })
    expect(decisions).toEqual([{ action: 'approve', input: { expectedRowVersion: firstVersion, expectedTourRowVersion: secondVersion } }])
    expect(screen.queryByRole('button', { name: 'Gửi thông tin' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mã đoàn:/)).not.toBeInTheDocument()
  })

  it('requires a rejection reason and displays the saved reason', async () => {
    renderAt('/admin/registrations?review=registration', 'all')
    const sheet = await screen.findByRole('dialog', { name: 'Đoàn A' })
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Từ chối' }))
    const dialog = await screen.findByRole('dialog', { name: 'Từ chối Đoàn A?' })
    const submit = within(dialog).getByRole('button', { name: 'Từ chối' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Lý do từ chối/ }), { target: { value: '  Sửa email  ' } })
    fireEvent.click(submit)
    expect(await screen.findByText('Lý do từ chối: Sửa email')).toBeInTheDocument()
    expect(decisions[0].input.reason).toBe('Sửa email')
  })

  it('keeps focus refresh from replacing a reviewed snapshot, then explicitly reloads after conflict', async () => {
    renderAt()
    await screen.findByText('Phòng A')
    registration.rowVersion = secondVersion
    registration.roster[0].displayName = 'Phòng mới'
    const reads = requests.filter(u => u.pathname.endsWith('/registration')).length
    await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true) })
    expect(requests.filter(u => u.pathname.endsWith('/registration'))).toHaveLength(reads)
    expect(screen.queryByText('Phòng mới')).not.toBeInTheDocument()
    failure = 'stale'
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt đăng ký' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Duyệt Đoàn A?' })).getByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByText(/Dữ liệu đã thay đổi hoặc Tour đã khóa/)).toBeInTheDocument()
    expect(decisions[0].input.expectedRowVersion).toBe(firstVersion)
    expect(screen.queryByRole('button', { name: 'Duyệt đăng ký' })).not.toBeInTheDocument()
    failure = 'reload'
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(await screen.findByText('Không tải được đăng ký này.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt đăng ký' })).not.toBeInTheDocument()
    failure = null
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Phòng mới')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt đăng ký' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Duyệt Đoàn A?' })).getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(decisions).toHaveLength(2))
    expect(decisions[1].input.expectedRowVersion).toBe(secondVersion)
  })

  it('shows load failure with retry and never fills the queue from mock data', async () => {
    failure = 'list'; renderAt('/admin/registrations/pending')
    expect(await screen.findByText('Không thể tải danh sách đăng ký.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    failure = null
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('table', { name: 'Đăng ký từ đại diện' })).toBeInTheDocument()
  })

  it('keeps an unsuccessful decision visible without pretending approval succeeded', async () => {
    failure = 'network'; renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt đăng ký' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Duyệt Đoàn A?' })).getByRole('button', { name: 'Duyệt' }))
    expect(await within(screen.getByRole('dialog', { name: 'Duyệt Đoàn A?' })).findByRole('alert')).toHaveTextContent('Không thực hiện được.')
    expect(registration.summary.state).toBe('SUBMITTED')
    expect(screen.queryByText('Quyết định đã được lưu.')).not.toBeInTheDocument()
  })

  it('explains an inverted Tour date range instead of sending a request that can only fail', async () => {
    renderAt('/admin/registrations?from=2026-10-10&to=2026-10-09', 'all')
    expect(await screen.findByText('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.')).toBeInTheDocument()
    expect(requests.some(u => u.pathname === '/api/admin/registrations')).toBe(false)
    expect(screen.queryByText('Không thể tải danh sách đăng ký.')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tour đến ngày (UTC+7)'), { target: { value: '2026-10-10' } })
    await waitFor(() => expect(requests.some(u => u.searchParams.get('to') === '2026-10-10T17:00:00.000Z')).toBe(true))
  })

  it('counts the sidebar queue badge from the live SQL total, never from simulated registrations', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    clients.push(client)
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/registrations/pending']}><Routes>
      <Route path="/admin" element={<AdminShell />}><Route path="registrations/pending" element={<p>Hàng chờ</p>} /></Route>
    </Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByLabelText('25 đoàn chờ duyệt')).toBeInTheDocument()
    const count = requests.find(u => u.pathname === '/api/admin/registrations' && u.searchParams.get('size') === '1')
    expect(count?.searchParams.get('state')).toBe('SUBMITTED')
  })

  it('hides the sidebar count when its SQL refresh fails instead of retaining a stale or simulated count', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    clients.push(client)
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/registrations/pending']}><Routes>
      <Route path="/admin" element={<AdminShell />}><Route path="registrations/pending" element={<p>Hàng chờ</p>} /></Route>
    </Routes></MemoryRouter></QueryClientProvider>)
    await screen.findByLabelText('25 đoàn chờ duyệt')
    failure = 'list'
    await act(async () => { await client.invalidateQueries({ queryKey: ['admin-registration-review', 'sql-admin', 'list'] }) })
    await waitFor(() => expect(screen.queryByLabelText(/\d+ đoàn chờ duyệt/)).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Chờ duyệt' })).toBeInTheDocument()
  })

  it('uses Vietnam date boundaries with an exclusive upper bound', () => {
    expect(dateBoundary('2026-10-08')).toBe('2026-10-07T17:00:00.000Z')
    expect(dateBoundary('2026-10-08', true)).toBe('2026-10-08T17:00:00.000Z')
  })
})
