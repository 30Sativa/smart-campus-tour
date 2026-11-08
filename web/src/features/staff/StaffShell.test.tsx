import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import StaffShell from './StaffShell'
import { REGISTRATIONS_NAV_PATH, STAFF_NAV, activeNavPath } from './staff-nav'
import { useTourOriginStore } from './operations/tour-origin'

function renderShell(role = 'Staff', path = '/staff') {
  useAuthStore.getState().setAuth('test-token', { userId: 'test-user', username: 'staff', role })
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route path="/staff" element={<StaffShell />}><Route index element={<h1>Tình hình điều hành</h1>} /><Route path="schedule" element={<h1>Lịch và phiên tour</h1>} /><Route path="tours/:id" element={<h1>Chi tiết tour</h1>} /></Route><Route path="/" element={<h1>Trang chủ</h1>} /></Routes></MemoryRouter></QueryClientProvider>)
}

afterEach(() => { useAuthStore.getState().logout(); useTourOriginStore.setState({ origin: null }); vi.unstubAllGlobals() })

const RUNNING_TOUR = {
  id: 'tour-run', name: 'Tour đang chạy', description: null, routeId: 'r', routeName: 'Tuyến', activeRouteId: 'r', scheduledStartAt: '2026-11-06T02:00:00Z',
  state: 'RUNNING', createdByUserId: 'u', createdAt: '2026-11-01T00:00:00Z', updatedAt: null, rowVersion: 'v', registrationCount: 1, invitationCount: 1, routeRevisionId: 'rev',
  execution: { operationalStatus: 'NORMAL', assistanceReason: null, currentStep: 'NAVIGATING', commandState: 'ACCEPTED', needsReconcile: false },
}

describe('StaffShell on every page', () => {
  it('keeps the running Tour and the robot channel in view on a preparation page', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const running = url.pathname === '/api/staff/manage/tours' && url.searchParams.get('phase') === 'RUNNING'
      return new Response(JSON.stringify({ success: true, data: running ? [RUNNING_TOUR] : [], pagination: { page: 1, pageSize: 20, totalItems: running ? 1 : 0, totalPages: 1 } }), { status: 200 })
    }))
    useAuthStore.getState().setAuth('test-token', { userId: 'test-user', username: 'staff', role: 'Staff' })
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/staff/manage/pois']}><Routes>
      <Route path="/staff" element={<StaffShell />}><Route path="manage/pois" element={<h1>POI</h1>} /></Route>
    </Routes></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByRole('link', { name: /Đang chạy Tour đang chạy\. Mở điều hành trực tiếp/ })).toHaveAttribute('href', '/staff/live/tour-run')
    // The chip names this browser's link to the server, not whether a robot is connected.
    expect(screen.getByText(/^Cập nhật trực tiếp: /)).toBeInTheDocument()
    expect(screen.queryByText(/^Kênh robot/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Telemetry:/)).not.toBeInTheDocument()
  })

  it('opens registrations on the pending queue its badge counts, and lights it for both views', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng vận hành' })
    expect(within(nav).getByRole('link', { name: /Đăng ký đoàn/ })).toHaveAttribute('href', '/staff/manage/registrations/pending')
    expect(activeNavPath('/staff/manage/registrations')).toBe(REGISTRATIONS_NAV_PATH)
    expect(activeNavPath('/staff/manage/registrations/pending')).toBe(REGISTRATIONS_NAV_PATH)
    expect(activeNavPath('/staff/manage/pois/new')).toBe('/staff/manage/pois')
  })
})

describe('StaffShell', () => {
  it('shows the active page and no cross-link to administration', () => {
    // Admin cannot enter `/staff` (RequireArea), so the shell never offers a
    // way across to `/admin`.
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng vận hành' })
    expect(within(nav).getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Khu vực quản trị' })).not.toBeInTheDocument()
  })

  it('lists every page under always-open sections, with one overview', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng vận hành' })
    expect(['Vận hành', 'Tour & đăng ký', 'Nội dung tham quan', 'Lịch sử'].map((heading) => within(nav).getByText(heading))).toHaveLength(4)
    expect(within(nav).queryByRole('link', { name: /Tổng quan chuẩn bị/ })).not.toBeInTheDocument()
    for (const page of STAFF_NAV) expect(within(nav).getByRole('link', { name: new RegExp(page.label) })).toHaveAttribute('href', page.path)
    expect(within(nav).queryByRole('link', { name: 'Tạo Tour' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Đăng ký chờ duyệt' })).not.toBeInTheDocument()
    // Nothing folds: no group toggles inside the page list.
    expect(within(nav).queryAllByRole('button', { expanded: false })).toHaveLength(0)
  })

  it('keeps a Tour page under the list it was opened from', () => {
    useAuthStore.getState().setAuth('test-token', { userId: 'test-user', username: 'staff', role: 'Staff' })
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/staff/schedule?view=list']}><Routes>
      <Route path="/staff" element={<StaffShell />}>
        <Route path="schedule" element={<Link to="/staff/manage/tours/t1">Mở Tour</Link>} />
        <Route path="manage/tours/:id" element={<Link to="/staff/tours/t1/start">Kiểm tra</Link>} />
        <Route path="tours/:id/start" element={<h1>Kiểm tra trước khi bắt đầu</h1>} />
      </Route>
    </Routes></MemoryRouter></QueryClientProvider>)
    fireEvent.click(screen.getByRole('link', { name: 'Mở Tour' }))
    // Moving between the Tour's own pages does not change where it came from.
    fireEvent.click(screen.getByRole('link', { name: 'Kiểm tra' }))
    expect(useTourOriginStore.getState().origin).toBe('/staff/schedule?view=list')
    const nav = screen.getByRole('navigation', { name: 'Điều hướng vận hành' })
    expect(within(nav).getByRole('link', { name: 'Lịch Tour' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Chi tiết Tour')).toBeInTheDocument()
  })

  it('shows the signed-in account at the top right and no page search', () => {
    renderShell()
    const account = screen.getByLabelText('Tài khoản đang đăng nhập')
    expect(within(account).getByText('staff')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    // Sign-out stays in the sidebar.
    expect(screen.getByRole('button', { name: /Đăng xuất/ })).toBeInTheDocument()
  })

  it('opens the account menu with the profile and sign-out', () => {
    renderShell()
    const trigger = within(screen.getByLabelText('Tài khoản đang đăng nhập')).getByRole('button', { name: 'Tài khoản staff' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Tài khoản' })
    expect(within(menu).getByRole('menuitem', { name: 'Hồ sơ của tôi' })).toHaveAttribute('href', '/staff/profile')
    expect(within(menu).getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the mobile navigation and restores focus when dismissed', () => {
    renderShell()
    const open = screen.getByRole('button', { name: 'Mở điều hướng vận hành' })
    fireEvent.click(open)
    expect(open).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Đóng menu' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(open).toHaveFocus()
    fireEvent.click(open)
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Điều hướng vận hành' })).getByRole('link', { name: 'Lịch Tour' }))
    expect(open).toHaveAttribute('aria-expanded', 'false')
  })
})
