import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import RepRegisterPage from '../../routes/representative/RepRegisterPage'
import { useAuthStore } from '../../stores/auth-store'
import type { RegistrationInput, RepresentativeRegistration, RepresentativeTour } from './api/types'

const version = 'AAAAAAAAAAE='
const nextVersion = 'AAAAAAAAAAI='
let tour: RepresentativeTour
let registration: RepresentativeRegistration
let existing: boolean
let lookupFailure: boolean
let createFailure: boolean
let updateFailure: boolean
let writes: { method: string; body: unknown; key: string | null }[]
let clients: QueryClient[]
function response(data: unknown, status = 200, extra: object = {}) {
  return new Response(JSON.stringify({ success: status === 200, message: status === 409 ? 'Dữ liệu đã thay đổi.' : 'OK', data,
    errors: status === 409 ? { code: 'STALE_VERSION', fields: {} } : null, ...extra }), { status })
}
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchInterval: false }, mutations: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/dai-dien/buoi/:tourId/dang-ky" element={<RepRegisterPage />} />
    <Route path="/dai-dien/dang-ky/:registrationId/sua" element={<RepRegisterPage />} />
    <Route path="/dai-dien/dang-ky/:registrationId" element={<h1>Hồ sơ đã lưu</h1>} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return client
}
async function moveToReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
  await screen.findByLabelText('Chọn file Excel danh sách lời mời')
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Tôi xác nhận có quyền cung cấp thông tin đăng ký và email lời mời trong danh sách này.' }))
}
beforeEach(() => {
  clients = []; writes = []; existing = false; lookupFailure = false; createFailure = false; updateFailure = false
  tour = { id: 'tour', name: 'Buổi tham quan', description: null, scheduledStartAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), state: 'SCHEDULED', rowVersion: version, routeName: 'Tuyến', stops: [], register: { allowed: true, reason: null } }
  registration = {
    summary: { id: 'registration', tourId: 'tour', tourName: tour.name, tourScheduledStartAt: tour.scheduledStartAt, tourState: 'SCHEDULED', schoolName: 'Trường đăng ký', groupName: 'Đoàn đăng ký', state: 'APPROVED', rowCount: 1, submittedAt: tour.scheduledStartAt, updatedAt: tour.scheduledStartAt },
    contactName: 'Người liên hệ', contactEmail: 'contact@example.test', rowVersion: version, tourRowVersion: version, rejectionReason: null, reviewedAt: null,
    roster: [{ id: 'stable-row', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Người nhận', email: 'person@example.test', className: '12A', participationState: 'ACCEPTED', rowVersion: version, invitationRowVersion: version, canRemove: true, canRequestEmailChange: true }],
    allowedActions: { edit: { allowed: true, reason: null }, resubmit: { allowed: false, reason: 'Không áp dụng' }, cancel: { allowed: true, reason: null } },
  }
  useAuthStore.getState().setAuth('test-token', { userId: 'form-owner', username: 'representative', role: 'Representative' })
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input, 'https://api.example.test')
    const path = url.pathname.replace('/api/representative', '')
    if (options?.method === 'POST' || options?.method === 'PUT') {
      writes.push({ method: options.method, body: JSON.parse(options.body as string), key: new Headers(options.headers).get('Idempotency-Key') })
      if (options.method === 'POST') {
        if (createFailure) { createFailure = false; throw new TypeError('lost response') }
        return response({ id: 'registration' })
      }
      return response(null, updateFailure ? 409 : 200)
    }
    if (path === '/tours/tour') return response(structuredClone(tour))
    if (path === '/registrations/registration') return response(structuredClone(registration))
    if (path === '/registrations') {
      expect(url.searchParams.get('tourId')).toBe('tour')
      expect(url.searchParams.get('size')).toBe('1')
      return lookupFailure ? response(null, 500) : response(existing ? [registration.summary] : [], 200, { pagination: { page: 1, pageSize: 1, totalItems: existing ? 1 : 0, totalPages: 1 } })
    }
    throw new Error('Unexpected path ' + path)
  }))
})
afterEach(() => { clients.forEach(client => client.clear()); useAuthStore.getState().logout(); vi.unstubAllGlobals() })

