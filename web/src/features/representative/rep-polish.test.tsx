import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ApiError } from '../../api/client'
import type { PagedApiResponse } from '../../api/contracts/shared'
import { useAuthStore } from '../../stores/auth-store'
import RepDashboardPage from '../../routes/representative/RepDashboardPage'
import RepToursPage from '../../routes/representative/RepToursPage'
import RepTourDetailPage from '../../routes/representative/RepTourDetailPage'
import RepRegistrationsPage from '../../routes/representative/RepRegistrationsPage'
import RepRegistrationDetailPage from '../../routes/representative/RepRegistrationDetailPage'
import { invitationsApi } from '../registrations/invitations/api'
import { representativeApi } from './api/representative-api'
import type { RegistrationSummary, RepresentativeRegistration, RepresentativeTour } from './api/types'
import { CLOSED_REGISTRATIONS_URL, groupRecentActivity } from './recent-activity'

const version = 'AAAAAAAAAAE='
const start = '2030-11-12T01:30:00Z'
const systemCancel = 'Không bắt đầu trong khung giờ, hệ thống tự huỷ.'
const tour: RepresentativeTour = { id: 'tour', name: 'Buổi thư viện', description: null, scheduledStartAt: start, state: 'SCHEDULED',
  rowVersion: version, routeName: 'Tuyến A', stops: [], register: { allowed: true, reason: null } }
function summary(id: string, changes: Partial<RegistrationSummary> = {}): RegistrationSummary {
  return { id, tourId: 'tour', tourName: `Buổi ${id}`, tourScheduledStartAt: start, tourState: 'SCHEDULED', schoolName: 'Trường kiểm thử',
    groupName: `Lớp ${id}`, state: 'SUBMITTED', rowCount: 1, submittedAt: start, updatedAt: start, ...changes }
}
function detail(changes: Partial<RegistrationSummary> = {}): RepresentativeRegistration {
  return { summary: summary('record', { tourName: 'Buổi thư viện', groupName: '10A1', state: 'APPROVED', ...changes }),
    contactName: 'Liên hệ', contactEmail: 'contact@example.test', rowVersion: version, tourRowVersion: version, rejectionReason: null, reviewedAt: start,
    allowedActions: { edit: { allowed: false, reason: 'Không thể sửa.' }, resubmit: { allowed: false, reason: 'Không thể gửi lại.' }, cancel: { allowed: false, reason: 'Không thể hủy.' } },
    roster: [{ id: 'row', rowNumber: 2, rowType: 'INDIVIDUAL', displayName: 'Người được duyệt', email: 'a@example.test', className: '10A', participationState: 'ACCEPTED', rowVersion: version, canRequestEmailChange: false }] }
}
function paged<T>(data: T[], totalItems = data.length): PagedApiResponse<T> {
  return { success: true, message: null, errors: null, data, pagination: { page: 1, pageSize: 20, totalItems, totalPages: 1 } }
}
const apiError = (status: number) => new ApiError(status, JSON.stringify({ success: false, message: 'Không tìm thấy dữ liệu.', data: null }))

const clients: QueryClient[] = []
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchInterval: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/dai-dien" element={<RepDashboardPage />} />
    <Route path="/dai-dien/buoi" element={<RepToursPage />} />
    <Route path="/dai-dien/buoi/:tourId" element={<RepTourDetailPage />} />
    <Route path="/dai-dien/dang-ky" element={<RepRegistrationsPage />} />
    <Route path="/dai-dien/dang-ky/:registrationId" element={<RepRegistrationDetailPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  useAuthStore.getState().setAuth('token', { userId: 'owner', username: 'representative', role: 'Representative' })
  vi.spyOn(representativeApi, 'tours').mockResolvedValue(paged([]))
  vi.spyOn(representativeApi, 'tour').mockResolvedValue(tour)
  vi.spyOn(representativeApi, 'registrations').mockResolvedValue(paged([]))
  vi.spyOn(representativeApi, 'registration').mockResolvedValue(detail())
})
afterEach(() => {
  clients.forEach(client => client.clear())
  clients.length = 0
  useAuthStore.getState().logout()
  vi.restoreAllMocks()
})

