import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { campusDateKey } from '../../components/ui/date-time'
import { dayStart } from '../../features/administration/tours/tour-calendar'
import { addCampusDays } from '../../features/staff/operations/hooks'
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
let today: object[] = [READY_TOUR]
let upcoming: object[] = []
let upcomingTotal: number | undefined
let routeDetail: object | null = null
let emailRequests: object[] = []
const page = (data: object[], total = data.length) => new Response(JSON.stringify({ success: true, data, pagination: { page: 1, pageSize: 20, totalItems: total, totalPages: 1 } }), { status: 200 })

beforeEach(() => {
  running = []
  today = [READY_TOUR]
  upcoming = []
  upcomingTotal = undefined
  routeDetail = null
  emailRequests = []
  useAuthStore.getState().setAuth('test-token', { userId: 'staff-1', username: 'lan', role: 'Staff' })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/staff/manage/registrations') return page([], 4)
    if (url.pathname === '/api/staff/manage/roster-email-change-requests') return page(emailRequests)
    if (url.pathname === '/api/staff/manage/registrations/registration-9') return new Response('{}', { status: 500 })
    if (url.pathname.startsWith('/api/staff/manage/tours/')) {
      return routeDetail ? Response.json({ success: true, data: routeDetail }) : new Response('{}', { status: 404 })
    }
    if (url.pathname !== '/api/staff/manage/tours') return page([])
    if (url.searchParams.get('phase') === 'RUNNING') return page(running)
    if (url.searchParams.get('state') === 'SCHEDULED') {
      // The queue asks for each row's READY blockers.
      expect(url.searchParams.get('readyBlockers')).toBe('true')
      return page([tourRow('tour-sch', 'Tour thứ Hai', 'SCHEDULED', { readyBlockers: [
        { code: 'PENDING_DECISIONS', message: 'Còn dòng đăng ký đang chờ Staff duyệt.' }, { code: 'RESERVATION_MISSING', message: 'Tour chưa giữ robot.' }] })], 2)
    }
    // Today is the only list read with from/to and size 100.
    if (url.searchParams.get('from') && url.searchParams.get('size') === '100') return page(today)
    if (url.searchParams.get('from')) return page(upcoming, upcomingTotal)
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
    expect(screen.queryByLabelText('Tóm tắt hôm nay')).not.toBeInTheDocument()
  })

  it('shows route stops in order, without treating skipped stops as arrivals', async () => {
    running = [ASSIST_TOUR]
    routeDetail = {
      tour: ASSIST_TOUR,
      routeRevision: { stops: [
        { id: 's4', stopOrder: 4, name: 'Khu thực hành' },
        { id: 's1', stopOrder: 1, name: 'Sảnh chính' },
        { id: 's2', stopOrder: 2, name: 'Hội trường' },
        { id: 's3', stopOrder: 3, name: 'Thư viện' },
      ] },
      execution: { currentStep: 'NAVIGATING', currentRevisionStopId: 'S3', lastArrivedRevisionStopId: 's2' },
    }
    show()
    const diagram = await screen.findByRole('region', { name: 'Sơ đồ tuyến theo thứ tự điểm dừng' })
    const stops = within(diagram).getAllByRole('listitem')
    expect(stops).toHaveLength(4)
    expect(stops[0]).toHaveTextContent('Sảnh chính')
    expect(stops[0]).not.toHaveTextContent('Đã đến')
    expect(stops[1]).toHaveTextContent('Hội trườngĐã đến')
    expect(stops[2]).toHaveAttribute('aria-current', 'step')
    expect(stops[2]).toHaveTextContent('Thư việnĐiểm đích hiện tại')
    expect(stops[3]).toHaveTextContent('Khu thực hànhĐiểm kế tiếp')
  })

  it('counts only the seven shown campus days and honors the operator filter', async () => {
    const day = campusDateKey(Date.now())
    const mine = { userId: 'staff-1', fullName: 'Lan', username: 'lan' }
    today = [{ ...READY_TOUR, scheduledStartAt: dayStart(day), operator: mine }]
    upcoming = [
      tourRow('future-2', 'Tour của Minh', 'SCHEDULED', { scheduledStartAt: dayStart(addCampusDays(day, 2)) }),
      tourRow('future-7', 'Ngoài biểu đồ', 'SCHEDULED', { scheduledStartAt: dayStart(addCampusDays(day, 7)), operator: mine }),
    ]
    show()
    const chart = screen.getByRole('region', { name: 'Lịch Tour 7 ngày' })
    expect(await within(chart).findByText('2 Tour theo ngày bắt đầu')).toBeInTheDocument()
    expect(within(chart).getAllByRole('listitem')).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: /Chỉ Tour tôi vận hành/ }))
    expect(within(chart).getByText('1 Tour theo ngày bắt đầu')).toBeInTheDocument()
  })

  it('does not pass off a partial result as the full schedule', async () => {
    upcomingTotal = 21
    show()
    const chart = screen.getByRole('region', { name: 'Lịch Tour 7 ngày' })
    expect(await within(chart).findByText(/Dữ liệu trải trên nhiều trang/)).toBeInTheDocument()
    expect(within(chart).queryByText(/Tour theo ngày bắt đầu/)).not.toBeInTheDocument()
  })

  it('without a running Tour, names the next one and keeps the queue open beside today', async () => {
    show()
    expect(await screen.findByText(/Không có Tour nào đang chạy\. Tour kế tiếp hôm nay: Tour chiều lúc/)).toBeInTheDocument()
    const queue = screen.getByRole('region', { name: 'Hàng chờ chuẩn bị' })
    expect(await within(within(queue).getByRole('group', { name: 'Đăng ký chờ duyệt' })).findByText('4')).toBeInTheDocument()
    // Why the Tour cannot be marked READY yet, in the server's words.
    expect(await within(queue).findByText('Còn dòng đăng ký đang chờ Staff duyệt. (và 1 điều kiện khác)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tạo Tour/ })).toHaveAttribute('href', '/staff/manage/tours/new')
  })

  it('queues the email-change requests Staff can still decide, and opens the registration of one', async () => {
    const future = new Date(Date.now() + 5 * 3600_000).toISOString()
    const request = { id: 'change-1', registrationId: 'registration-9', rowNumber: 3, currentEmail: 'cu@example.test', proposedEmail: 'moi@example.test', createdAt: '2026-11-01T02:00:00Z', expiresAt: future, canReview: true }
    emailRequests = [request, { ...request, id: 'change-locked', rowNumber: 7, registrationId: 'registration-locked', canReview: false }]
    show()
    const section = await within(screen.getByRole('region', { name: 'Hàng chờ chuẩn bị' })).findByRole('group', { name: 'Yêu cầu đổi email chờ duyệt' })
    expect(await within(section).findByText('Dòng 3: cu@example.test sang moi@example.test')).toBeInTheDocument()
    expect(within(section).getByText('1')).toBeInTheDocument()
    expect(within(section).queryByText(/Dòng 7/)).not.toBeInTheDocument()
    expect(within(section).getByText(/Hết hạn lúc/)).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Xem & duyệt yêu cầu đổi email dòng 3' }))
    expect(await screen.findByText('Không tải được đăng ký này.')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith('/api/staff/manage/registrations/registration-9'))).toBe(true)
  })

  it('narrows the lists to my Tours on request, but never hides an alert', async () => {
    running = [{ ...ASSIST_TOUR, operator: { userId: 'staff-2', fullName: 'Minh', username: 'minh' } }]
    today = [{ ...READY_TOUR, operator: { userId: 'staff-1', fullName: 'Lan', username: 'lan' } },
      tourRow('tour-other', 'Tour của Minh', 'SCHEDULED', { operator: { userId: 'staff-2', fullName: 'Minh', username: 'minh' } })]
    show()
    const table = await screen.findByRole('table', { name: 'Tour hôm nay' })
    expect(within(table).getByText('Tour của Minh')).toBeInTheDocument()
    expect(within(table).getByText(/Bạn vận hành/)).toBeInTheDocument()
    expect(await screen.findByText(/Vận hành: Minh/, { selector: '[role=alert] *' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Chỉ Tour tôi vận hành/ }))
    expect(screen.getByRole('button', { name: /Chỉ Tour tôi vận hành/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('table', { name: 'Tour hôm nay' })).queryByText('Tour của Minh')).not.toBeInTheDocument()
    expect(screen.getByText(/Bạn không vận hành Tour nào đang chạy/)).toBeInTheDocument()
    // Someone else's Tour still raises its alert for everyone.
    expect(screen.getByText(/Tour cần giúp cần hỗ trợ/)).toBeInTheDocument()
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

  it('keeps the dashboard and previews the upcoming route when there is no Tour today', async () => {
    today = []
    const date = addCampusDays(campusDateKey(Date.now()), 1)
    const upcomingTour = tourRow('upcoming', 'Tour ngày mai', 'READY', { scheduledStartAt: dayStart(date) })
    upcoming = [upcomingTour]
    routeDetail = {
      tour: upcomingTour,
      routeRevision: { stops: [{ id: 's1', stopOrder: 1, name: 'Sảnh chính' }, { id: 's2', stopOrder: 2, name: 'Thư viện' }] },
    }
    show()
    const line = await screen.findByText(/^Không có Tour nào đang chạy\. Hôm nay không có Tour nào\. Dữ liệu Tour đọc lúc \d{2}:\d{2}, tự cập nhật\./)
    expect(line).toHaveAttribute('role', 'status')
    const summary = screen.getByLabelText('Tóm tắt hôm nay')
    expect(within(summary).getAllByText('0')).toHaveLength(3)
    const planned = screen.getByRole('region', { name: 'Tuyến Tour dự kiến' })
    const diagram = await within(planned).findByRole('region', { name: 'Sơ đồ tuyến theo thứ tự điểm dừng' })
    expect(within(diagram).getAllByRole('listitem')).toHaveLength(2)
    expect(diagram.querySelector('[aria-current]')).toBeNull()
    expect(within(planned).getByRole('link', { name: 'Xem chi tiết Tour' })).toHaveAttribute('href', '/staff/manage/tours/upcoming')
    const chart = screen.getByRole('region', { name: 'Lịch Tour 7 ngày' })
    expect(within(chart).getByText('1 Tour theo ngày bắt đầu')).toBeInTheDocument()
    const schedule = screen.getByRole('region', { name: 'Tour sắp tới' })
    expect(chart.compareDocumentPosition(schedule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Tour hôm nay' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/Hôm nay không có Tour nào/)).toHaveLength(1)
  })

  it('still shows the route section and charts when the upcoming schedule is empty too', async () => {
    today = []
    show()
    const planned = await screen.findByRole('region', { name: 'Tuyến Tour dự kiến' })
    expect(await within(planned).findByText('Sơ đồ sẽ hiển thị khi có Tour trong lịch sắp tới.')).toBeInTheDocument()
    expect(await within(screen.getByRole('region', { name: 'Lịch Tour 7 ngày' })).findByText('0 Tour theo ngày bắt đầu')).toBeInTheDocument()
  })

  it('links each Tour name to its Tour page', async () => {
    show()
    const table = await screen.findByRole('table', { name: 'Tour hôm nay' })
    expect(within(table).getByRole('link', { name: 'Tour chiều' })).toHaveAttribute('href', '/staff/manage/tours/tour-ready')
  })

  it('folds a queue with nothing in it to one line', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.searchParams.get('from') && url.searchParams.get('size') === '100') return page(today)
      return page([])
    })
    show()
    const queue = screen.getByRole('region', { name: 'Hàng chờ chuẩn bị' })
    expect(await within(queue).findByText('Không có việc chờ.')).toBeInTheDocument()
    expect(within(queue).queryByRole('group')).not.toBeInTheDocument()
  })
})