describe('registration form live intent and version boundaries', () => {
  it('blocks direct creation when the owner already has a registration', async () => {
    existing = true
    renderAt('/dai-dien/buoi/tour/dang-ky')
    expect(await screen.findByRole('heading', { name: 'Bạn đã có đăng ký cho buổi này' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mở đăng ký của tôi' })).toHaveAttribute('href', '/dai-dien/dang-ky/registration')
    expect(screen.queryByLabelText(/Tên trường/)).toBeNull()
  })
  it('does not interpret a failed owner registration lookup as absence', async () => {
    lookupFailure = true
    renderAt('/dai-dien/buoi/tour/dang-ky')
    expect(await screen.findByText('Chưa kiểm tra được đăng ký hiện tại')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Tên trường/)).toBeNull()
    expect(writes).toHaveLength(0)
  })
  it('retries an uncertain create with exactly the same requestId, payload and tour version', async () => {
    createFailure = true
    const client = renderAt('/dai-dien/buoi/tour/dang-ky')
    fireEvent.change(await screen.findByLabelText(/Tên trường/), { target: { value: 'Trường mới' } })
    fireEvent.change(screen.getByLabelText(/Tên đoàn/), { target: { value: 'Đoàn mới' } })
    fireEvent.change(screen.getByLabelText(/Người liên hệ/), { target: { value: 'Liên hệ mới' } })
    fireEvent.change(screen.getByLabelText(/Email liên hệ/), { target: { value: 'new@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    const body = 'LoaiDong,HoTen,Email,Lop\nCA_NHAN,Người nhận,person@example.test,12A'
    const file = new File([body], 'roster.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(body).buffer })
    fireEvent.change(await screen.findByLabelText('Chọn file Excel danh sách lời mời'), { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận sử dụng danh sách này' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Tôi xác nhận có quyền/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đăng ký' }))
    expect(await screen.findByText('Lần gửi trước chưa được xác nhận')).toBeInTheDocument()
    tour.rowVersion = nextVersion
    existing = true // The first create may have committed before the response was lost.
    await act(async () => { await client.invalidateQueries({ queryKey: ['representative', 'form-owner'] }) })
    expect(screen.getByRole('checkbox', { name: /Tôi xác nhận có quyền/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Thử gửi lại' }))
    expect(await screen.findByRole('heading', { name: 'Hồ sơ đã lưu' })).toBeInTheDocument()
    expect(writes).toHaveLength(2)
    expect(writes[0]).toEqual(writes[1])
    expect(writes[0].key).toBeTruthy()
    expect((writes[0].body as RegistrationInput).expectedTourRowVersion).toBe(version)
  })
  it('whitelists unchanged accepted rows, preserves snapshot versions and requires explicit reload after 409', async () => {
    updateFailure = true
    tour.scheduledStartAt = new Date(Date.now() + 24 * 3_600_000).toISOString()
    registration.summary.tourScheduledStartAt = tour.scheduledStartAt
    const client = renderAt('/dai-dien/dang-ky/registration/sua')
    fireEvent.change(await screen.findByLabelText(/Tên đoàn/), { target: { value: 'Bản nháp giữ lại' } })
    await moveToReview()
    registration.rowVersion = nextVersion
    registration.tourRowVersion = nextVersion
    await act(async () => { await client.invalidateQueries({ queryKey: ['representative', 'form-owner', 'registration', 'registration'] }) })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    const reload = await screen.findByRole('button', { name: 'Tải lại dữ liệu và bắt đầu lại' })
    expect(screen.getByText('Bản nháp giữ lại')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
    expect(writes).toHaveLength(1)
    expect(writes[0].body).toEqual({ expectedRowVersion: version, input: {
      schoolName: registration.summary.schoolName, groupName: 'Bản nháp giữ lại', contactName: registration.contactName, contactEmail: registration.contactEmail,
      expectedTourRowVersion: version, roster: [{ rowId: 'stable-row', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Người nhận', email: 'person@example.test', className: '12A' }],
    } })
    fireEvent.click(reload)
    await waitFor(() => expect(screen.getByLabelText(/Tên đoàn/)).toHaveValue('Đoàn đăng ký'))
    expect(writes).toHaveLength(1)
  })
})
