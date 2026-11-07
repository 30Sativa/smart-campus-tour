import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SchedulePage from './SchedulePage'

const session = { id: 'tour-1', name: 'Tour sáng thật', description: null, routeId: 'r', routeName: 'Tuyến thư viện', activeRouteId: 'r',
  scheduledStartAt: '2099-01-05T02:00:00Z', state: 'SCHEDULED', createdByUserId: 'u', createdAt: '2098-12-01T00:00:00Z', updatedAt: null,
  rowVersion: 'AA==', registrationCount: 0, invitationCount: 0, routeRevisionId: 'rev',
  reservation: { robotCode: 'amr-01', startsAt: '2099-01-05T01:45:00Z', endsAt: '2099-01-05T02:37:00Z', measuredDurationSeconds: 1200, expectedDurationSeconds: 1320, releasedAt: null } }
/** An older Tour typed at 21:19, outside every shift. */
const evening = { ...session, id: 'tour-2', name: 'Tour tối cũ', scheduledStartAt: '2099-01-06T14:19:00Z',
  reservation: { ...session.reservation, startsAt: '2099-01-06T14:04:00Z', endsAt: '2099-01-06T14:56:00Z' } }
/** The two shifts of each requested campus day (docs/lich-tour-theo-ca.md §3), in UTC. */
function shiftDays(from: string, to: string) {
  const days = []
  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10)
    days.push({ date, shifts: [
      { code: 'S1', name: 'Ca sáng', startsAt: `${date}T01:00:00Z`, endsAt: `${date}T03:00:00Z`, tourStartsAt: `${date}T01:15:00Z`, time: '08:15', maxDurationSeconds: 5400 },
      { code: 'S2', name: 'Ca chiều 1', startsAt: `${date}T06:00:00Z`, endsAt: `${date}T08:00:00Z`, tourStartsAt: `${date}T06:15:00Z`, time: '13:15', maxDurationSeconds: 5400,
        block: date === blockedDate ? { id: 'block-1', scope: 'SHIFT', reason: 'Bảo trì robot' } : null },
    ] })
  }
  return days
}
let blockedDate = ''
let urls: URL[] = []
let status = 200
let shiftStatus = 200
let tourRows: unknown[] = []

function Location() {
  const { search } = useLocation()
  return <output data-testid="location">{search}</output>
}

const show = (entry = '/staff/schedule?date=2099-01-05') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[entry]}><SchedulePage /><Location /></MemoryRouter></QueryClientProvider>)

