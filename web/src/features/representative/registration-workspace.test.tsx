import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import RepresentativeShell from './RepresentativeShell'
import RepRegistrationsPage from '../../routes/representative/RepRegistrationsPage'
import RepRegistrationDetailPage from '../../routes/representative/RepRegistrationDetailPage'
import { useAuthStore } from '../../stores/auth-store'
import type { RepresentativeRegistration, RosterEmailChange, RosterEmailChangeInput } from './api/types'

const version = 'AAAAAAAAAAE='
const nextVersion = 'AAAAAAAAAAI='
const stamp = '2030-11-12T01:30:00Z'
const initial: RepresentativeRegistration = {
  summary: { id: 'record', tourId: 'tour', tourName: 'Buổi thư viện', tourScheduledStartAt: stamp, tourState: 'SCHEDULED', schoolName: 'Trường kiểm thử', groupName: 'Đoàn kiểm thử', state: 'APPROVED', rowCount: 3, submittedAt: stamp, updatedAt: stamp },
  contactName: 'Liên hệ', contactEmail: 'contact@example.test', rowVersion: version, tourRowVersion: version, rejectionReason: null, reviewedAt: stamp,
  allowedActions: { edit: { allowed: false, reason: 'Không thể sửa.' }, resubmit: { allowed: false, reason: 'Không thể gửi lại.' }, cancel: { allowed: true, reason: null } },
  roster: [
    { id: 'accepted', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Người được duyệt', email: 'old@example.test', className: '10A', participationState: 'ACCEPTED', rowVersion: version, canRequestEmailChange: true },
    { id: 'pending', rowNumber: 3, rowType: 'SHARED_VIEWING', displayName: 'Phòng đang chờ', email: 'room@example.test', className: null, participationState: 'PENDING', rowVersion: version, canRequestEmailChange: false },
    { id: 'rejected', rowNumber: 4, rowType: 'INDIVIDUAL', displayName: 'Người bị từ chối', email: 'reject@example.test', className: '10B', participationState: 'REJECTED', reviewReason: 'Cần xác minh lớp.', rowVersion: version, canRequestEmailChange: false },
  ],
}
let registration: RepresentativeRegistration
let changes: RosterEmailChange[]
let attempts: RosterEmailChangeInput[]
let failure: 'network' | 'conflict' | 'validation' | null
let clients: QueryClient[]
function response(data: unknown, status = 200, extra = {}) { return new Response(JSON.stringify({ success: status < 400, data, message: status === 409 ? 'Dữ liệu đã thay đổi.' : 'OK', ...extra }), { status }) }
function Location() { const location = useLocation(); return <output aria-label="Địa chỉ hiện tại">{location.pathname}{location.search}</output> }
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Location /><Routes><Route path="/dai-dien" element={<RepresentativeShell />}><Route path="dang-ky" element={<RepRegistrationsPage />} /><Route path="dang-ky/:registrationId" element={<RepRegistrationDetailPage />} /></Route></Routes></MemoryRouter></QueryClientProvider>)
  return client
}
beforeEach(() => {
  registration = structuredClone(initial); changes = []; attempts = []; failure = null; clients = []
  useAuthStore.getState().setAuth('token', { userId: 'owner', username: 'representative.test', role: 'Representative' })
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input, 'https://example.test')
    expect(new Headers(options?.headers).get('Authorization')).toBe(`Bearer ${useAuthStore.getState().accessToken}`)
    if (url.pathname === '/api/representative/registrations/record/rows/accepted/email-change-requests') {
      const body = JSON.parse(options!.body as string) as RosterEmailChangeInput
      attempts.push(body)
      if (failure === 'network') { failure = null; throw new TypeError('Connection lost after commit') }
      if (failure === 'conflict') return response(null, 409, { errors: { code: 'STALE_VERSION', fields: null } })
      if (failure === 'validation') return response(null, 400, { errors: { ProposedEmail: ['Địa chỉ email chưa hợp lệ theo kiểm tra máy chủ.'] } })
      return response('request')
    }
    if (url.pathname === '/api/representative/registrations/record/email-change-requests') return response(changes)
    if (url.pathname === '/api/representative/registrations/record') return response(structuredClone(registration))
    if (url.pathname === '/api/representative/registrations') return response([registration.summary], 200, { pagination: { page: Number(url.searchParams.get('page') || 1), pageSize: 20, totalItems: 30, totalPages: 2 } })
    if (url.pathname === '/api/registrations/record/invitations') return response({ enabled: true, canIssue: true, items: [] })
    throw new Error('Unexpected endpoint ' + url.pathname)
  }))
})
afterEach(() => { clients.forEach(client => client.clear()); useAuthStore.getState().logout(); vi.unstubAllGlobals() })

