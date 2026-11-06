import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SchedulePage from './SchedulePage'

const session = { id: 'tour-1', name: 'Tour sáng thật', description: null, routeId: 'r', routeName: 'Tuyến thư viện', activeRouteId: 'r',
  scheduledStartAt: '2099-01-05T02:00:00Z', state: 'SCHEDULED', createdByUserId: 'u', createdAt: '2098-12-01T00:00:00Z', updatedAt: null,
  rowVersion: 'AA==', registrationCount: 0, invitationCount: 0, routeRevisionId: 'rev',
  reservation: { robotCode: 'amr-01', startsAt: '2099-01-05T01:45:00Z', endsAt: '2099-01-05T02:37:00Z', measuredDurationSeconds: 1200, expectedDurationSeconds: 1320, releasedAt: null } }
/** An older Tour typed at 21:19, outside the 07:00-19:00 grid. */
const evening = { ...session, id: 'tour-2', name: 'Tour tối cũ', scheduledStartAt: '2099-01-06T14:19:00Z',
  reservation: { ...session.reservation, startsAt: '2099-01-06T14:04:00Z', endsAt: '2099-01-06T14:56:00Z' } }
/** The two shifts of each requested campus day (docs/lich-tour-theo-ca.md §3), in UTC. */
function shiftDays(from: string, to: string) {
  const days = []
  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10)
    days.push({ date, shifts: [
      { code: 'S1', name: 'Ca sáng', startsAt: `${date}T01:00:00Z`, endsAt: `${date}T03:00:00Z`, tourStartsAt: `${date}T01:15:00Z`, time: '08:15', maxDurationSeconds: 5400 },
      { code: 'S2', name: 'Ca chiều 1', startsAt: `${date}T06:00:00Z`, endsAt: `${date}T08:00:00Z`, tourStartsAt: `${date}T06:15:00Z`, time: '13:15', maxDurationSeconds: 5400 },
    ] })
  }
  return days
}
let urls: URL[] = []
let status = 200

const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={['/staff/schedule?date=2099-01-05']}><SchedulePage /></MemoryRouter></QueryClientProvider>)

describe('Staff Tour calendar', () => {
  beforeEach(() => {
    urls = []
    status = 200
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      urls.push(url)
      if (url.pathname === '/api/staff/manage/tours/shifts')
        return new Response(JSON.stringify({ success: true, data: { days: shiftDays(url.searchParams.get('from')!, url.searchParams.get('to')!), recommendedMaxSeconds: 3600 } }), { status: 200 })
      return new Response(JSON.stringify({ success: status === 200, message: 'Không tải được.', data: [session, evening], pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 } }), { status })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads the week from the live Tour API, in campus time', async () => {
    show()
    expect(await within(await screen.findByRole('region', { name: 'Lịch tuần' })).findByRole('button', { name: /^09:00 - 09:22 Tour sáng thật/ })).toBeInTheDocument()
    const url = urls.find(item => item.pathname === '/api/staff/manage/tours')!
    expect(url.pathname).toBe('/api/staff/manage/tours')
    expect(url.searchParams.get('from')).toBe('2099-01-04T17:00:00.000Z')
    expect(url.searchParams.get('to')).toBe('2099-01-11T16:59:59.999Z')
    expect(url.searchParams.get('sort')).toBe('scheduledStartAt')
  })

  it('draws each shift and offers "+ Tạo Tour" only on a free shift', async () => {
    show()
    const week = await screen.findByRole('region', { name: 'Lịch tuần' })
    const shifts = await within(week).findAllByRole('group', { name: 'Ca sáng 08:00 - 10:00' })
    expect(shifts).toHaveLength(7)
    // 2099-01-05: the morning shift holds "Tour sáng thật", the afternoon one is free.
    expect(within(week).queryByRole('link', { name: 'Tạo Tour Ca sáng ngày 2099-01-05' })).not.toBeInTheDocument()
    expect(within(week).getByRole('link', { name: 'Tạo Tour Ca chiều 1 ngày 2099-01-05' })).toHaveAttribute('href', '/staff/manage/tours/new?date=2099-01-05&shift=S2')
    expect(within(week).getByRole('link', { name: 'Tạo Tour Ca sáng ngày 2099-01-06' })).toBeInTheDocument()
    expect(urls.find(item => item.pathname === '/api/staff/manage/tours/shifts')!.searchParams.get('to')).toBe('2099-01-11')
  })

  it('keeps a Tour outside 07:00-19:00 in the day\'s "Ngoài ca" strip instead of past the grid', async () => {
    show()
    const week = await screen.findByRole('region', { name: 'Lịch tuần' })
    const outside = await within(week).findByRole('generic', { name: 'Ngoài ca ngày 2099-01-06' })
    expect(within(outside).getByRole('button', { name: /^Ngoài ca: 21:19 - 21:41 Tour tối cũ/ })).toBeInTheDocument()
    expect(within(week).queryByRole('button', { name: /^21:19 - 21:41 Tour tối cũ/ })).not.toBeInTheDocument()
    fireEvent.click(within(outside).getByRole('button', { name: /Tour tối cũ/ }))
    expect(within(screen.getByRole('complementary', { name: 'Buổi đang chọn' })).getByText('Tour tối cũ')).toBeInTheDocument()
  })

  it('shows the day\'s shifts above the robots in the day view', async () => {
    show()
    await screen.findByRole('region', { name: 'Lịch tuần' })
    fireEvent.click(screen.getByRole('button', { name: 'Ngày' }))
    const shifts = await screen.findByRole('list', { name: 'Các ca trong ngày' })
    expect(within(shifts).getByRole('listitem', { name: 'Ca sáng 08:00 - 10:00' })).toBeInTheDocument()
    expect(within(shifts).getByRole('link', { name: 'Tạo Tour Ca chiều 1 ngày 2099-01-05' })).toHaveAttribute('href', '/staff/manage/tours/new?date=2099-01-05&shift=S2')
    expect(within(shifts).queryByRole('link', { name: 'Tạo Tour Ca sáng ngày 2099-01-05' })).not.toBeInTheDocument()
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
