import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import TechnicalRouteTestsPage from '../../routes/technical/TechnicalRouteTestsPage'
import { useAuthStore } from '../../stores/auth-store'

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, message: 'OK', data, errors: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
const route = { routeId: 'route-1', revisionId: 'rev-1', revisionNumber: 1, name: 'Tuyến thư viện', mapKey: 'library-v1', stops: [{}, {}], dwellDurationSeconds: 60, verificationStatus: 'PASS', isSubmitted: true, testRuns: [], revisionHistory: [] }

function renderPage(client = new QueryClient()) {
  // The app's own QueryClient keeps TanStack's default retries; the stat tiles are judged with them on.
  return render(<QueryClientProvider client={client}><MemoryRouter><TechnicalRouteTestsPage /></MemoryRouter></QueryClientProvider>)
}

describe('route test stat tiles after an expired access token', () => {
  let refreshes = 0
  beforeEach(() => {
    refreshes = 0
    useAuthStore.getState().setAuth('expired', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
  })
  afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

  it('shows the figures as soon as the refreshed retry answers, even when one 401 arrives after the refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/auth/refresh') {
        refreshes += 1
        return new Response(JSON.stringify({ accessToken: 'fresh', userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' }), { status: 200 })
      }
      if (new Headers(init?.headers).get('Authorization') !== 'Bearer fresh') {
        // The catalog's 401 lands after the queue's refresh has already finished.
        if (url.pathname === '/api/routes') await new Promise(resolve => setTimeout(resolve, 50))
        return new Response(null, { status: 401 })
      }
      if (url.pathname === '/api/routes') return envelope([route])
      return envelope([])
    }))

    renderPage()
    expect(await screen.findByRole('button', { name: /Đã đạt\s*1/ }, { timeout: 500 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Không đạt\s*0/ })).toBeInTheDocument()
    expect(refreshes).toBeGreaterThan(0)
  })

  it('prints - with a Tải lại button when the catalog really fails, on the default filter too, and recovers', async () => {
    useAuthStore.getState().setAuth('fresh', { userId: 'tech-1', username: 'tech', role: 'TechnicalStaff' })
    let catalogFails = true
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/routes') return catalogFails ? new Response(JSON.stringify({ success: false, message: 'Server error.' }), { status: 503 }) : envelope([route])
      return envelope([])
    }))

    renderPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }))
    expect(await screen.findByRole('button', { name: /Đã đạt\s*-/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Không đạt\s*-/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chờ chạy thử/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa tải được số tuyến đã đạt và không đạt.')

    catalogFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(await screen.findByRole('button', { name: /Đã đạt\s*1/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
