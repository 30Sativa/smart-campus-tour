import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import StaffShell from './StaffShell'
import { STAFF_NAV } from './staff-nav'

function renderShell(role = 'Staff', path = '/staff') {
  useAuthStore.getState().setAuth('test-token', { userId: 'test-user', username: 'staff', role })
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Routes><Route path="/staff" element={<StaffShell />}><Route index element={<h1>Tình hình điều hành</h1>} /><Route path="schedule" element={<h1>Lịch và phiên tour</h1>} /><Route path="tours/:id" element={<h1>Chi tiết tour</h1>} /></Route><Route path="/" element={<h1>Trang chủ</h1>} /></Routes></MemoryRouter></QueryClientProvider>)
}

afterEach(() => useAuthStore.getState().logout())

describe('StaffShell', () => {
  it('shows the active page and only offers administration to admins', () => {
    const view = renderShell()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng vận hành' })
    expect(within(nav).getByRole('link', { name: 'Tổng quan vận hành' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Khu vực quản trị' })).not.toBeInTheDocument()
    view.unmount()
    renderShell('Admin')
    expect(screen.getByRole('link', { name: 'Khu vực quản trị' })).toHaveAttribute('href', '/admin')
  })

  it('lists every page under always-open sections in the order of a working day', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng vận hành' })
    expect(['Vận hành', 'Chuẩn bị Tour', 'Lịch sử'].map((heading) => within(nav).getByText(heading))).toHaveLength(3)
    for (const page of STAFF_NAV) expect(within(nav).getByRole('link', { name: new RegExp(page.label) })).toHaveAttribute('href', page.path)
    expect(within(nav).queryByRole('link', { name: 'Tạo Tour' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Đăng ký chờ duyệt' })).not.toBeInTheDocument()
    // Nothing folds: no group toggles inside the page list.
    expect(within(nav).queryAllByRole('button', { expanded: false })).toHaveLength(0)
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
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Điều hướng vận hành' })).getByRole('link', { name: 'Lịch buổi' }))
    expect(open).toHaveAttribute('aria-expanded', 'false')
  })
})