describe('empty messages (item 1)', () => {
  it('says there is no open Tour yet, without a search hint, when nothing is searched', async () => {
    renderAt('/dai-dien/buoi')
    expect(await screen.findByText('Hiện chưa có buổi nhận đăng ký.')).toBeInTheDocument()
    expect(screen.queryByText('Không có kết quả phù hợp')).toBeNull()
  })
  it('shows the no-match message with a clear button only while searching Tours', async () => {
    renderAt('/dai-dien/buoi?search=abc')
    expect(await screen.findByText('Không có kết quả phù hợp')).toBeInTheDocument()
    expect(screen.queryByText('Hiện chưa có buổi nhận đăng ký.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }))
    expect(await screen.findByText('Hiện chưa có buổi nhận đăng ký.')).toBeInTheDocument()
  })
  it('says the Representative has no registration yet, and uses no-match only while searching', async () => {
    renderAt('/dai-dien/dang-ky')
    expect(await screen.findByText('Bạn chưa có đăng ký nào.')).toBeInTheDocument()
    expect(screen.queryByText('Không có kết quả phù hợp')).toBeNull()
  })
  it('uses the no-match message when a registration search finds nothing', async () => {
    renderAt('/dai-dien/dang-ky?search=abc')
    expect(await screen.findByText('Không có kết quả phù hợp')).toBeInTheDocument()
    expect(screen.queryByText('Bạn chưa có đăng ký nào.')).toBeNull()
  })
})

describe('registration of a cancelled Tour (item 2)', () => {
  it('carries one neutral "Buổi đã huỷ" label and no approval label', async () => {
    vi.mocked(representativeApi.registration).mockResolvedValue(detail({ tourState: 'CANCELLED', tourCancelReason: systemCancel }))
    renderAt('/dai-dien/dang-ky/record')
    const header = (await screen.findByRole('heading', { name: 'Buổi thư viện', level: 1 })).closest('header')!
    expect(within(header).getByText('Buổi đã huỷ')).toHaveClass('rep-badge--muted')
    expect(within(header).queryByText('Có dòng đã duyệt')).toBeNull()
    expect(within(header).queryByText('Đã hủy')).toBeNull()
    expect(within(header).getByText('Đoàn 10A1, Trường kiểm thử')).toBeInTheDocument()
  })
  it('replaces invitation actions with one sentence and never loads the invitation tools', async () => {
    const invitations = vi.spyOn(invitationsApi, 'get')
    vi.mocked(representativeApi.registration).mockResolvedValue(detail({ tourState: 'CANCELLED', tourCancelReason: systemCancel }))
    renderAt('/dai-dien/dang-ky/record?tab=invitations')
    expect(await screen.findByText('Buổi đã huỷ, lời mời không còn dùng được.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi lại email' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thu hồi và cấp mã mới' })).toBeNull()
    expect(screen.queryByText('Thao tác khác')).toBeNull()
    expect(invitations).not.toHaveBeenCalled()
  })
  it('still shows the approval label for a Tour that goes ahead', async () => {
    renderAt('/dai-dien/dang-ky/record')
    const header = (await screen.findByRole('heading', { name: 'Buổi thư viện', level: 1 })).closest('header')!
    expect(within(header).getByText('Có dòng đã duyệt')).toBeInTheDocument()
    expect(within(header).queryByText('Buổi đã huỷ')).toBeNull()
  })
})

describe('error pages (item 6)', () => {
  it.each([404, 403])('a %s on a Tour offers the Tour list, not a retry', async status => {
    vi.mocked(representativeApi.tour).mockRejectedValue(apiError(status))
    renderAt('/dai-dien/buoi/tour')
    expect(await screen.findByText('Buổi này không còn mở cho bạn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem danh sách buổi' })).toHaveAttribute('href', '/dai-dien/buoi')
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })
  it('keeps the retry for any other failure', async () => {
    vi.mocked(representativeApi.tour).mockRejectedValue(apiError(503))
    renderAt('/dai-dien/buoi/tour')
    expect(await screen.findByText('Không xem được Tour')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(screen.queryByText('Buổi này không còn mở cho bạn')).toBeNull()
  })
  it.each([404, 403])('a %s on a registration offers the registration list, not a retry', async status => {
    vi.mocked(representativeApi.registration).mockRejectedValue(apiError(status))
    renderAt('/dai-dien/dang-ky/record')
    expect(await screen.findByText('Đăng ký này không còn mở cho bạn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem danh sách đăng ký' })).toHaveAttribute('href', '/dai-dien/dang-ky')
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull()
  })
})

describe('recent activity (item 5)', () => {
  const noStart = (id: string) => summary(id, { state: 'APPROVED', tourState: 'CANCELLED', tourCancelReason: systemCancel })
  it('gathers ended registrations of the same kind into one line linking to the Đã hủy tab', () => {
    const items = groupRecentActivity([summary('a'), noStart('b'), noStart('c'), summary('d', { state: 'CANCELLED' }), noStart('e')])
    expect(items.map(item => item.kind === 'group' ? item.label : item.registration.id))
      .toEqual(['a', '3 buổi bị huỷ vì không bắt đầu đúng giờ', 'd'])
    expect(items[1]).toMatchObject({ to: '/dai-dien/dang-ky?nhom=da-huy' })
  })
  it('shows the gathered line on the overview', async () => {
    vi.mocked(representativeApi.registrations).mockResolvedValue(paged([noStart('b'), noStart('c')]))
    renderAt('/dai-dien')
    expect(await screen.findByText('2 buổi bị huỷ vì không bắt đầu đúng giờ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem các đăng ký đã hủy' })).toHaveAttribute('href', CLOSED_REGISTRATIONS_URL)
  })
})
