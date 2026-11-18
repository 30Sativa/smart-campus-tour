import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManageTourCreatePage from '../../../routes/staff/manage/StaffManageTourCreatePage'
import StaffManageTourDetailPage from '../../../routes/staff/manage/StaffManageTourDetailPage'
import { useAuthStore } from '../../../stores/auth-store'
import { formatTime } from '../../../components/ui/date-time'
import { countdownText } from './quick-tour'
import type { TourDetails, TourState } from './types'

const latestStart = () => new Date(Date.now() + 30 * 60_000).toISOString()
function detail(state: TourState, overrides: Partial<TourDetails['tour']> = {}): TourDetails {
  return {
    tour: { id: 'tour-1', name: 'Tour trình diễn', description: null, routeId: 'route-1', routeName: 'Tuyến', activeRouteId: 'route-1',
      scheduledStartAt: latestStart(), state, createdByUserId: 'u', createdAt: '2026-11-13T07:00:00Z', updatedAt: null,
      rowVersion: 'AAAAAAAAB9E=', registrationCount: 2, invitationCount: 5, routeRevisionId: null, capacity: 20, heldSeats: 3, ...overrides },
    route: null, activeRoute: null, routeRevision: null, operator: null, reservation: null, fallbackVideoUrl: null,
    startedAt: null, endedAt: null, endReason: null,
    usage: { hasRegistrations: true, hasAllowedBranches: false, hasOperationalHistory: false, hasRobotOwnership: false },
    permissions: { canEditMetadata: state === 'SCHEDULED', canChangeScheduleAndRoute: false, canCancel: state === 'SCHEDULED' || state === 'READY',
      canMarkReady: false, canReopen: state === 'READY', readyBlockers: [] },
  } as TourDetails
}

let current: TourDetails
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-2', username: 'minh', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname
    if (path === '/api/staff/manage/tours/tour-1') return json({ success: true, data: current })
    if (path === '/api/staff/manage/tours/operators') return json({ success: true, data: [
      { userId: 'staff-1', fullName: 'Lan Staff', username: 'lan' }, { userId: 'staff-2', fullName: 'Minh Staff', username: 'minh' }] })
    if (path === '/api/staff/manage/tours/shifts') return json({ success: true, data: { days: [], recommendedMaxSeconds: 3600, quickTourWaitMinutes: 30 } })
    if (path === '/api/routes') return json({ data: [], pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } })
    return json({ success: true, data: [] })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); useAuthStore.getState().logout() })

function renderAt(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/staff/manage/tours/new" element={<StaffManageTourCreatePage />} />
      <Route path="/staff/manage/tours/:tourId" element={<StaffManageTourDetailPage />} />
    </Routes></MemoryRouter>
  </QueryClientProvider>)
}

