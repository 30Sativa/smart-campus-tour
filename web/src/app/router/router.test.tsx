import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from './index'
import { useAuthStore } from '../../stores/auth-store'

/**
 * The route table as a whole: who may enter each area, where a blocked
 * navigation lands, and which of two overlapping `/admin` rules wins.
 *
 * These are the exact regressions the area split can suffer twice: `/admin`
 * falling back into being the operations console, and a legacy redirect
 * swallowing a real administration route. Both are one route-array edit away,
 * and neither is visible to the type checker.
 */
function signIn(role: string) {
  useAuthStore.setState({
    accessToken: 'mock-access-token.test',
    isAuthenticated: true,
    user: { userId: 'test-user', username: 'test', role },
  })
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const settled = (router: ReturnType<typeof createMemoryRouter>, path: string) =>
  waitFor(() => expect(router.state.location.pathname).toBe(path))

describe('route table', () => {
  afterEach(() => useAuthStore.setState({ accessToken: null, user: null, isAuthenticated: false }))

  describe('guards', () => {
    it('sends a signed-out visitor from /staff to sign in', async () => {
      const router = renderAt('/staff')
      await settled(router, '/login')
    })

    it('sends a signed-out visitor from /admin to sign in', async () => {
      const router = renderAt('/admin')
      await settled(router, '/login')
    })

    it('sends an operator who types /admin back to their own console', async () => {
      signIn('Staff')
      const router = renderAt('/admin')
      await settled(router, '/staff')
    })

    it('lets an operator into /staff', async () => {
      signIn('Staff')
      const router = renderAt('/staff')
      await settled(router, '/staff')
      expect(await screen.findByRole('heading', { name: /Tình hình điều hành/i, level: 1 })).toBeInTheDocument()
    })

    it('lets an administrator into /staff as well', async () => {
      signIn('Admin')
      const router = renderAt('/staff')
      await settled(router, '/staff')
      expect(await screen.findByRole('heading', { name: /Tình hình điều hành/i, level: 1 })).toBeInTheDocument()
    })

    it('still accepts a token minted before the operations roles were merged', async () => {
      signIn('TourOperator')
      const router = renderAt('/staff')
      await settled(router, '/staff')
    })
  })

  describe('administration', () => {
    it('renders the administration overview at /admin, not the operations console', async () => {
      signIn('Admin')
      const router = renderAt('/admin')
      await settled(router, '/admin')
      expect(await screen.findByRole('heading', { name: /Tổng quan quản trị/i, level: 1 })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /Tình hình điều hành/i })).toBeNull()
    })

    it('keeps /admin/roles as a real route rather than a legacy redirect', async () => {
      signIn('Admin')
      const router = renderAt('/admin/roles')
      await settled(router, '/admin/roles')
      expect(await screen.findByRole('heading', { name: /Vai trò & quyền/i, level: 1 })).toBeInTheDocument()
    })
  })

  describe('tour administration', () => {
    it.each([
      ['/admin/tours', /Quản lý Tour/],
      ['/admin/tours/new', /Tạo Tour mới/],
      ['/admin/registrations/pending', /Đăng ký chờ duyệt/],
      ['/admin/registrations', /Tất cả đăng ký/],
      ['/admin/routes', /Danh mục tuyến/],
      ['/admin/history', /Lịch sử Tour/],
    ])('serves %s as a real admin page', async (path, heading) => {
      signIn('Admin')
      const router = renderAt(path)
      await settled(router, path)
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
    })

    it('opens a Tour at /admin/tours/:id instead of redirecting it to operations', async () => {
      signIn('Admin')
      const router = renderAt('/admin/tours/tour-03')
      await settled(router, '/admin/tours/tour-03')
      expect(await screen.findByRole('heading', { name: /Buổi chiều/, level: 1 })).toBeInTheDocument()
    })

    it('keeps a mistyped admin path inside administration', async () => {
      signIn('Admin')
      const router = renderAt('/admin/khong-co')
      await settled(router, '/admin')
    })
  })

  describe('legacy operations URLs', () => {
    it.each([
      ['/admin/schedule', '/staff/schedule'],
      ['/admin/amr', '/staff/robot'],
      ['/admin/alerts', '/staff'],
      ['/admin/digital-twin', '/staff/digital-twin'],
      ['/admin/reports', '/staff/history'],
      ['/staff/amr', '/staff/robot'],
      ['/staff/alerts', '/staff'],
      ['/staff/reports', '/staff/history'],
    ])('redirects %s to %s', async (from, to) => {
      signIn('Admin')
      const router = renderAt(from)
      await settled(router, to)
    })
  })

  it('sends an unknown path back to the public page', async () => {
    const router = renderAt('/khong-ton-tai')
    await settled(router, '/')
  })
})
