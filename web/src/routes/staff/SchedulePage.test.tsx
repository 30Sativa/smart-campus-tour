import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SchedulePage from './SchedulePage'

const session = { id: 'tour-1', name: 'Tour sáng thật', description: null, routeId: 'r', routeName: 'Tuyến thư viện', activeRouteId: 'r',
  scheduledStartAt: '2099-01-05T02:00:00Z', state: 'SCHEDULED', createdByUserId: 'u', createdAt: '2098-12-01T00:00:00Z', updatedAt: null,
  rowVersion: 'AA==', registrationCount: 0, invitationCount: 0, routeRevisionId: 'rev',
  reservation: { robotCode: 'amr-01', startsAt: '2099-01-05T01:45:00Z', endsAt: '2099-01-05T02:37:00Z', measuredDurationSeconds: 1200, expectedDurationSeconds: 1320, releasedAt: null } }
let urls: URL[] = []
let status = 200

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/staff/schedule?date=2099-01-05']}><SchedulePage /></MemoryRouter></QueryClientProvider>)

describe('Staff Tour calendar', () => {
  beforeEach(() => {
    urls = []
    status = 200
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(new URL(String(input), 'http://localhost'))
      return new Response(JSON.stringify({ success: status === 200, message: 'Không tải được.', data: [session], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 } }), { status })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads the week from the live Tour API, in campus time', async () => {
    show()
    expect(await within(await screen.findByRole('region', { name: 'Lịch tuần' })).findByRole('button', { name: /^09:00 - 09:22 Tour sáng thật/ })).toBeInTheDocument()
    const url = urls[0]
    expect(url.pathname).toBe('/api/staff/manage/tours')
    expect(url.searchParams.get('from')).toBe('2099-01-04T17:00:00.000Z')
    expect(url.searchParams.get('to')).toBe('2099-01-11T16:59:59.999Z')
    expect(url.searchParams.get('sort')).toBe('scheduledStartAt')
  })

  it('shows one calendar representation at a time', async () => {
    show()
    expect(await screen.findByRole('region', { name: 'Lịch tuần' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ngày' }))
    const robots = await screen.findByRole('list', { name: 'Robot trong ngày' })
    expect(within(robots).getByText('amr-01')).toBeInTheDocument()
    expect(within(robots).getByRole('link', { name: 'Tour sáng thật' })).toHaveAttribute('href', '/staff/manage/tours/tour-1')
    expect(screen.queryByRole('region', { name: 'Lịch tuần' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // Under the robots, every Tour of the day, so one without a robot hold is not lost.
    expect(within(screen.getByRole('list', { name: 'Lịch tour' })).getByText(/robot amr-01 · giữ 08:45 - 09:37/)).toBeInTheDocument()
  })

  it('lists every Tour across time in the list view, which was the Tour list page', async () => {
    show()
    await screen.findByRole('region', { name: 'Lịch tuần' })
    const calendarCalls = urls.length
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách' }))
    const table = await screen.findByRole('table', { name: 'Danh sách Tour' })
    expect(within(table).getByRole('link', { name: 'Tour sáng thật' })).toHaveAttribute('href', '/staff/tours/tour-1')
    expect(screen.getByRole('button', { name: 'Sắp diễn ra' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('region', { name: 'Lịch tuần' })).not.toBeInTheDocument()
    // The list asks by phase, not for this week's dates.
    const listed = urls.slice(calendarCalls).at(-1)!
    expect(listed.searchParams.get('phase')).toBe('UPCOMING')
    expect(listed.searchParams.get('from')).toBeNull()
    // Picking a tab keeps the page on the list view.
    fireEvent.click(screen.getByRole('button', { name: 'Đang chạy' }))
    expect(await screen.findByRole('table', { name: 'Danh sách Tour' })).toBeInTheDocument()
  })

  it('reports a failed load with a retry and invents no sessions', async () => {
    status = 503
    show()
    fireEvent.click(await screen.findByRole('button', { name: /Thử lại/ }))
    expect(screen.queryByText('Tour sáng thật')).not.toBeInTheDocument()
  })
})
