import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import { StaffBell } from './StaffBell'

const NOTICES = [
  { id: 12, occurredAt: new Date().toISOString(), action: 'POI_TECHNICAL_VERIFIED', resultCode: 'PASS', targetId: 'p-1', subject: 'Thư viện', revisionNumber: 1, robotCode: 'amr-01', actorName: 'Kỹ thuật A' },
  { id: 11, occurredAt: new Date().toISOString(), action: 'ROUTE_TEST_FAILED', resultCode: 'FAIL', targetId: 'r-1', subject: 'Tuyến A', revisionNumber: 2, robotCode: 'amr-01', actorName: 'Kỹ thuật A' },
]

const empty = { success: true, data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }

function stubApi({ toursFail = false } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/staff/notifications') return new Response(JSON.stringify({ success: true, data: NOTICES }), { status: 200 })
    if (toursFail) return new Response(JSON.stringify({ success: false, message: 'down' }), { status: 500 })
    return new Response(JSON.stringify(empty), { status: 200 })
  }))
}

function renderBell() {
  useAuthStore.getState().setAuth('test-token', { userId: 'bell-user', username: 'staff', role: 'Staff' })
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><StaffBell /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => localStorage.clear())
afterEach(() => { useAuthStore.getState().logout(); vi.unstubAllGlobals() })

describe('StaffBell', () => {
  it('counts unread Technical Staff notices and links each to what it is about', async () => {
    stubApi()
    renderBell()
    const bell = await screen.findByRole('button', { name: 'Thông báo, 2 thông báo chưa đọc' })
    fireEvent.click(bell)
    const panel = screen.getByRole('region', { name: 'Bảng thông báo' })
    expect(within(panel).getByRole('link', { name: /POI "Thư viện" \(bản 1\) đã được duyệt/ })).toHaveAttribute('href', '/staff/manage/pois/p-1')
    expect(within(panel).getByRole('link', { name: /Tuyến "Tuyến A" \(bản 2\) chạy thử không đạt/ })).toHaveAttribute('href', '/staff/manage/routes/r-1')
    expect(await within(panel).findByText('Không có việc cần chú ý.')).toBeInTheDocument()
  })

  it('remembers what this account read, one at a time or all at once', async () => {
    stubApi()
    const { unmount } = renderBell()
    fireEvent.click(await screen.findByRole('button', { name: /2 thông báo chưa đọc/ }))
    fireEvent.click(screen.getByRole('link', { name: /POI "Thư viện"/ }))
    expect(screen.getByRole('button', { name: 'Thông báo, 1 thông báo chưa đọc' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thông báo, 1 thông báo chưa đọc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc (1)' }))
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeInTheDocument()
    unmount()

    renderBell()
    // Reads survive a reload: the bell comes back with nothing unread.
    await screen.findByRole('button', { name: 'Thông báo' })
    fireEvent.click(screen.getByRole('button', { name: 'Thông báo' }))
    expect(await screen.findByRole('link', { name: /POI "Thư viện"/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đánh dấu đã đọc/ })).not.toBeInTheDocument()
  })

  it('never says "nothing to do" when the Tours could not be read', async () => {
    stubApi({ toursFail: true })
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: /thông báo chưa đọc/ }))
    expect(await screen.findByText(/Không đọc được danh sách Tour/)).toBeInTheDocument()
    expect(screen.queryByText('Không có việc cần chú ý.')).not.toBeInTheDocument()
  })
})
