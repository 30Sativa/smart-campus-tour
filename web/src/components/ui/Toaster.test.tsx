import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from './Toaster'
import { celebrate, notify } from './toast-store'

function renderToaster() {
  return render(<MemoryRouter><Toaster /></MemoryRouter>)
}

describe('Toaster', () => {
  afterEach(() => vi.useRealTimers())

  it('shows what finished, with its next step, and leaves on its own', async () => {
    vi.useFakeTimers()
    renderToaster()
    act(() => { notify({ title: 'Đã tạo tài khoản staff04', detail: 'Vai trò Staff.', action: { label: 'Danh sách', to: '/admin/accounts' } }) })

    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('Đã tạo tài khoản staff04')
    expect(toast).toHaveTextContent('Vai trò Staff.')
    expect(screen.getByRole('link', { name: 'Danh sách' })).toHaveAttribute('href', '/admin/accounts')

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('holds while pointed at and closes on request; errors are alerts', async () => {
    vi.useFakeTimers()
    renderToaster()
    act(() => { notify({ tone: 'error', title: 'Không ghi được deploy' }) })

    const toast = screen.getByRole('alert')
    fireEvent.mouseEnter(toast)
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(screen.getByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a milestone once in the middle, separate from the stack, and lets it go', async () => {
    vi.useFakeTimers()
    renderToaster()
    act(() => { notify({ title: 'Đã lưu revision POI' }) })
    act(() => { celebrate({ title: 'T-01 · Buổi đã hoàn thành', action: { label: 'Xem lịch sử phiên', to: '/staff/history' } }) })
    act(() => { celebrate({ title: 'Đã tạo tuyến “Thư viện”' }) })

    // One celebration at a time: the newer milestone replaced the first.
    expect(screen.queryByText('T-01 · Buổi đã hoàn thành')).toBeNull()
    expect(screen.getByText('Đã tạo tuyến “Thư viện”')).toBeInTheDocument()
    expect(screen.getByText('Đã lưu revision POI')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.queryByText('Đã tạo tuyến “Thư viện”')).toBeNull()
    expect(screen.getByText('Đã lưu revision POI')).toBeInTheDocument()
  })
})