describe('approved create Tour layout', () => {
  it('preserves entered data across inline kind switches and puts the review before submit', async () => {
    renderAt('/staff/manage/tours/new?date=2099-01-03')
    fireEvent.change(screen.getByLabelText('Tên Tour'), { target: { value: 'Tour dành cho đoàn trường' } })
    fireEvent.change(screen.getByLabelText('Mô tả'), { target: { value: 'Tham quan thư viện.' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /Sức chứa/ }), { target: { value: '15' } })

    fireEvent.click(screen.getByRole('button', { name: 'Tour nhanh' }))
    fireEvent.change(await screen.findByLabelText('Lý do tạo gấp'), { target: { value: 'Trình diễn cho đoàn khách.' } })
    expect(screen.queryByLabelText(/Ngày tổ chức/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tour theo ca' }))
    expect(screen.getByLabelText(/Ngày tổ chức/)).toHaveValue('03/01/2099')
    expect(screen.getByLabelText('Tên Tour')).toHaveValue('Tour dành cho đoàn trường')
    expect(screen.getByLabelText('Mô tả')).toHaveValue('Tham quan thư viện.')
    expect(screen.getByRole('spinbutton', { name: /Sức chứa/ })).toHaveValue(15)
    fireEvent.click(screen.getByRole('button', { name: 'Tour nhanh' }))
    expect(screen.getByLabelText('Lý do tạo gấp')).toHaveValue('Trình diễn cho đoàn khách.')

    const review = screen.getByRole('complementary', { name: 'Tóm tắt Tour' })
    expect(within(review).getByText('Tour dành cho đoàn trường')).toBeInTheDocument()
    expect(within(review).getByText('15 chỗ')).toBeInTheDocument()
    expect(review.compareDocumentPosition(screen.getByRole('button', { name: 'Tạo Tour' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Tour preparation layout', () => {
  it('puts the next step first and Cancel alone in a danger zone at the bottom', async () => {
    current = detail('SCHEDULED')
    renderAt('/staff/manage/tours/tour-1')
    const danger = await screen.findByRole('region', { name: 'Vùng nguy hiểm' })
    expect(within(danger).getByRole('button', { name: 'Hủy Tour' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Hủy Tour' })).toHaveLength(1)
    const ready = screen.getByRole('region', { name: 'Chốt Tour' })
    // Chốt Tour comes before the facts, and the danger zone after everything.
    expect(ready.compareDocumentPosition(screen.getByRole('region', { name: 'Thông tin Tour' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Thông tin Tour' }).compareDocumentPosition(danger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('links the registrations row to the Tour\'s registration list', async () => {
    current = detail('SCHEDULED')
    renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByRole('link', { name: '2 đoàn · 5 lời mời' })).toHaveAttribute('href', '/staff/manage/registrations?tourId=tour-1')
  })

  it.each(['COMPLETED', 'CANCELLED'] as const)('hides seats on a %s Tour and offers no Cancel', async state => {
    current = detail(state)
    renderAt('/staff/manage/tours/tour-1')
    await screen.findByRole('region', { name: 'Thông tin Tour' })
    expect(screen.queryByText('Chỗ')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Vùng nguy hiểm' })).not.toBeInTheDocument()
  })

  it('shows seats while the Tour can still fill them', async () => {
    current = detail('SCHEDULED')
    renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText('Còn 17/20 chỗ')).toBeInTheDocument()
  })
})

describe('sending a new quick Tour to the Representative', () => {
  it('counts down to the latest Start and gives the Representative link with a copy button', async () => {
    current = detail('SCHEDULED', { isShortNotice: true })
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderAt('/staff/manage/tours/tour-1')
    const block = await screen.findByRole('region', { name: 'Link đăng ký cho đại diện' })
    expect(within(block).getByRole('heading', { name: 'Link đăng ký cho đại diện' })).toBeInTheDocument()
    expect(within(block).getByText('Tour nhanh chỉ mở khoảng 30 phút nên gửi thẳng link này cho đại diện để họ đăng ký đoàn. Sau khi bạn duyệt, người xem nhận email lời mời riêng. Đoàn đã có mặt và không cần đăng ký thì bỏ qua bước này.')).toBeInTheDocument()
    expect(within(block).getByRole('timer')).toHaveTextContent(/Còn (29:5\d|30:00)/)
    const link = `${window.location.origin}/dai-dien/buoi/tour-1`
    expect(within(block).getByLabelText('Link để sao chép')).toHaveValue(link)
    await act(async () => { fireEvent.click(within(block).getByRole('button', { name: 'Sao chép link' })) })
    expect(writeText).toHaveBeenCalledWith(link)
    expect(within(block).getByRole('button', { name: 'Đã sao chép' })).toBeInTheDocument()
    // The steps stay folded under "Xem hướng dẫn" until Staff opens them.
    const steps = within(block).getByRole('list', { name: 'Các bước tiếp theo', hidden: true })
    expect(steps).not.toBeVisible()
    fireEvent.click(within(block).getByText('Xem hướng dẫn'))
    expect(steps).toBeVisible()
    expect(within(steps).getAllByRole('listitem')).toHaveLength(4)
    expect(within(block).getByRole('link', { name: 'danh sách đăng ký của Tour' })).toHaveAttribute('href', '/staff/manage/registrations?tourId=tour-1')
  })

  it('before the start time, says the three server moments: start, last start once locked, and the system cancel', async () => {
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
    current = detail('SCHEDULED', { isShortNotice: true, scheduledStartAt: at(30), latestStartAt: at(45), autoCancelAt: at(50) })
    renderAt('/staff/manage/tours/tour-1')
    const block = await screen.findByRole('region', { name: 'Link đăng ký cho đại diện' })
    expect(block).toHaveTextContent(`Bắt đầu trước ${formatTime(at(30))}. Đã chốt thì còn bắt đầu được tới ${formatTime(at(45))}. Chưa bắt đầu thì hệ thống tự hủy và trả robot lúc ${formatTime(at(50))}.`)
    expect(block).not.toHaveTextContent(/Hạn bắt đầu lúc|Đã tới hạn/)
    expect(within(block).getByRole('button', { name: 'Sao chép link' })).toBeInTheDocument()
    expect(within(block).queryByRole('button', { name: 'Hủy Tour ngay' })).not.toBeInTheDocument()
  })

  it('after the start time, withdraws the link, names the system cancel time and offers to cancel now', async () => {
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
    current = detail('SCHEDULED', { isShortNotice: true, scheduledStartAt: at(-3), latestStartAt: at(12), autoCancelAt: at(17) })
    renderAt('/staff/manage/tours/tour-1')
    const block = await screen.findByRole('region', { name: 'Link đăng ký cho đại diện' })
    expect(block).toHaveTextContent(`Đã quá giờ bắt đầu, không chốt được nữa. Hệ thống sẽ tự hủy lúc ${formatTime(at(17))}, hoặc bạn hủy ngay.`)
    expect(within(block).getByRole('timer')).toHaveTextContent(/Tự hủy sau 1[67]:\d\d/)
    expect(within(block).queryByLabelText('Link để sao chép')).not.toBeInTheDocument()
    expect(block).not.toHaveTextContent(/gửi thẳng link này/)
    expect(within(block).queryByRole('button', { name: 'Sao chép link' })).not.toBeInTheDocument()
    expect(within(block).queryByText('Xem hướng dẫn')).not.toBeInTheDocument()
    fireEvent.click(within(block).getByRole('button', { name: 'Hủy Tour ngay' }))
    expect(await screen.findByRole('dialog', { name: 'Hủy Tour?' })).toBeInTheDocument()
  })

  it('gives one line of guidance per state: the share panel for a quick Tour, the registration notice for a Tour on a shift', async () => {
    current = detail('SCHEDULED', { isShortNotice: true })
    const view = renderAt('/staff/manage/tours/tour-1')
    await screen.findByRole('region', { name: 'Link đăng ký cho đại diện' })
    expect(screen.queryByText(/Đại diện trường đang thấy Tour này/)).not.toBeInTheDocument()
    view.unmount()
    current = detail('SCHEDULED', { scheduledStartAt: '2099-01-03T01:15:00Z' })
    renderAt('/staff/manage/tours/tour-1')
    expect(await screen.findByText(/Đại diện trường đang thấy Tour này/)).toBeInTheDocument()
    expect(screen.queryByText('Xem hướng dẫn')).not.toBeInTheDocument()
  })

  it('selects the link for Ctrl+C when the browser has no clipboard', async () => {
    current = detail('SCHEDULED', { isShortNotice: true })
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    renderAt('/staff/manage/tours/tour-1')
    const block = await screen.findByRole('region', { name: 'Link đăng ký cho đại diện' })
    fireEvent.click(within(block).getByRole('button', { name: 'Sao chép link' }))
    expect(within(block).getByRole('status')).toHaveTextContent(/bấm Ctrl\+C/)
  })

  it('is not shown for a Tour on a shift or once the quick Tour is READY', async () => {
    current = detail('SCHEDULED')
    const view = renderAt('/staff/manage/tours/tour-1')
    await screen.findByRole('region', { name: 'Thông tin Tour' })
    expect(screen.queryByRole('region', { name: 'Link đăng ký cho đại diện' })).not.toBeInTheDocument()
    view.unmount()
    current = detail('READY', { isShortNotice: true })
    renderAt('/staff/manage/tours/tour-1')
    await screen.findByRole('region', { name: 'Thông tin Tour' })
    expect(screen.queryByRole('region', { name: 'Link đăng ký cho đại diện' })).not.toBeInTheDocument()
  })

  it('formats the countdown and stops at the deadline', () => {
    const now = Date.parse('2026-11-13T07:00:00Z')
    expect(countdownText('2026-11-13T07:29:05Z', now)).toBe('29:05')
    expect(countdownText('2026-11-13T08:05:00Z', now)).toBe('1:05:00')
    expect(countdownText('2026-11-13T07:00:00Z', now)).toBeNull()
  })
})

describe('quick Tour form', () => {
  it('asks for the name before the reason, and preselects the signed-in Staff as Operator', async () => {
    renderAt('/staff/manage/tours/new?kind=quick')
    const name = await screen.findByLabelText('Tên Tour')
    const reason = screen.getByLabelText(/Lý do tạo gấp/)
    expect(name.compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await screen.findByRole('option', { name: 'Minh Staff · minh' })
    expect(screen.getByLabelText('Người vận hành')).toHaveValue('staff-2')
    fireEvent.change(screen.getByLabelText('Người vận hành'), { target: { value: 'staff-1' } })
    expect(screen.getByLabelText('Người vận hành')).toHaveValue('staff-1')
  })

  it('leaves the Operator empty when the signed-in user is not offered', async () => {
    useAuthStore.getState().setAuth('test-token', { userId: 'someone-else', username: 'x', role: 'Staff' })
    renderAt('/staff/manage/tours/new?kind=quick')
    await screen.findByRole('option', { name: 'Minh Staff · minh' })
    expect(screen.getByLabelText('Người vận hành')).toHaveValue('')
  })

  it('says nowhere that Start waits for everyone (ADR-0057)', async () => {
    const view = renderAt('/staff/manage/tours/new')
    await screen.findByLabelText('Tên Tour')
    expect(document.body.textContent).not.toMatch(/đủ người/)
    view.unmount()
    renderAt('/staff/manage/tours/new?kind=quick')
    await screen.findByRole('region', { name: 'Tour nhanh chạy thế nào' })
    expect(await screen.findByText('30 phút sau khi tạo')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/đủ người|mọi điểm xem đã vào phòng chờ/)
    expect(screen.getByText(/trang kiểm tra chỉ cảnh báo số điểm xem còn thiếu/)).toBeInTheDocument()
  })
})
