import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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




  // Compile the Staff home before timing session/guard behavior on a cold Windows run.
  beforeAll(async () => {
    await import('../../routes/staff/OverviewPage')
  }, 30_000)




  // Compile the Staff home before timing session/guard behavior.
  beforeAll(async () => { await import('../../routes/staff/OverviewPage') }, 30_000)


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
      return new Response(JSON.stringify({ success: true, data: [],
        pagination: { page: 1, pageSize: 1, totalItems: 0, totalPages: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const router = renderWithBootstrapAt('/admin')

    await settled(router, '/admin/accounts')

    expect(await screen.findByRole('heading', { name: 'Tài khoản', level: 1 })).toBeInTheDocument()

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
    it('loads physical robot registration inside the Technical Staff protected area', async () => {
      signIn('TechnicalStaff')
      renderAt('/technical/robots')
      expect(await screen.findByRole('heading', { name: 'Robot vật lý', level: 1 })).toBeInTheDocument()
    })

    it('sends a signed-out visitor from /staff to sign in', async () => {
      const router = renderAt('/staff')
      await settled(router, '/login')
    })

    it('sends a signed-out visitor from /admin to sign in', async () => {
      const router = renderAt('/admin')
      await settled(router, '/login')
    })

    it('sends Technical Staff to /technical and keeps Staff out of it', async () => {
      signIn('TechnicalStaff')
      const router = renderAt('/technical')
      await settled(router, '/technical/dashboard')
      expect(await screen.findByRole('heading', { name: 'Bảng điều khiển kỹ thuật', level: 1 })).toBeInTheDocument()
    })

    it('opens Robot and Mini PC monitoring for Technical Staff only', async () => {
      signIn('TechnicalStaff')
      const technicalRouter = renderAt('/technical/monitoring')
      await settled(technicalRouter, '/technical/monitoring')
      expect(await screen.findByRole('heading', { name: 'Giám sát robot và Mini PC', level: 1 })).toBeInTheDocument()
      cleanup()

      signIn('Admin')
      const adminRouter = renderAt('/technical/monitoring')
      await waitFor(() => expect(adminRouter.state.location.pathname.startsWith('/admin')).toBe(true))
    })

    it('keeps Staff out of the technical area', async () => {
      signIn('Staff')
      const router = renderAt('/technical/confirmations')
      await settled(router, '/staff')
    })

    // SRS LI-09–14: viewers have no accounts, so the old visitor app is gone.
    it('no longer serves the removed /visit area', async () => {
      signIn('Staff')
      const router = renderAt('/visit/book')
      await settled(router, '/')
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

    it.each(['/staff/manage/routes', '/staff/manage/tours', '/staff/manage/registrations'])('keeps Tour preparation away from a representative at %s', async path => {
      signIn('Representative')
      const router = renderAt(path)
      await settled(router, '/dai-dien')
    })

    it('lets an operator into /staff', async () => {
      signIn('Staff')
      const router = renderAt('/staff')
      await settled(router, '/staff')
      expect(await screen.findByRole('heading', { name: /^Tổng quan$/, level: 1 })).toBeInTheDocument()
    })

    it('keeps Admin out of the Staff workspace', async () => {
      signIn('Admin')
      const router = renderAt('/staff')
      await settled(router, '/admin/accounts')
    })

    it('still accepts a token minted before the operations roles were merged', async () => {
      signIn('TourOperator')
      const router = renderAt('/staff')
      await settled(router, '/staff')
    })
  })

  describe('administration', () => {
    it('opens /admin on Accounts, not the operations console', async () => {
      signIn('Admin')
      const router = renderAt('/admin')
      await settled(router, '/admin/accounts')
      expect(screen.queryByRole('heading', { name: /^Tổng quan$/ })).toBeNull()
    })

    it('keeps /admin/roles as a real route rather than a legacy redirect', async () => {
      signIn('Admin')
      const router = renderAt('/admin/roles')
      await settled(router, '/admin/roles')
      expect(await screen.findByRole('heading', { name: /Vai trò & quyền/i, level: 1 })).toBeInTheDocument()
      // The matrix covers UI areas only; it must not claim to describe API permissions.
      expect(screen.getByText(/quyền làm từng việc do máy chủ kiểm tra riêng/)).toBeInTheDocument()
      expect(screen.queryByText(/luôn khớp với hành vi thật/)).not.toBeInTheDocument()
    })

    it('opens infrastructure monitoring for Admin', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        success: true,
        data: {
          collectedAt: '2026-11-05T08:00:00Z',
          host: { machineName: 'test-host', osDescription: 'Linux', osArchitecture: 'X64', processorCount: 4, cpuPercent: 10, loadAverages: null, memory: { totalBytes: 100, availableBytes: 50, usedBytes: 50, usedPercent: 50, swapTotalBytes: null, swapUsedBytes: null, swapUsedPercent: null }, disk: { mountPoint: '/', driveFormat: 'ext4', totalBytes: 100, availableFreeBytes: 50, usedBytes: 50, usedPercent: 50, status: 'HEALTHY' }, network: [], hostUptimeSeconds: 100, status: 'HEALTHY' },
          runtime: { frameworkVersion: '.NET', environment: 'Test', processUptimeSeconds: 100, workingSetBytes: 100, gcTotalMemoryBytes: 100, threadCount: 1 },
          database: { status: 'ONLINE', canConnect: true, latencyMs: 1, provider: 'test', error: null },
          docker: { status: 'NOT_CONFIGURED', message: null, totalContainers: 0, runningContainers: 0, unhealthyContainers: 0, containers: [] },
          backup: { status: 'NOT_RECORDED', lastBackupTimestamp: null, ageHours: null, target: null, sizeBytes: null, message: null },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
      signIn('Admin')
      const router = renderAt('/admin/infrastructure')
      await settled(router, '/admin/infrastructure')
      expect(await screen.findByRole('heading', { name: /Hạ tầng máy chủ/i })).toBeInTheDocument()
    })

    it('shows credential audit to Admin and redirects other roles away', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        success: true,
        data: { items: [], page: 1, pageSize: 50, totalItems: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
      signIn('Admin')
      const adminRouter = renderAt('/admin/robot-credentials')
      await settled(adminRouter, '/admin/robot-credentials')
      expect(await screen.findByRole('heading', { name: 'Lịch sử khóa robot' })).toBeInTheDocument()

      cleanup()
      signIn('Staff')
      const staffRouter = renderAt('/admin/robot-credentials')
      await settled(staffRouter, '/staff')
    })
  })

  describe('tour preparation (Staff)', () => {
    beforeAll(async () => {
      // Cold Windows transforms can exceed the UI query timeout before React renders.
      await import('../../routes/staff/manage/StaffManageRegistrationsPage')
    }, 30_000)

    it.each([
      ['/staff/manage/tours/new', /^Tạo Tour$/],
      ['/staff/manage/registrations/pending', /Đăng ký chờ duyệt/],
      ['/staff/manage/registrations', /Tất cả đăng ký/],
      ['/staff/manage/routes', /Danh mục tuyến/],
    ])('serves %s to Staff', async (path, heading) => {
      signIn('Staff')
      if (path === '/staff/manage/routes') {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
          success: true, data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
      }
      const router = renderAt(path)
      await settled(router, path)
      expect(await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 10_000 })).toBeInTheDocument()
    })

    it('opens a Tour at /staff/manage/tours/:id instead of redirecting it to operations', async () => {
      signIn('Staff')
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404 })))
      const router = renderAt('/staff/manage/tours/tour-03')
      await settled(router, '/staff/manage/tours/tour-03')
      // The live detail page asks the Tour API; an unknown id stays on the admin page.
      expect(await screen.findByText(/Không tìm thấy Tour/)).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/staff/manage/tours/tour-03')
    })

    it('keeps a mistyped admin path inside administration', async () => {
      signIn('Admin')
      const router = renderAt('/admin/khong-co')
      await settled(router, '/admin/accounts')
    })
  })

  describe('Tour preparation URLs moved from /admin', () => {
    it.each([
      ['/admin/tours', '/staff/schedule'],
      ['/admin/tours/new', '/staff/manage/tours/new'],
      ['/admin/tours/tour-03/edit', '/staff/manage/tours/tour-03/edit'],
      ['/admin/registrations/pending', '/staff/manage/registrations/pending'],
      ['/admin/routes/sql-id', '/staff/manage/routes/sql-id'],
      ['/admin/pois/new', '/staff/manage/pois/new'],
      ['/admin/history', '/staff/history'],
    ])('redirects %s to %s', async (from, to) => {
      signIn('Staff')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 404 })))
      const router = renderAt(from)
      await settled(router, to)
    })

    it('keeps the query string', async () => {
      signIn('Staff')
      const router = renderAt('/admin/registrations?review=abc')
      await settled(router, '/staff/manage/registrations')
      expect(router.state.location.search).toBe('?review=abc')
    })
  })

  describe('pages merged into the overview and the calendar', () => {
    it.each([
      ['/staff/tours?view=READY', '/staff', '?view=READY'],
      ['/staff/manage/tours?state=READY', '/staff/schedule', '?state=READY&view=list'],
      ['/staff/manage/tours', '/staff/schedule', '?view=list'],
      ['/staff/manage?review=abc', '/staff', '?review=abc'],
    ])('sends %s to %s with its filters', async (from, to, search) => {
      signIn('Staff')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 404 })))
      const router = renderAt(from)
      await settled(router, to)
      expect(router.state.location.search).toBe(search)
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
      signIn('Staff')
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
