import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAFF_NAV } from '../../features/staff/staff-nav'
import { suggestions } from '../../features/staff/engagement/engagement-labels'
import type { EngagementOverview, PoiEngagement, TourEngagement } from '../../features/staff/engagement/engagement-api'
import EngagementPage from './EngagementPage'
import TourEngagementPage from './TourEngagementPage'

const audience = [
  { rowType: 'SHARED_VIEWING', acceptedRows: 1, joinedRows: 1, votedRows: 0, questions: 0 },
  { rowType: 'INDIVIDUAL', acceptedRows: 8, joinedRows: 6, votedRows: 3, questions: 9 },
]
const poi = (name: string, signals: PoiEngagement['signals'], extra: Partial<PoiEngagement> = {}): PoiEngagement => ({
  poiId: `p-${name}`, name, tours: 2, visits: 2, skips: 0, questions: 4, questionsPerVisit: 2, averageDwellSeconds: 300,
  averagePlannedDwellSeconds: 120, votesReceived: 1, viewersLeft: 0, signals, ...extra,
})

const OVERVIEW: EngagementOverview = {
  from: '2026-10-26T00:00:00Z', to: '2026-11-25T00:00:00Z', tourCount: 2, joinRate: 0.778, questionsPerTour: 4.5,
  audience, questions: { total: 9, waitingRoom: 2, duringTour: 7, atStops: 6, outOfScope: 1 },
  pois: [poi('Phòng Lab', ['MOST_QUESTIONS', 'OVER_DWELL']), poi('Hội trường', ['SKIPPED'], { visits: 0, skips: 2, questions: 0, questionsPerVisit: 0 })],
  tours: [{ tourId: 't-1', name: 'Tour sáng', state: 'COMPLETED', startedAt: '2026-11-20T02:00:00Z', routeName: 'Tuyến A',
    acceptedRows: 5, joinedRows: 4, questions: 6, viewersLeft: 1 }],
  truncated: false,
}

const TOUR: TourEngagement = {
  tourId: 't-1', name: 'Tour sáng', state: 'COMPLETED', scheduledStartAt: '2026-11-20T02:00:00Z', startedAt: '2026-11-20T02:00:00Z',
  endedAt: '2026-11-20T02:30:00Z', routeName: 'Tuyến A', audience,
  questions: { total: 6, waitingRoom: 1, duringTour: 5, atStops: 4, outOfScope: 0 }, viewersLeftDuringTour: 1,
  stops: [
    { stopId: 's-1', poiId: 'p-1', name: 'Thư viện', plannedOrder: 1, visitOrder: 1, outcome: 'VISITED', arrivedAt: '2026-11-20T02:05:00Z',
      actualDwellSeconds: 300, plannedDwellSeconds: 120, questions: 3, ballotVoters: 4, votesReceived: 0, viewersLeft: 1, signals: ['MOST_QUESTIONS', 'OVER_DWELL'] },
    { stopId: 's-2', poiId: 'p-2', name: 'Hội trường', plannedOrder: 2, visitOrder: null, outcome: 'SKIPPED', arrivedAt: null,
      actualDwellSeconds: null, plannedDwellSeconds: 60, questions: 0, ballotVoters: 0, votesReceived: 2, viewersLeft: 0, signals: ['SKIPPED'] },
  ],
}

const requests: URL[] = []
function stub(overview: EngagementOverview | null = OVERVIEW, status = 200) {
  requests.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    requests.push(url)
    if (status !== 200) return new Response(JSON.stringify({ success: false, message: 'down' }), { status })
    const data = url.pathname === '/api/staff/engagement' ? overview : TOUR
    return new Response(JSON.stringify({ success: true, message: 'OK', data }), { status: 200 })
  }))
}

