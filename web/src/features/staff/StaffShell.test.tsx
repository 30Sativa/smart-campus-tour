import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import StaffShell from './StaffShell'

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

  it('finds a staff page and navigates when the search is submitted', () => {
    renderShell()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm trang vận hành' }), { target: { value: 'LỊCH' } })
    expect(within(screen.getByRole('list', { name: 'Kết quả tìm trang' })).getByRole('link', { name: 'Lịch buổi' })).toHaveAttribute('href', '/staff/schedule')
    fireEvent.submit(screen.getByRole('search'))
    expect(screen.getByRole('heading', { name: 'Lịch và phiên tour' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(within(screen.getByRole('navigation', { name: 'Điều hướng vận hành' })).getByRole('link', { name: 'Lịch buổi' })).toHaveAttribute('aria-current', 'page')
  })

  it('handles an unmatched search and lets Escape dismiss it', () => {
    renderShell()
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Không tồn tại' } })
    expect(screen.getByText('Không tìm thấy trang phù hợp.')).toBeInTheDocument()
    fireEvent.submit(screen.getByRole('search'))
    expect(screen.getByRole('heading', { name: 'Tình hình điều hành' })).toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByText('Không tìm thấy trang phù hợp.')).not.toBeInTheDocument()
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
