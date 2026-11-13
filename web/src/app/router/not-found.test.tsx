import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from './index'
import { useAuthStore } from '../../stores/auth-store'

/** The catch-all 404 page, and the redirects it must not swallow. */
function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function signIn(role: string) {
  useAuthStore.setState({
    accessToken: 'mock-access-token.test',
    isAuthenticated: true,
    isAuthReady: true,
    user: { userId: 'test-user', username: 'test', role },
  })
}

describe('404 page', () => {
  afterEach(() => {
    cleanup()
    useAuthStore.setState({ accessToken: null, user: null, isAuthenticated: false })
  })

  it('offers a visitor the way home and names the tab', async () => {
    const router = renderAt('/trang-khong-co')

    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/trang-khong-co')
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: /Về khu vực/ })).toBeNull()
    await waitFor(() => expect(document.title).toBe('Không tìm thấy trang · CampusTour'))
  })

  it.each([
    ['Staff', '/staff', 'Về khu vực Vận hành tour'],
    ['Admin', '/admin', 'Về khu vực Quản trị hệ thống'],
    ['Representative', '/dai-dien', 'Về khu vực Đăng ký đoàn'],
    ['TechnicalStaff', '/technical', 'Về khu vực Kỹ thuật'],
  ])('also links a signed-in %s to its own area', async (role, path, label) => {
    signIn(role)
    renderAt('/trang-khong-co')

    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', path)
  })

  it.each([
    ['/admin/schedule', '/staff/schedule'],
    ['/admin/reports', '/staff/history'],
    ['/staff/khong-co', '/staff'],
  ])('keeps the old redirect from %s', async (from, to) => {
    signIn('Staff')
    const router = renderAt(from)
    await waitFor(() => expect(router.state.location.pathname).toBe(to))
  })
})
