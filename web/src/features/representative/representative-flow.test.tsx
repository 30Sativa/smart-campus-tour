import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
import { resetSim, tourById } from '../../mocks/staff-sim'
import { useAuthStore } from '../../stores/auth-store'

const clients: QueryClient[] = []

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchInterval: false }, mutations: { retry: false } } })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dai-dien" element={<RepresentativeShell />}>
            <Route index element={<RepDashboardPage />} />
            <Route path="buoi" element={<RepToursPage />} />
            <Route path="buoi/:tourId" element={<RepTourDetailPage />} />
            <Route path="buoi/:tourId/dang-ky" element={<RepRegisterPage />} />
            <Route path="dang-ky" element={<RepRegistrationsPage />} />
            <Route path="dang-ky/:registrationId" element={<RepRegistrationDetailPage />} />
            <Route path="dang-ky/:registrationId/sua" element={<RepRegisterPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetSim()
  useAuthStore.setState({ accessToken: 'mock', isAuthenticated: true, user: { userId: 'mock-user-daidien', username: 'daidien', role: 'Representative' } })
})

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.setState({ accessToken: null, user: null, isAuthenticated: false })
})

describe('representative screens (flow review §4)', () => {
  it('summarises the registrations on the overview', async () => {
    renderAt('/dai-dien')
    expect(await screen.findByRole('heading', { name: 'Buổi đang nhận đăng ký' })).toBeInTheDocument()
    expect(await screen.findByText('Hoạt động gần đây')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem buổi tham quan/ })).toHaveAttribute('href', '/dai-dien/buoi')
  })

  it('lists Tours: register where Scheduled, open the registration where one exists', async () => {
    renderAt('/dai-dien/buoi')
    const register = await screen.findAllByRole('link', { name: 'Đăng ký tour' })
    expect(register.some((link) => link.getAttribute('href') === '/dai-dien/buoi/tour-06/dang-ky')).toBe(true)
    expect(screen.getAllByRole('link', { name: 'Xem đăng ký' }).length).toBeGreaterThan(0)
  })

  it('explains why a locked Tour takes no registration', async () => {
    renderAt('/dai-dien/buoi/tour-02')
    expect(await screen.findByRole('heading', { name: /Buổi trưa/ })).toBeInTheDocument()
    // The representative already has an approved registration on this Ready Tour.
    expect(screen.getAllByRole('link', { name: 'Xem đăng ký' })[0]).toHaveAttribute('href', '/dai-dien/dang-ky/reg-r2')
  })

  it('shows the join link and group code of an approved group', async () => {
    renderAt('/dai-dien/dang-ky/reg-09')
    expect(await screen.findByRole('heading', { name: 'Thông tin tham gia' })).toBeInTheDocument()
    expect(screen.getByText(/campustour\.example\/tham-gia\/T-03/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sao chép link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sao chép mã đoàn' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thay danh sách học sinh' })).toHaveAttribute('href', '/dai-dien/dang-ky/reg-09/sua')
  })

  it('disables changes on a locked Tour and says why', async () => {
    renderAt('/dai-dien/dang-ky/reg-r2')
    expect(await screen.findByText(/Buổi tham quan đã được chốt nên đăng ký không thể chỉnh sửa/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thay danh sách học sinh' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hủy đăng ký' })).toBeDisabled()
  })

  it('shows Admin’s rejection reason and the way to fix it', async () => {
    renderAt('/dai-dien/dang-ky/reg-r1')
    expect(await screen.findByText('Lý do từ chối')).toBeInTheDocument()
    expect(screen.getByText(/bổ sung cột Lop/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Chỉnh sửa và gửi lại' })[0]).toHaveAttribute('href', '/dai-dien/dang-ky/reg-r1/sua')
  })

  it('cancels only after confirmation', async () => {
    renderAt('/dai-dien/dang-ky/reg-09')
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy đăng ký' }))
    expect(screen.getByRole('alertdialog', { name: 'Hủy đăng ký này?' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Hủy đăng ký' }).at(-1)!)
    await waitFor(() => expect(tourById('tour-03')?.registrations.find((reg) => reg.id === 'reg-09')?.state).toBe('Cancelled'))
  })

  it('checks group information before moving to the roster step', async () => {
    renderAt('/dai-dien/buoi/tour-06/dang-ky')
    const email = await screen.findByLabelText(/Email liên hệ/)
    fireEvent.change(email, { target: { value: 'khong-hop-le' } })
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }))
    expect(await screen.findByText(/Email chưa đúng định dạng/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tải file Excel mẫu' })).toBeNull()
    fireEvent.change(email, { target: { value: 'co.vy@truong.edu.vn' } })
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }))
    expect(await screen.findByRole('button', { name: 'Tải file Excel mẫu' })).toBeInTheDocument()
    // No roster confirmed yet: the form stays on step 2 and says what is missing.
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }))
    expect(await screen.findByText(/Xác nhận sử dụng danh sách này/)).toBeInTheDocument()
  })

  it('filters My Registrations by state', async () => {
    renderAt('/dai-dien/dang-ky?trang-thai=tu-choi')
    expect(await screen.findByRole('link', { name: /Sáng mai/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Buổi chiều/ })).toBeNull()
  })

  it('does not open another school’s registration', async () => {
    renderAt('/dai-dien/dang-ky/reg-01')
    expect(await screen.findByText('Không mở được đăng ký')).toBeInTheDocument()
  })
})
