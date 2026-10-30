import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RobotPage from './RobotPage'
import TourHistoryPage from './TourHistoryPage'

let urls: URL[] = []
let status = 200
const finished = { id: 'tour-9', name: 'Tour đã xong', description: null, routeId: 'r', routeName: 'Tuyến thư viện', activeRouteId: 'r',
  scheduledStartAt: '2026-10-01T02:00:00Z', state: 'COMPLETED', createdByUserId: 'u', createdAt: '2026-09-01T00:00:00Z', updatedAt: null,
  rowVersion: 'AA==', registrationCount: 2, invitationCount: 2, routeRevisionId: null, reservation: null }
const robot = { id: 'r1', robotCode: 'amr-01', displayName: 'AMR 01', connectionStatus: 'CONNECTED', lastSyncReceivedAt: '2026-10-30T02:00:00Z' }

const show = (page: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>)

beforeEach(() => {
  urls = []
  status = 200
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    urls.push(url)
    const data = url.pathname === '/api/staff/physical-robots' ? [robot] : [finished]
    return new Response(JSON.stringify({ success: status === 200, message: 'Lỗi', data, pagination: { page: 1, pageSize: 20, totalItems: 7, totalPages: 1 } }), { status })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Staff pages backed by live APIs', () => {
  it('reads history from the Tour API, by result and newest first', async () => {
    show(<TourHistoryPage />)
    const link = await screen.findByRole('link', { name: 'Tour đã xong' })
    expect(link).toHaveAttribute('href', '/staff/manage/tours/tour-9')
    const list = urls.find(url => url.searchParams.get('size') === '20')
    expect(list?.pathname).toBe('/api/staff/manage/tours')
    expect(list?.searchParams.get('state')).toBe('COMPLETED')
    expect(list?.searchParams.get('sort')).toBe('-scheduledStartAt')
    fireEvent.click(screen.getByRole('button', { name: 'Đã hủy' }))
    await waitFor(() => expect(urls.some(url => url.searchParams.get('size') === '20' && url.searchParams.get('state') === 'CANCELLED')).toBe(true))
  })

  it('lists physical robots with their real connection and invents no telemetry', async () => {
    show(<RobotPage />)
    expect(await screen.findByRole('cell', { name: 'AMR 01' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'amr-01' })).toBeInTheDocument()
    expect(urls[0].pathname).toBe('/api/staff/physical-robots')
    expect(screen.queryByText(/pin/i)).not.toBeInTheDocument()
  })

  it('offers a retry instead of sample robots when the list cannot load', async () => {
    status = 503
    show(<RobotPage />)
    expect(await screen.findByRole('button', { name: /Thử lại/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
