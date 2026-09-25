import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import RepresentativeShell from './RepresentativeShell'
import RepToursPage from '../../routes/representative/RepToursPage'
import RepRegistrationDetailPage from '../../routes/representative/RepRegistrationDetailPage'
import { resetSim } from '../../mocks/staff-sim'
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
            <Route index element={<RepToursPage />} />
            <Route path="dang-ky/:registrationId" element={<RepRegistrationDetailPage />} />
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
  it('lists the Tours open for registration with a way in', async () => {
    renderAt('/dai-dien')
    expect(await screen.findByRole('heading', { name: 'Đang nhận đăng ký' })).toBeInTheDocument()
    const register = screen.getAllByRole('link', { name: /Đăng ký đoàn/ })
    expect(register.some((link) => link.getAttribute('href') === '/dai-dien/buoi/tour-06/dang-ky')).toBe(true)
    // A Tour already registered offers the registration, not a second one.
    expect(screen.getAllByRole('link', { name: /Xem đăng ký/ }).length).toBeGreaterThan(0)
  })

  it('shows the join link and group code of an approved group', async () => {
    renderAt('/dai-dien/dang-ky/reg-09')
    expect(await screen.findByRole('heading', { name: /Chia sẻ đường dẫn và mã đoàn/ })).toBeInTheDocument()
    expect(screen.getByText(/campustour\.example\/tham-gia\/T-03/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sao chép lời nhắn cho học sinh/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Thay danh sách học sinh/ })).toHaveAttribute('href', '/dai-dien/dang-ky/reg-09/sua')
  })

  it('shows Admin’s rejection reason and the way to fix it', async () => {
    renderAt('/dai-dien/dang-ky/reg-r1')
    expect(await screen.findByText('Admin đã từ chối đăng ký')).toBeInTheDocument()
    expect(screen.getByText(/bổ sung cột Lop/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Sửa và gửi lại/ })[0]).toHaveAttribute('href', '/dai-dien/dang-ky/reg-r1/sua')
  })

  it('does not open another school’s registration', async () => {
    renderAt('/dai-dien/dang-ky/reg-01')
    expect(await screen.findByText('Không mở được đăng ký')).toBeInTheDocument()
  })
})