describe('Representative registration workspace HTTP behavior', () => {
  it('shows mixed decisions and row reasons despite APPROVED aggregate; keeps search and selection through tabs and back', async () => {
    renderAt('/dai-dien/dang-ky/record?tab=roster&page=2&search=thuvien&selected=record')
    const table = await screen.findByRole('table', { name: 'Danh sách lời mời' })
    expect(screen.getByText('Giờ bắt đầu')).toBeInTheDocument()
    expect(screen.getByText('Hạn đăng ký và thêm dòng')).toBeInTheDocument()
    expect(screen.getByText(/10\/11\/2030/)).toBeInTheDocument()
    expect(within(table).getByText('Đã chấp nhận')).toBeInTheDocument()
    expect(within(table).getByText('Chờ duyệt')).toBeInTheDocument()
    expect(within(table).getByText('Cần xác minh lớp.')).toBeInTheDocument()
    expect(within(table).getAllByRole('link', { name: 'Yêu cầu đổi email' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Chấp nhận|Từ chối/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Lời mời' }))
    expect(await screen.findByRole('button', { name: 'Cấp và gửi lời mời' })).toBeInTheDocument()
    expect(screen.getByText(/10\/11\/2030/)).toBeInTheDocument()
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('page=2&search=thuvien&selected=record')
    fireEvent.click(screen.getByRole('link', { name: 'Danh sách đăng ký' }))
    await waitFor(() => expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('/dai-dien/dang-ky?'))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('selected=record')
  })
  it('uses exact email-change fields and retries an uncertain attempt unchanged after newer registration data arrives', async () => {
    failure = 'network'
    const client = renderAt('/dai-dien/dang-ky/record?tab=email-change&row=accepted')
    fireEvent.change(await screen.findByLabelText('Email đề xuất'), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi xác nhận/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' }))
    expect(await screen.findByText('Chưa xác nhận được kết quả gửi')).toBeInTheDocument()
    registration = { ...registration, rowVersion: nextVersion, tourRowVersion: nextVersion, roster: registration.roster.map(row => ({ ...row, rowVersion: nextVersion })) }
    await act(() => client.invalidateQueries({ queryKey: ['representative', 'owner', 'registration', 'record'] }))
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại cùng yêu cầu' }))
    expect(await screen.findByText('Đã gửi yêu cầu, chờ Staff duyệt')).toBeInTheDocument()
    expect(attempts).toHaveLength(2)
    expect(attempts[1]).toEqual(attempts[0])
    expect(attempts[0]).toEqual({ requestId: expect.any(String), proposedEmail: 'new@example.test', expectedTourRowVersion: version, expectedRegistrationRowVersion: version, expectedRowVersion: version })
    expect(screen.getByText('old@example.test')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Lý do đề nghị/)).not.toBeInTheDocument()
  })
  it('keeps a rejected email draft editable and creates a new request ID after correcting a 400 response', async () => {
    failure = 'validation'
    renderAt('/dai-dien/dang-ky/record?tab=email-change')
    fireEvent.change(await screen.findByLabelText('Email đề xuất'), { target: { value: 'bad@example.test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi xác nhận/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' }))
    expect(await screen.findByText('Địa chỉ email chưa hợp lệ theo kiểm tra máy chủ.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email đề xuất')).toHaveValue('bad@example.test')
    expect(screen.getByLabelText('Email đề xuất')).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: /Tôi xác nhận/ })).toBeChecked()
    fireEvent.change(screen.getByLabelText('Email đề xuất'), { target: { value: 'corrected@example.test' } })
    failure = null
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' }))
    await screen.findByText('Đã gửi yêu cầu, chờ Staff duyệt')
    expect(attempts).toHaveLength(2)
    expect(attempts[1].proposedEmail).toBe('corrected@example.test')
    expect(attempts[1].requestId).not.toBe(attempts[0].requestId)
    expect(attempts[1].expectedRowVersion).toBe(attempts[0].expectedRowVersion)
  })
  it('preserves selected registration and active tab while paging the internal list and opening the mobile chooser', async () => {
    renderAt('/dai-dien/dang-ky/record?tab=roster&selected=record')
    await screen.findByRole('table', { name: 'Danh sách lời mời' })
    fireEvent.click(await screen.findByRole('button', { name: 'Trang sau' }))
    await waitFor(() => expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('page=2'))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('selected=record')
    expect(screen.getByRole('link', { name: 'Danh sách', current: 'page' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Chọn đăng ký khác' }))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('chooser=1')
    const list = screen.getByRole('complementary', { name: 'Danh sách đăng ký' })
    fireEvent.click(within(list).getByRole('link'))
    await waitFor(() => expect(screen.getByLabelText('Địa chỉ hiện tại')).not.toHaveTextContent('chooser=1'))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('page=2')
    expect(screen.getByRole('table', { name: 'Danh sách lời mời' })).toBeInTheDocument()
  })
  it.each(['permission', 'row-version', 'identity'] as const)('gates an email request when %s is missing', async missing => {
    if (missing === 'permission') registration.roster[0].canRequestEmailChange = false
    if (missing === 'row-version') registration.roster[0].rowVersion = undefined
    if (missing === 'identity') registration.roster[0].id = undefined
    renderAt('/dai-dien/dang-ky/record?tab=roster')
    await screen.findByRole('table')
    expect(screen.queryByRole('link', { name: 'Yêu cầu đổi email' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Đổi email' }))
    if (missing === 'identity') expect(await screen.findByText('Chưa có dòng được chấp nhận')).toBeInTheDocument()
    else {
      expect(await screen.findByText('Dòng này hiện không cho phép yêu cầu đổi email')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeDisabled()
    }
    expect(attempts).toHaveLength(0)
  })
  it('keeps current email and displays a pending request instead of allowing another request', async () => {
    changes = [{ id: 'change', registrationId: 'record', rowId: 'accepted', rowNumber: 2, currentEmail: 'old@example.test', proposedEmail: 'pending@example.test', state: 'PENDING', requestedByUserId: 'owner', createdAt: stamp, reviewedAt: null, reviewedByUserId: null, reviewReason: null, rowVersion: version, tourRowVersion: version, registrationRowVersion: version, rosterRowVersion: version, canReview: false }]
    renderAt('/dai-dien/dang-ky/record?tab=email-change')
    expect(await screen.findByText('Đã có yêu cầu chờ Staff duyệt')).toBeInTheDocument()
    expect(screen.getByText('Email hiện tại: old@example.test. Không thể tạo thêm yêu cầu đang chờ cho cùng dòng.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu duyệt' })).not.toBeInTheDocument()
  })
  it('requires explicit refresh after 409 before a new attempt uses newer versions', async () => {
    failure = 'conflict'
    const client = renderAt('/dai-dien/dang-ky/record?tab=email-change')
    fireEvent.change(await screen.findByLabelText('Email đề xuất'), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi xác nhận/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' }))
    expect(await screen.findByText('Dữ liệu đã thay đổi.')).toBeInTheDocument()
    registration.rowVersion = nextVersion
    await act(() => client.invalidateQueries({ queryKey: ['representative', 'owner', 'registration', 'record'] }))
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại dữ liệu và bắt đầu lại' }))
    await waitFor(() => expect(screen.getByLabelText('Email đề xuất')).toHaveValue(''))
    failure = null
    fireEvent.change(screen.getByLabelText('Email đề xuất'), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi xác nhận/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' }))
    await screen.findByText('Đã gửi yêu cầu, chờ Staff duyệt')
    expect(attempts[1].expectedRegistrationRowVersion).toBe(nextVersion)
    expect(attempts[1].requestId).not.toBe(attempts[0].requestId)
  })
  it('retains the original email after Staff rejects an earlier email-change request', async () => {
    changes = [{ id: 'rejected-change', registrationId: 'record', rowId: 'accepted', rowNumber: 2, currentEmail: 'old@example.test', proposedEmail: 'rejected-new@example.test', state: 'REJECTED', requestedByUserId: 'owner', createdAt: stamp, reviewedAt: stamp, reviewedByUserId: 'staff', reviewReason: 'Địa chỉ chưa được xác minh.', rowVersion: version, tourRowVersion: version, registrationRowVersion: version, rosterRowVersion: version, canReview: false }]
    renderAt('/dai-dien/dang-ky/record?tab=email-change')
    expect(await screen.findByLabelText('Email đề xuất')).toHaveValue('')
    expect(screen.getByText('old@example.test')).toBeInTheDocument()
    expect(screen.getByText('Lý do: Địa chỉ chưa được xác minh.')).toBeInTheDocument()
    expect(screen.getByText('Email đề xuất: rejected-new@example.test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeInTheDocument()
    expect(attempts).toHaveLength(0)
  })
  it('scopes email history to the signed-in owner and removes the previous owner cache', async () => {
    const client = renderAt('/dai-dien/dang-ky/record?tab=email-change')
    await screen.findByLabelText('Email đề xuất')
    expect(client.getQueryData(['representative', 'owner', 'email-changes', 'record'])).toEqual([])
    act(() => useAuthStore.getState().setAuth('other-token', { userId: 'other', username: 'other.rep', role: 'Representative' }))
    await waitFor(() => expect(client.getQueriesData({ queryKey: ['representative', 'owner'] })).toHaveLength(0))
    await waitFor(() => expect(client.getQueryData(['representative', 'other', 'email-changes', 'record'])).toEqual([]))
  })
})
