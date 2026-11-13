import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageHeader } from '../../components/ui/ConsolePrimitives'
import { useAuthStore } from '../../stores/auth-store'
import TechnicalShell from './TechnicalShell'

const DASHBOARD = {
  collectedAt: '2026-11-13T07:00:00Z',
  kpis: { totalRobots: 1, connectedRobots: 1, awaitingDataRobots: 0, disconnectedRobots: 0, unconfirmedRobots: 0, heldForInspectionCount: 1, pendingPoiVerificationsCount: 2, pendingRouteTestsCount: 0, activeMapVersionsCount: 1 },
  actionItems: [
    { type: 'POI_QUEUE', severity: 'INFO', title: '2 POI chờ kiểm chứng', description: 'Staff đã gửi POI mới.', targetId: null, linkUrl: '/technical/poi-import' },
    { type: 'HELD_ROBOT', severity: 'DANGER', title: 'Robot amr-01 chờ kiểm tra tại chỗ', description: 'Tour kết thúc sớm.', targetId: 'r1', linkUrl: '/technical/robots?robot=r1' },
    { type: 'MAP_MISMATCH', severity: 'WARNING', title: 'Bản đồ khác bản đã gán', description: 'Kiểm tra lại bản đồ trên robot.', targetId: 'r1', linkUrl: 'https://example.test/x' },
  ],
  robots: [],
}

function stubDashboard(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

function renderShell(path = '/technical/dashboard') {
  useAuthStore.getState().setAuth('test-token', { userId: 'tech-user', username: 'kythuat', role: 'TechnicalStaff' })
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/technical" element={<TechnicalShell />}>
      <Route path="dashboard" element={<PageHeader eyebrow="Giám sát" title="Tổng quan" description="" />} />
      <Route path="robots" element={<h1>Danh sách</h1>} />
      <Route path="monitoring" element={<PageHeader eyebrow="Giám sát" title="Giám sát robot và Mini PC" description="" />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>)
}

afterEach(() => { useAuthStore.getState().logout(); vi.unstubAllGlobals() })

describe('TechnicalShell', () => {
  it('puts the menu button at the top left of the header, not floating over the page', () => {
    stubDashboard({ success: true, data: DASHBOARD })
    renderShell()
    const menu = screen.getByRole('button', { name: 'Mở điều hướng kỹ thuật' })
    expect(menu.closest('header')).toHaveClass('sticky')
    expect(menu).not.toHaveClass('fixed')
    expect(menu).toHaveAttribute('aria-controls', 'technical-navigation')
    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Đóng menu' })).toHaveFocus()
  })

  it('names the page once in the breadcrumb, after its menu group', () => {
    stubDashboard({ success: true, data: DASHBOARD })
    renderShell()
    const crumbs = within(screen.getByRole('navigation', { name: 'Vị trí trang' }))
    expect(crumbs.getAllByRole('listitem').map((item) => item.textContent?.replace('/', '').trim())).toEqual(['Giám sát', 'Tổng quan'])
    expect(crumbs.getByText('Tổng quan')).toHaveAttribute('aria-current', 'page')
    // Header breadcrumb and the page heading: twice, never three times.
    expect(screen.getAllByText('Tổng quan', { selector: 'li, h1' })).toHaveLength(2)
  })

  it('keeps one Robot entry lit while a robot is monitored, and shows no connection status', () => {
    stubDashboard({ success: true, data: DASHBOARD })
    renderShell('/technical/monitoring?robot=amr-01')
    const nav = screen.getByRole('navigation', { name: 'Điều hướng kỹ thuật' })
    expect(within(nav).getByRole('link', { name: 'Robot' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).queryByRole('link', { name: /Mini PC/ })).not.toBeInTheDocument()
    const crumbs = within(screen.getByRole('navigation', { name: 'Vị trí trang' }))
    expect(crumbs.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText(/Cập nhật trực tiếp/)).not.toBeInTheDocument()
  })

  it('lists the Dashboard work items in the bell, most serious first, linking only inside the area', async () => {
    stubDashboard({ success: true, data: DASHBOARD })
    renderShell()
    const bell = await screen.findByRole('button', { name: 'Thông báo, 3 việc đang chờ, 1 nghiêm trọng' })
    fireEvent.click(bell)
    const panel = screen.getByRole('region', { name: 'Bảng thông báo' })
    const rows = within(panel).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Robot amr-01 chờ kiểm tra tại chỗ')
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/technical/robots?robot=r1')
    expect(within(rows[1]).queryByRole('link')).not.toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /2 POI chờ kiểm chứng/ })).toHaveAttribute('href', '/technical/poi-import')
  })

  it('says nothing is waiting only when the Dashboard answered, and says so when it failed', async () => {
    stubDashboard({ success: false, message: 'down' }, 500)
    renderShell()
    fireEvent.click(await screen.findByRole('button', { name: 'Thông báo' }))
    expect(await screen.findByText(/Không đọc được việc đang chờ/)).toBeInTheDocument()
    expect(screen.queryByText('Không có việc đang chờ.')).not.toBeInTheDocument()
  })

  it('shows the signed-in account with its profile and sign-out', () => {
    stubDashboard({ success: true, data: DASHBOARD })
    renderShell()
    fireEvent.click(within(screen.getByLabelText('Tài khoản đang đăng nhập')).getByRole('button', { name: 'Tài khoản kythuat' }))
    const menu = screen.getByRole('menu', { name: 'Tài khoản' })
    expect(within(menu).getByRole('menuitem', { name: 'Hồ sơ của tôi' })).toHaveAttribute('href', '/technical/profile')
    expect(within(menu).getByRole('menuitem', { name: 'Đăng xuất' })).toBeInTheDocument()
  })
})