const show = (path = '/staff/engagement') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/staff/engagement" element={<EngagementPage />} />
        <Route path="/staff/engagement/:tourId" element={<TourEngagementPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>)

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Engagement report', () => {
  it('is in the Staff menu under its page title', () => {
    expect(STAFF_NAV.find(item => item.path === '/staff/engagement')?.label).toBe('Phân tích tương tác')
  })

  it('shows participation by invitation type, POIs and suggestions, without naming viewers', async () => {
    stub()
    show()
    expect(await screen.findByRole('heading', { name: 'Phân tích tương tác' })).toBeInTheDocument()
    const kpis = await screen.findByRole('region', { name: 'Tổng hợp tương tác' })
    expect(within(kpis).getByText('78%')).toBeInTheDocument()
    expect(within(kpis).getByText('4,5')).toBeInTheDocument()

    const who = screen.getByRole('table', { name: 'Tham gia theo loại lời mời' })
    const rows = within(who).getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getByRole('rowheader').textContent)).toEqual(['Lời mời cá nhân', 'Phòng xem chung'])
    expect(within(rows[0]).getByText('(75%)')).toBeInTheDocument()

    const tips = screen.getByRole('region', { name: 'Gợi ý cải thiện tuyến' })
    expect(within(tips).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('Hội trường'), expect.stringContaining('Phòng Lab'), expect.stringContaining('Phòng Lab'),
    ])
    expect(screen.getByRole('link', { name: 'Tour sáng' })).toHaveAttribute('href', '/staff/engagement/t-1')
    expect(screen.getByText(/nội dung không được lưu/)).toBeInTheDocument()
  })

  it('asks for a new period when Staff picks one', async () => {
    stub()
    show()
    await screen.findByRole('region', { name: 'Tổng hợp tương tác' })
    const first = requests[0].searchParams
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }))
    await waitFor(() => expect(requests.length).toBe(2))
    const second = requests[1].searchParams
    const days = (params: URLSearchParams) => (Date.parse(params.get('to')!) - Date.parse(params.get('from')!)) / 86_400_000
    expect(Math.round(days(first))).toBe(30)
    expect(Math.round(days(second))).toBe(7)
  })

  it('says so when no Tour ended in the period, and offers a retry on error', async () => {
    stub({ ...OVERVIEW, tourCount: 0, pois: [], tours: [] })
    show()
    expect(await screen.findByText('Chưa có buổi nào kết thúc trong khoảng này.')).toBeInTheDocument()
    cleanup()
    stub(null, 500)
    show()
    expect(await screen.findByRole('button', { name: /Thử lại/ })).toBeInTheDocument()
  })

  it('shows one Tour stop by stop', async () => {
    stub()
    show('/staff/engagement/t-1')
    expect(await screen.findByRole('heading', { name: 'Tour sáng' })).toBeInTheDocument()
    expect(requests[0].pathname).toBe('/api/staff/manage/tours/t-1/engagement')
    const table = screen.getByRole('table', { name: 'Tương tác theo điểm dừng' })
    const [library, hall] = within(table).getAllByRole('row').slice(1)
    expect(within(library).getByText('Được hỏi nhiều nhất')).toBeInTheDocument()
    expect(within(library).getByText('Dừng lâu hơn kế hoạch')).toBeInTheDocument()
    expect(within(library).getByText('5 phút')).toBeInTheDocument()
    expect(within(hall).getByText('Đã bỏ qua')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Phân tích tương tác/ })).toHaveAttribute('href', '/staff/engagement')
  })
})

describe('engagement suggestions', () => {
  it('puts departures and skips before questions, one per POI and signal', () => {
    const items = suggestions([poi('B', ['MOST_QUESTIONS']), poi('A', ['MOST_LEFT', 'MOST_VOTED']), poi('C', ['SKIPPED'])])
    expect(items.map(item => `${item.poi}:${item.signal}`)).toEqual(['A:MOST_LEFT', 'C:SKIPPED', 'B:MOST_QUESTIONS', 'A:MOST_VOTED'])
  })
})
