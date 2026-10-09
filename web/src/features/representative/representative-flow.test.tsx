import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import RepresentativeShell from './RepresentativeShell'
import RepDashboardPage from '../../routes/representative/RepDashboardPage'
import RepToursPage from '../../routes/representative/RepToursPage'
import RepTourDetailPage from '../../routes/representative/RepTourDetailPage'
import RepRegistrationsPage from '../../routes/representative/RepRegistrationsPage'
import RepRegistrationDetailPage from '../../routes/representative/RepRegistrationDetailPage'
import RepRegisterPage from '../../routes/representative/RepRegisterPage'
import { useAuthStore } from '../../stores/auth-store'
import type { RegistrationInput, RepresentativeRegistration, RepresentativeTour } from './api/types'
import { rosterTemplateBytes } from './roster-import'

const version = 'AAAAAAAAAAE='
const tour: RepresentativeTour = { id: 'tour', name: 'Tour thật', description: 'Tuyến chuẩn bị', scheduledStartAt: '2026-10-20T02:00:00Z', state: 'SCHEDULED',
  rowVersion: version, routeName: 'Tuyến A', stops: [{ order: 1, name: 'POI A', description: null }], register: { allowed: true, reason: null } }
const initial: RepresentativeRegistration = {
  summary: { id: 'registration', tourId: 'tour', tourName: tour.name, tourScheduledStartAt: tour.scheduledStartAt, tourState: 'SCHEDULED',
    schoolName: 'Trường A', groupName: 'Đoàn A', state: 'SUBMITTED', rowCount: 1, submittedAt: tour.scheduledStartAt, updatedAt: tour.scheduledStartAt },
  contactName: 'Người phụ trách', contactEmail: 'contact@example.com', rowVersion: version, tourRowVersion: version,
  rejectionReason: null, reviewedAt: null, roster: [{ rowNumber: 2, rowType: 'SHARED_VIEWING', displayName: 'Phòng A', email: 'room@example.com', className: null }],
  allowedActions: { edit: { allowed: true, reason: null }, resubmit: { allowed: false, reason: 'Chưa thể gửi lại' }, cancel: { allowed: true, reason: null } },
}
let registration: RepresentativeRegistration
let submitAttempts: { key: string; input: RegistrationInput }[]
let failSubmit: boolean
let failUpdate: boolean | 'email'
let cancelledVersion: string | null
let replacedVersion: string | null
let clients: QueryClient[]
let missingRegistration: boolean
function response(data: unknown, status = 200, extra: object = {}) {
  return new Response(JSON.stringify({ success: status === 200, message: status === 409 ? 'Dữ liệu đã thay đổi.' : 'OK', data,
    errors: status === 409 ? { code: 'STALE_VERSION', fields: null } : null, ...extra }), { status })
}
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchInterval: false }, mutations: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/dai-dien" element={<RepresentativeShell />}>
      <Route index element={<RepDashboardPage />} /><Route path="buoi" element={<RepToursPage />} />
      <Route path="buoi/:tourId" element={<RepTourDetailPage />} /><Route path="buoi/:tourId/dang-ky" element={<RepRegisterPage />} />
      <Route path="dang-ky" element={<RepRegistrationsPage />} /><Route path="dang-ky/:registrationId" element={<RepRegistrationDetailPage />} />
      <Route path="dang-ky/:registrationId/sua" element={<RepRegisterPage />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
  return client
}
beforeEach(() => {
  registration = structuredClone(initial)
  clients = []; submitAttempts = []; failSubmit = false; failUpdate = false; replacedVersion = null; cancelledVersion = null; missingRegistration = false
  useAuthStore.getState().setAuth('real-test-token', { userId: 'owner', username: 'real.representative', role: 'Representative' })
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer real-test-token')
    const url = new URL(input, 'https://api.example.test')
    if (url.pathname === '/api/registrations/registration/invitations')
      return response({ enabled: false, canIssue: false, items: [] })
    const path = url.pathname.replace('/api/representative', '')
    if (options?.method === 'POST' && path === '/tours/tour/registrations') {
      const payload = JSON.parse(options.body as string) as RegistrationInput
      submitAttempts.push({ key: (options.headers as Record<string, string>)['Idempotency-Key'], input: payload })
      if (failSubmit) { failSubmit = false; throw new TypeError('Connection lost after commit') }
      registration = { ...registration, roster: payload.roster, summary: { ...registration.summary, ...payload, rowCount: payload.roster.length }, contactName: payload.contactName, contactEmail: payload.contactEmail }
      return response({ id: registration.summary.id })
    }
    if (options?.method === 'PUT') {
      replacedVersion = JSON.parse(options.body as string).expectedRowVersion
      return failUpdate === 'email'
        ? response(null, 409, { message: 'Có email đã được đăng ký trong Tour này.', errors: { code: 'EMAIL_RESERVED', fields: { 'Roster[0].Email': ['Email đã được đăng ký trong Tour này.'] } } })
        : response(null, failUpdate ? 409 : 200)
    }
    if (options?.method === 'POST' && path.endsWith('/cancel')) { cancelledVersion = JSON.parse(options.body as string).expectedRowVersion; registration.summary.state = 'CANCELLED'; return response(null) }
    if (path === '/tours/tour') return response(tour)
    if (path === '/tours') return response([tour], 200, { pagination: { page: 1, pageSize: 20, totalItems: 42, totalPages: 3 } })
    if (path === '/registrations/registration') return missingRegistration ? response(null, 404, { message: 'Không tìm thấy dữ liệu.' }) : response(structuredClone(registration))
    if (path === '/registrations') return response([registration.summary], 200, { pagination: { page: 1, pageSize: 20, totalItems: 25, totalPages: 2 } })
    throw new Error('Unexpected endpoint ' + path)
  }))
})
afterEach(() => { clients.forEach(c => c.clear()); useAuthStore.getState().logout(); vi.unstubAllGlobals() })

