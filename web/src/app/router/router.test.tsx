import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from './index'
import { useAuthStore } from '../../stores/auth-store'
import { AuthBootstrap } from '../../auth/AuthBootstrap'

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
    isAuthReady: true,
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

function renderWithBootstrapAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthBootstrap><RouterProvider router={router} /></AuthBootstrap>
    </QueryClientProvider>,
  )
  return router
}

const settled = (router: ReturnType<typeof createMemoryRouter>, path: string) =>
  waitFor(() => expect(router.state.location.pathname).toBe(path))

describe('route table', () => {
  beforeEach(() => useAuthStore.getState().setAuthReady())
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore.getState().logout()
  })

  it('restores an Admin session before rendering the requested protected area', async () => {
    useAuthStore.setState({ isAuthReady: false, accessToken: null, user: null, isAuthenticated: false })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/refresh')) {
        return new Response(JSON.stringify({
          accessToken: 'restored-admin-token',
          userId: 'admin-id',
          username: 'admin',
          role: 'Admin',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = renderWithBootstrapAt('/admin')

    await settled(router, '/admin')
    expect(await screen.findByRole('heading', { name: /^Tổng quan$/i, level: 1 })).toBeInTheDocument()
    expect(useAuthStore.getState().user?.role).toBe('Admin')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    })
  })

  it('sends a protected route to login when session restoration fails', async () => {
    useAuthStore.setState({ isAuthReady: false, accessToken: null, user: null, isAuthenticated: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    const router = renderWithBootstrapAt('/admin')

    await settled(router, '/login')
    expect(await screen.findByRole('heading', { name: 'Chào mừng bạn trở lại' })).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('waits for session restoration before redirecting a protected route', async () => {
    useAuthStore.setState({ isAuthReady: false, accessToken: null, user: null, isAuthenticated: false })
    const router = renderAt('/admin')

    expect(router.state.location.pathname).toBe('/admin')
    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra phiên đăng nhập')

    act(() => useAuthStore.getState().setAuthReady())
    await settled(router, '/login')
  })

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

    it('keeps Admin Accounts behind the Admin route guard', async () => {
      signIn('Staff')
      const router = renderAt('/admin/accounts')
      await settled(router, '/staff')
    })

    it('lets an operator into /staff', async () => {
      signIn('Staff')
      const router = renderAt('/staff')
      await settled(router, '/staff')
      expect(await screen.findByRole('heading', { name: /Tổng quan vận hành/i, level: 1 })).toBeInTheDocument()
    })

    it('lets an administrator into /staff as well', async () => {
      signIn('Admin')
      const router = renderAt('/staff')
      await settled(router, '/staff')
      expect(await screen.findByRole('heading', { name: /Tổng quan vận hành/i, level: 1 })).toBeInTheDocument()
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
      expect(await screen.findByRole('heading', { name: /^Tổng quan$/i, level: 1 })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /Tổng quan vận hành/i })).toBeNull()
    })

    it('keeps /admin/roles as a real route rather than a legacy redirect', async () => {
      signIn('Admin')
      const router = renderAt('/admin/roles')
      await settled(router, '/admin/roles')
      expect(await screen.findByRole('heading', { name: /Vai trò & quyền/i, level: 1 })).toBeInTheDocument()
    })
  })

  describe('tour administration', () => {
    beforeAll(async () => {
      // Cold Windows transforms can exceed the UI query timeout before React renders.
      await import('../../routes/admin/AdminRegistrationsPage')
    }, 30_000)

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
      expect(await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 10_000 })).toBeInTheDocument()
    })

    it('opens a Tour at /admin/tours/:id instead of redirecting it to operations', async () => {
      signIn('Admin')
      const router = renderAt('/admin/tours/tour-03')
      await settled(router, '/admin/tours/tour-03')

      expect(await screen.findByRole('heading', { name: /Tour T-03/i, level: 1 })).toBeInTheDocument()
      expect(await screen.findByRole('heading', { name: /Buổi chiều/i, level: 2 })).toBeInTheDocument()
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

  it('does not expose the removed public self-registration route', async () => {
    const router = renderAt('/register')
    await settled(router, '/')
  })
})
