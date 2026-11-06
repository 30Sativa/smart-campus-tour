import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import OverviewPage from './OverviewPage'

const ASSIST_TOUR = {
  id: 'tour-help', name: 'Tour cần giúp', description: null, routeId: 'r', routeName: 'Tuyến', activeRouteId: 'r', scheduledStartAt: '2026-11-06T02:00:00Z',
  state: 'RUNNING', createdByUserId: 'u', createdAt: '2026-11-01T00:00:00Z', updatedAt: null, rowVersion: 'v', registrationCount: 1, invitationCount: 1, routeRevisionId: 'rev',
  execution: { operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: null, currentStep: 'NAVIGATING', commandState: 'FAILED', needsReconcile: false },
}

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const running = url.pathname === '/api/staff/manage/tours' && url.searchParams.get('phase') === 'RUNNING'
    return new Response(JSON.stringify({ success: true, data: running ? [ASSIST_TOUR] : [], pagination: { page: 1, pageSize: 20, totalItems: running ? 1 : 0, totalPages: 1 } }), { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

describe('operations overview', () => {
  it('says when the Tour data was read, and shows assistance once as an alert rather than again as a figure', async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><OverviewPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText(/Tour cần giúp cần hỗ trợ/)).toBeInTheDocument()
    expect(await screen.findByText(/Dữ liệu Tour đọc lúc \d{2}:\d{2}, tự cập nhật\./)).toBeInTheDocument()
    const kpis = screen.getByRole('region', { name: 'Tình hình hôm nay' })
    expect(within(kpis).queryByText('Cần hỗ trợ')).not.toBeInTheDocument()
    expect(within(kpis).getByText('Đang diễn ra')).toBeInTheDocument()
  })
})