describe('Staff Tour calendar', () => {
  beforeEach(() => {
    urls = []
    status = 200
    shiftStatus = 200
    tourRows = [session, evening]
    blockedDate = ''
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      urls.push(url)
      if (url.pathname === '/api/staff/manage/tours/shifts')
        return new Response(JSON.stringify({ success: shiftStatus === 200, message: 'Không tải được.', data: { days: shiftDays(url.searchParams.get('from')!, url.searchParams.get('to')!), recommendedMaxSeconds: 3600 } }), { status: shiftStatus })
      return new Response(JSON.stringify({ success: status === 200, message: 'Không tải được.', data: tourRows, pagination: { page: 1, pageSize: 100, totalItems: tourRows.length, totalPages: 1 } }), { status })
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('reads the week from the live Tour API, in campus time', async () => {
    show()
    expect(await within(await screen.findByRole('region', { name: 'Lịch tuần' })).findByRole('button', { name: /^09:00 - 09:22 Tour sáng thật/ })).toBeInTheDocument()
    const url = urls.find(item => item.pathname === '/api/staff/manage/tours')!
    expect(url.pathname).toBe('/api/staff/manage/tours')
    expect(url.searchParams.get('from')).toBe('2099-01-04T17:00:00.000Z')
    expect(url.searchParams.get('to')).toBe('2099-01-11T16:59:59.999Z')
    expect(url.searchParams.get('sort')).toBe('scheduledStartAt')
  })

  it('draws the week as shifts by days, naming each shift once with its times from the shifts endpoint', async () => {
    show()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader')).toHaveLength(8)
    const morning = within(table).getByRole('rowheader', { name: /Ca sáng/ })
    expect(morning).toHaveTextContent('Ca sáng · 08:00-10:00')
    expect(morning).toHaveTextContent('Tour bắt đầu 08:15')
    expect(within(table).getAllByText('Ca sáng')).toHaveLength(1)
    expect(within(table).getByRole('rowheader', { name: /Ca chiều 1/ })).toHaveTextContent('Ca chiều 1 · 13:00-15:00')
    expect(urls.find(item => item.pathname === '/api/staff/manage/tours/shifts')!.searchParams.get('to')).toBe('2099-01-11')
  })

  it('offers a create button only on a free shift', async () => {
    show()
    const week = await screen.findByRole('region', { name: 'Lịch tuần' })
    // 2099-01-05: the morning shift holds "Tour sáng thật", the afternoon one is free.
    expect(within(week).queryByRole('link', { name: 'Tạo Tour Ca sáng ngày 05/01/2099' })).not.toBeInTheDocument()
    expect(within(week).getByRole('link', { name: 'Tạo Tour Ca chiều 1 ngày 05/01/2099' })).toHaveAttribute('href', '/staff/manage/tours/new?date=2099-01-05&shift=S2')
    expect(within(week).getByRole('link', { name: 'Tạo Tour Ca sáng ngày 06/01/2099' })).toBeInTheDocument()
  })

  it('offers no create button on an empty shift less than 72 hours away, and prints nothing in it', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2099-01-04T00:00:00Z').getTime())
    tourRows = []
    show()
    const week = await screen.findByRole('region', { name: 'Lịch tuần' })
    // Tour starts: 05/01 is about a day away and 06/01 about two; 07/01 at 08:15 is just past 72 hours.
    expect(within(week).getByRole('link', { name: 'Tạo Tour Ca sáng ngày 07/01/2099' })).toBeInTheDocument()
    expect(within(week).queryByRole('link', { name: 'Tạo Tour Ca sáng ngày 05/01/2099' })).not.toBeInTheDocument()
    expect(within(week).queryByRole('link', { name: 'Tạo Tour Ca chiều 1 ngày 06/01/2099' })).not.toBeInTheDocument()
    const morningCells = within(within(week).getByRole('rowheader', { name: /Ca sáng/ }).closest('tr')!).getAllByRole('cell')
    expect(morningCells[0]).toBeEmptyDOMElement()
  })

  it('shows a shift closed by Admin with its reason, in full on hover, and no create button', async () => {
    blockedDate = '2099-01-06'
    show()
    const week = await screen.findByRole('region', { name: 'Lịch tuần' })
    const closed = within(week).getByRole('group', { name: 'Ca chiều 1 13:00-15:00, đã khoá: Bảo trì robot' })
    expect(closed).toHaveTextContent('Bảo trì robot')
    expect(closed).toHaveAttribute('title', 'Bảo trì robot')
    expect(within(week).queryByRole('link', { name: 'Tạo Tour Ca chiều 1 ngày 06/01/2099' })).not.toBeInTheDocument()
    expect(within(week).getByRole('link', { name: 'Tạo Tour Ca sáng ngày 06/01/2099' })).toBeInTheDocument()
  })

  it('keeps a Tour outside every shift in the "Ngoài ca" row, and opens it from there', async () => {
    show()
    const week = await screen.findByRole('region', { name: 'Lịch tuần' })
    const outside = within(week).getByRole('cell', { name: 'Ngoài ca ngày 06/01/2099' })
    expect(within(outside).getByRole('button', { name: /^Ngoài ca: 21:19 - 21:41 Tour tối cũ/ })).toBeInTheDocument()
    expect(within(week).queryByRole('button', { name: /^21:19 - 21:41 Tour tối cũ/ })).not.toBeInTheDocument()
    fireEvent.click(within(outside).getByRole('button', { name: /Tour tối cũ/ }))
    expect(within(await screen.findByRole('dialog', { name: 'Buổi đang chọn' })).getByText('Tour tối cũ')).toBeInTheDocument()
  })

  it('has no "Ngoài ca" row in a week without such a Tour', async () => {
    tourRows = [session]
    show()
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('rowheader', { name: /Ca sáng/ })).toBeInTheDocument()
    expect(within(table).queryByRole('rowheader', { name: 'Ngoài ca' })).not.toBeInTheDocument()
  })

  it('prints the robot on a Tour card only when the week has two robots or more', async () => {
    show()
    expect(await screen.findByRole('button', { name: /Tour sáng thật/ })).not.toHaveTextContent('amr-01')
    cleanup()
    tourRows = [session, { ...evening, reservation: { ...evening.reservation, robotCode: 'amr-02' } }]
    show()
    expect(await screen.findByRole('button', { name: /Tour sáng thật/ })).toHaveTextContent('amr-01')
  })

  it('opens a Tour in a drawer kept on the URL, and closes it with Esc or the X', async () => {
    show()
    await screen.findByRole('region', { name: 'Lịch tuần' })
    // The whole width is the calendar's until a Tour is chosen.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Tour sáng thật/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Buổi đang chọn' })
    expect(within(drawer).getByRole('link', { name: 'Xem chi tiết Tour' })).toHaveAttribute('href', '/staff/manage/tours/tour-1')
    expect(within(drawer).getByRole('link', { name: 'Xem đăng ký' })).toHaveAttribute('href', '/staff/manage/registrations')
    expect(within(drawer).getByText('08:45 - 09:37')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('tour=tour-1')

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('location')).not.toHaveTextContent('tour=')

    fireEvent.click(screen.getByRole('button', { name: /Tour sáng thật/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Đóng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens the drawer directly from ?tour= on the address', async () => {
    show('/staff/schedule?date=2099-01-05&tour=tour-2')
    expect(within(await screen.findByRole('dialog', { name: 'Buổi đang chọn' })).getByText('Tour tối cũ')).toBeInTheDocument()
  })

  it('shows the day as one card per shift: Tours by robot, closed with the whole reason, and outside Tours apart', async () => {
    blockedDate = '2099-01-05'
    tourRows = [session, { ...session, id: 'tour-3', name: 'Tour robot A', reservation: { ...session.reservation, robotCode: 'amr-00' } }, { ...evening, scheduledStartAt: '2099-01-05T14:19:00Z' }]
    show('/staff/schedule?date=2099-01-05&view=day')
    const morning = await screen.findByRole('article', { name: 'Ca sáng 08:00-10:00' })
    expect(morning).toHaveTextContent('Tour bắt đầu 08:15')
    const rows = within(within(morning).getByRole('list', { name: 'Tour trong ca' })).getAllByRole('button')
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual([expect.stringContaining('Tour robot A'), expect.stringContaining('Tour sáng thật')])
    expect(rows[1]).toHaveTextContent('robot amr-01 · giữ 08:45 - 09:37')
    expect(within(screen.getByRole('article', { name: 'Ca chiều 1 13:00-15:00' })).getByRole('group')).toHaveTextContent('Đã khoá: Bảo trì robot')
    expect(within(screen.getByRole('region', { name: 'Ngoài ca ngày 05/01/2099' })).getByRole('button', { name: /Tour tối cũ/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Tạo Tour Ca sáng ngày 05/01/2099' })).not.toBeInTheDocument()
    fireEvent.click(rows[1])
    expect(await screen.findByRole('dialog', { name: 'Buổi đang chọn' })).toBeInTheDocument()
  })

  it('offers "Tạo Tour" with the day and shift on a free shift of the day view', async () => {
    show('/staff/schedule?date=2099-01-05&view=day')
    const free = await screen.findByRole('article', { name: 'Ca chiều 1 13:00-15:00' })
    expect(within(free).getByRole('link', { name: 'Tạo Tour Ca chiều 1 ngày 05/01/2099' })).toHaveAttribute('href', '/staff/manage/tours/new?date=2099-01-05&shift=S2')
  })

  it('lists the week by day on a narrow screen, with no seven-column table', async () => {
    const matchMedia = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...matchMedia(query), matches: query === '(max-width: 767px)' }))
    show()
    const week = await screen.findByRole('region', { name: 'Lịch tuần' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(week).getAllByRole('article', { name: 'Ca sáng 08:00-10:00' })).toHaveLength(7)
    expect(within(week).getByRole('link', { name: 'Tạo Tour Ca sáng ngày 06/01/2099' })).toHaveAttribute('href', '/staff/manage/tours/new?date=2099-01-06&shift=S1')
    expect(within(week).getByRole('region', { name: 'Ngoài ca ngày 06/01/2099' })).toBeInTheDocument()
  })

  it('reports a failed shifts load instead of a table with no rows', async () => {
    shiftStatus = 503
    show()
    expect(await screen.findByRole('button', { name: /Thử lại/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows one calendar representation at a time', async () => {
    show()
    expect(await screen.findByRole('region', { name: 'Lịch tuần' })).toBeInTheDocument()
    expect(screen.getAllByRole('table')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ngày' }))
    expect(await screen.findAllByRole('article')).toHaveLength(2)
    expect(screen.queryByRole('region', { name: 'Lịch tuần' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
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
