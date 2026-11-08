import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STAFF_NAV } from '../../features/staff/staff-nav'
import TourHistoryPage from './TourHistoryPage'

const row = (id: string, name: string, state: string) => ({ id, name, description: null, routeId: 'r', routeName: 'Tuyến', activeRouteId: 'r', scheduledStartAt: '2026-11-01T02:00:00Z',
  state, createdByUserId: 'u', createdAt: '2026-10-01T00:00:00Z', updatedAt: null, rowVersion: 'AA==', registrationCount: 0, invitationCount: 0, routeRevisionId: null })
let rows: Record<string, ReturnType<typeof row>[]> = {}

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TourHistoryPage /></MemoryRouter></QueryClientProvider>)

describe('Tour history', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const state = new URL(String(input), 'http://localhost').searchParams.get('state') ?? ''
      const data = rows[state] ?? []
      return new Response(JSON.stringify({ success: true, data, pagination: { page: 1, pageSize: 20, totalItems: data.length, totalPages: 1 } }), { status: 200 })
    }))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('opens the first tab with Tours, so only cancelled Tours are not hidden behind an empty tab', async () => {
    rows = { COMPLETED: [], CANCELLED: [row('c1', 'Tour đã huỷ', 'CANCELLED')] }
    show()
    expect(await screen.findByRole('link', { name: 'Tour đã huỷ' })).toBeInTheDocument()
    expect(screen.queryByText('Chưa có tour nào trong lịch sử.')).not.toBeInTheDocument()
  })

  it('opens the finished tab when it has Tours', async () => {
    rows = { COMPLETED: [row('d1', 'Tour xong', 'COMPLETED')], CANCELLED: [row('c1', 'Tour đã huỷ', 'CANCELLED')] }
    show()
    expect(await screen.findByRole('link', { name: 'Tour xong' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tour đã huỷ' })).not.toBeInTheDocument()
  })

  it('stays on the tab Staff clicks, even an empty one', async () => {
    rows = { COMPLETED: [], CANCELLED: [row('c1', 'Tour đã huỷ', 'CANCELLED')] }
    show()
    await screen.findByRole('link', { name: 'Tour đã huỷ' })
    fireEvent.click(screen.getByRole('button', { name: 'Đã kết thúc' }))
    await waitFor(() => expect(screen.getByText('Chưa có tour nào trong lịch sử.')).toBeInTheDocument())
  })

  it('uses one name in the menu and the page title', async () => {
    rows = { COMPLETED: [], CANCELLED: [] }
    show()
    expect(screen.getByRole('heading', { name: 'Lịch sử Tour' })).toBeInTheDocument()
    expect(STAFF_NAV.find(item => item.path === '/staff/history')?.label).toBe('Lịch sử Tour')
    expect(await screen.findByText('Chưa có tour nào trong lịch sử.')).toBeInTheDocument()
  })
})
