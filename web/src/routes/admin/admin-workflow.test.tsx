import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AdminTourDetailPage from './AdminTourDetailPage'
import AdminRegistrationsPage from './AdminRegistrationsPage'
import { resetSim, tourById } from '../../mocks/staff-sim'
import { useAuthStore } from '../../stores/auth-store'

/**
 * The Admin workflow as a person meets it: the checklist names what blocks
 * READY, a group is reviewed and approved, the Tour is finalized through a
 * confirmation, and a roster changed under the reviewer asks for a reload.
 */
function renderAt(path: string, element: ReactNode, route: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Poll with real time between checks, so the mock's latency and React's updates both land. */
async function eventually(check: () => void, timeout = 3000) {
  const until = Date.now() + timeout
  for (;;) {
    try {
      check()
      return
    } catch (error) {
      if (Date.now() > until) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

describe('admin tour workflow', () => {
  beforeEach(() => {
    resetSim()
    useAuthStore.getState().setAuth('test-token', { userId: 'test-admin', username: 'admin', role: 'Admin' })
  })
  afterEach(() => {
    resetSim()
    useAuthStore.getState().logout()
  })

  it('explains why a Tour cannot be finalized, then finalizes it after the last approval', async () => {
    renderAt('/admin/tours/tour-03', <AdminTourDetailPage />, '/admin/tours/:tourId')
    const finalize = await screen.findByRole('button', { name: /Chốt Tour/ })
    expect(finalize).toBeDisabled()
    expect(screen.getByText('Còn 1 đăng ký chờ duyệt: THPT Bùi Thị Xuân')).toBeInTheDocument()
    expect(screen.queryByText(/Robot ready/i)).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /Đăng ký/ }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Xem & duyệt' }))[0])
    expect(await screen.findByText('Danh sách đã được cập nhật và cần duyệt lại.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt đăng ký' }))
    const confirm = await screen.findByRole('dialog', { name: /Duyệt THPT Bùi Thị Xuân/ })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Duyệt' }))
    await waitFor(() => expect(tourById('tour-03')?.registrations.find((reg) => reg.id === 'reg-07')?.state).toBe('Approved'))
    expect(tourById('tour-03')?.state).toBe('Scheduled')

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    await eventually(() => expect(screen.getByRole('button', { name: /Chốt Tour/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Chốt Tour/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Chốt Tour sang READY?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận chốt' }))
    await waitFor(() => expect(tourById('tour-03')?.state).toBe('Ready'))
    await eventually(() => expect(screen.getByRole('button', { name: /Mở lại Tour/ })).toBeEnabled())
  })

  it('asks for a reload when the roster changed during review', async () => {
    renderAt('/admin/registrations/pending?review=reg-14', <AdminRegistrationsPage mode="pending" />, '/admin/registrations/pending')
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt đăng ký' }))
    const confirm = await screen.findByRole('dialog', { name: /Duyệt THPT Chuyên Trần Đại Nghĩa/ })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByText('Danh sách đã được cập nhật. Vui lòng tải lại dữ liệu trước khi duyệt.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt đăng ký' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(await screen.findByRole('button', { name: 'Duyệt đăng ký' })).toBeInTheDocument()
    expect(screen.getByText(/\(20\)/)).toBeInTheDocument()
  })

  it('keeps a running Tour read-only', async () => {
    renderAt('/admin/tours/tour-01', <AdminTourDetailPage />, '/admin/tours/:tourId')
    expect(await screen.findByText(/Tour đang diễn ra do Staff điều hành/)).toBeInTheDocument()
    for (const name of [/Chốt Tour/, /Hủy Tour/, /Mở lại/, /^Sửa$/]) expect(screen.queryByRole('button', { name })).toBeNull()
  })
})