describe('Representative real HTTP contract', () => {
  it('shows a registration error instead of an infinite loading skeleton', async () => {
    missingRegistration = true
    renderAt('/dai-dien/dang-ky/registration/sua')
    expect(await screen.findByText('Không mở được đăng ký')).toBeInTheDocument()
    expect(screen.queryByText('Đang tải dữ liệu…')).not.toBeInTheDocument()
  })

  it('uses server totals and shows actual account identity without a mock ribbon', async () => {
    renderAt('/dai-dien')
    expect(await screen.findByRole('heading', { name: 'Buổi đang nhận đăng ký' })).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getAllByText('25').length).toBeGreaterThan(0)
    expect(screen.getByText('real.representative')).toBeInTheDocument()
    expect(screen.queryByText(/mô phỏng/)).not.toBeInTheDocument()
  })
  it('keeps a register action even when the Representative already has a group', async () => {
    renderAt('/dai-dien/buoi/tour')
    expect(await screen.findByRole('link', { name: 'Đăng ký đoàn' })).toHaveAttribute('href', '/dai-dien/buoi/tour/dang-ky')
    expect(await screen.findByRole('link', { name: 'Xem tất cả (25)' })).toHaveAttribute('href', '/dai-dien/dang-ky?tourId=tour')
  })
  it('imports mixed XLSX, submits exact row types and retries the same uncertain intent', async () => {
    failSubmit = true
    renderAt('/dai-dien/buoi/tour/dang-ky')
    fireEvent.change(await screen.findByLabelText(/Tên trường/), { target: { value: 'Trường B' } })
    fireEvent.change(screen.getByLabelText(/Tên đoàn/), { target: { value: 'Đoàn B' } })
    fireEvent.change(screen.getByLabelText(/Người liên hệ/), { target: { value: 'Đại diện B' } })
    fireEvent.change(screen.getByLabelText(/Email liên hệ/), { target: { value: 'contact@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    const bytes = rosterTemplateBytes()
    const file = new File([bytes as BlobPart], 'mixed.xlsx')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
    fireEvent.change(screen.getByLabelText('Chọn file Excel danh sách lời mời'), { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận sử dụng danh sách này' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đăng ký' }))
    expect(submitAttempts).toHaveLength(0)
    fireEvent.click(screen.getByRole('checkbox', { name: /có quyền cung cấp thông tin đăng ký/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đăng ký' }))
    expect(await screen.findByText('Lần gửi trước chưa được xác nhận')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử gửi lại' }))
    expect(await screen.findByRole('heading', { name: 'Đoàn B' })).toBeInTheDocument()
    expect(submitAttempts).toHaveLength(2)
    expect(submitAttempts[1]).toEqual(submitAttempts[0])
    expect(submitAttempts[0].input.roster.map(r => r.rowType)).toEqual(['INDIVIDUAL', 'SHARED_VIEWING'])
    expect(submitAttempts[0].input.expectedTourRowVersion).toBe(version)
    expect(screen.queryByText(/Mã đoàn/)).not.toBeInTheDocument()
  })
  it('retains the draft version across polling and requires explicit reload after 409', async () => {
    failUpdate = true
    const client = renderAt('/dai-dien/dang-ky/registration/sua')
    fireEvent.change(await screen.findByLabelText(/Tên đoàn/), { target: { value: 'Bản nháp' } })
    registration.rowVersion = 'AAAAAAAAAAI='
    await client.invalidateQueries({ queryKey: ['representative', 'owner', 'registration', 'registration'] })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /có quyền cung cấp thông tin đăng ký/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Dữ liệu đã thay đổi.')).toBeInTheDocument()
    expect(replacedVersion).toBe(version)
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại dữ liệu và bắt đầu lại' }))
    await waitFor(() => expect(screen.getByLabelText(/Tên đoàn/)).toHaveValue('Đoàn A'))
  })
  it('keeps the draft and shows the conflicting roster row for an email reservation', async () => {
    failUpdate = 'email'
    renderAt('/dai-dien/dang-ky/registration/sua')
    fireEvent.change(await screen.findByLabelText(/Tên đoàn/), { target: { value: 'Bản nháp email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /có quyền cung cấp thông tin đăng ký/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Có email đã được đăng ký trong Tour này.')).toBeInTheDocument()
    expect(screen.getByText('Bản nháp email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Tải lại dữ liệu và bắt đầu lại' })).not.toBeInTheDocument()
  })
  it('freezes the cancel confirmation version while background data changes', async () => {
    const client = renderAt('/dai-dien/dang-ky/registration')
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy đăng ký' }))
    registration.rowVersion = 'AAAAAAAAAAI='
    await client.invalidateQueries({ queryKey: ['representative', 'owner', 'registration', 'registration'] })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }))
    await waitFor(() => expect(cancelledVersion).toBe(version))
  })
  it('reads approved rows but never shows legacy access or an approved edit action', async () => {
    registration.summary.state = 'APPROVED'
    registration.allowedActions = Object.fromEntries(['edit', 'resubmit', 'cancel'].map(k => [k, { allowed: false, reason: 'Chức năng sau duyệt chưa được triển khai.' }])) as RepresentativeRegistration['allowedActions']
    renderAt('/dai-dien/dang-ky/registration')
    expect(await screen.findByRole('region', { name: 'Hỗ trợ lời mời' })).toBeInTheDocument()
    expect(await screen.findByText('Hỗ trợ lời mời chưa được bật. Liên hệ quản trị hệ thống.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Danh sách lời mời' })).toHaveTextContent('Phòng A')
    expect(screen.queryByRole('link', { name: /Sửa/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mã đoàn|Sao chép mã|Nhập họ tên/)).not.toBeInTheDocument()
  })
  it('surfaces an API error without replacing it with mock data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(null, 503, { message: 'Unavailable' })))
    renderAt('/dai-dien/buoi')
    expect(await screen.findByText('Không tải được Tour')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đăng ký đoàn' })).not.toBeInTheDocument()
  })
  it('removes the previous owner cache when identity changes', async () => {
    const client = renderAt('/dai-dien')
    await screen.findByRole('heading', { name: 'Hoạt động gần đây' })
    expect(client.getQueriesData({ queryKey: ['representative', 'owner'] }).length).toBeGreaterThan(0)
    useAuthStore.getState().setAuth('new-token', { userId: 'another-owner', username: 'another', role: 'Representative' })
    await waitFor(() => expect(client.getQueriesData({ queryKey: ['representative', 'owner'] })).toHaveLength(0))
  })
})
