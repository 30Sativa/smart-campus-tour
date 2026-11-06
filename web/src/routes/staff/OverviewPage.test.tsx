import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import OverviewPage from './OverviewPage'

const tourRow = (id: string, name: string, state: string, extra: object = {}) => ({
  id, name, description: null, routeId: 'r', routeName: 'Tuyến', activeRouteId: 'r', scheduledStartAt: '2026-11-06T02:00:00Z',
  state, createdByUserId: 'u', createdAt: '2026-11-01T00:00:00Z', updatedAt: null, rowVersion: 'v', registrationCount: 1, invitationCount: 1, routeRevisionId: 'rev',
  ...extra,
})
const ASSIST_TOUR = tourRow('tour-help', 'Tour cần giúp', 'RUNNING', {
  reservation: { robotCode: 'amr_09', startsAt: '', endsAt: '', measuredDurationSeconds: 0, expectedDurationSeconds: 0, releasedAt: null },
  execution: { operationalStatus: 'NEEDS_ASSISTANCE', assistanceReason: null, currentStep: 'NAVIGATING', commandState: 'FAILED', needsReconcile: false },
})
const READY_TOUR = tourRow('tour-ready', 'Tour chiều', 'READY', {
  reservation: { robotCode: 'amr_01', startsAt: '', endsAt: '', measuredDurationSeconds: 0, expectedDurationSeconds: 0, releasedAt: null },
})

let running: object[] = []
const page = (data: object[], total = data.length) => new Response(JSON.stringify({ success: true, data, pagination: { page: 1, pageSize: 20, totalItems: total, totalPages: 1 } }), { status: 200 })

beforeEach(() => {
  running = []
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/staff/manage/registrations') return page([], 4)
    if (url.pathname !== '/api/staff/manage/tours') return page([])
    if (url.searchParams.get('phase') === 'RUNNING') return page(running)
    if (url.searchParams.get('state') === 'SCHEDULED') return page([], 2)
    // Today is the only list read with from/to and size 100.
    if (url.searchParams.get('from') && url.searchParams.get('size') === '100') return page([READY_TOUR])
    return page([])
  }))
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.getState().logout() })

function show(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><MemoryRouter><OverviewPage /></MemoryRouter></QueryClientProvider>)
}

describe('Staff home', () => {
  it('leads with what needs a person now, folds the preparation queue, and repeats no figure', async () => {
    running = [ASSIST_TOUR]
    show()
    const now = screen.getByRole('region', { name: 'Bây giờ' })
    expect(await within(now).findByText(/Tour cần giúp cần hỗ trợ/)).toBeInTheDocument()
    expect(await within(now).findByText('amr_09')).toBeInTheDocument()
    expect(await screen.findByText(/Dữ liệu Tour đọc lúc \d{2}:\d{2}, tự cập nhật\./)).toBeInTheDocument()
    const queue = screen.getByRole('region', { name: 'Hàng chờ chuẩn bị' })
    expect(await within(queue).findByText(/4 đăng ký chờ duyệt · 2 Tour chưa chốt/)).toBeInTheDocument()
    expect(within(queue).getByText(/Đang có việc cần xử lý ngay ở trên/)).toBeInTheDocument()
    // One overview: no figure strip that restates the alert.
    expect(screen.queryByRole('region', { name: 'Tình hình hôm nay' })).not.toBeInTheDocument()
  })

  it('without a running Tour, names the next one and keeps the queue open beside today', async () => {
    show()
    expect(await screen.findByText(/Không có Tour nào đang chạy\. Tour kế tiếp hôm nay: Tour chiều lúc/)).toBeInTheDocument()
    const queue = screen.getByRole('region', { name: 'Hàng chờ chuẩn bị' })
    expect(await within(within(queue).getByRole('group', { name: 'Đăng ký chờ duyệt' })).findByText('4')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tạo Tour/ })).toHaveAttribute('href', '/staff/manage/tours/new')
  })

  it("shows whether today's held robot reports, without calling it ready", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['staff', 'fleet-telemetry'], { receivedAt: Date.now(), robots: [{ id: 'amr_02', name: 'AMR 02', syncFresh: true }] })
    show(client)
    const today = await screen.findByRole('table', { name: 'Tour hôm nay' })
    expect(within(today).getByText('amr_01')).toBeInTheDocument()
    expect(within(today).getByText('Chưa báo cáo')).toBeInTheDocument()
    expect(within(today).queryByText(/sẵn sàng/i)).not.toBeInTheDocument()
  })
})
