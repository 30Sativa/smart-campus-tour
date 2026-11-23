import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TourNarrationPanel } from './TourNarrationPanel'
import type { TourDetails, TourNarrationStatus } from './types'

function detail(state: TourDetails['tour']['state'] = 'SCHEDULED'): TourDetails {
  return {
    tour: { id: 'tour-1', name: 'Tour sáng', state, rowVersion: 'AAAAAAAAB9E=' },
    routeRevision: { routeId: 'route-1', revisionId: 'rev-1', stops: [] },
  } as unknown as TourDetails
}

const stale: TourNarrationStatus = {
  tourId: 'tour-1', routeRevisionId: 'rev-1', routeRevisionNumber: 3, canRefresh: true, blockedCode: null, blockedReason: null,
  stops: [
    { stopId: 's1', stopOrder: 1, name: 'B', currentText: 'Lời cũ của B.', approvedText: 'Lời mới của B.', approvedRevisionNumber: 2, hasNewer: true },
    { stopId: 's2', stopOrder: 2, name: 'E', currentText: 'Lời của E.', approvedText: 'Lời của E.', approvedRevisionNumber: 1, hasNewer: false },
  ],
}

let status: TourNarrationStatus
let refreshed: { requestId: string; expectedRowVersion: string } | null
let refreshAnswer: Response | null

beforeEach(() => {
  status = stale
  refreshed = null
  refreshAnswer = null
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/narration/refresh')) {
      refreshed = JSON.parse(String(init?.body))
      return refreshAnswer ?? new Response(JSON.stringify({ success: true, data: { id: 'tour-1', routeRevisionId: 'rev-2', routeRevisionNumber: 4, updatedStops: ['B'] } }), { status: 200 })
    }
    if (url.endsWith('/narration')) return new Response(JSON.stringify({ success: true, data: status }), { status: 200 })
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

function mount(state?: TourDetails['tour']['state']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><TourNarrationPanel detail={detail(state)} /></QueryClientProvider>)
}

it('names the stops with newer approved narration and shows both texts', async () => {
  mount()
  expect(await screen.findByText(/1 điểm dừng có lời thuyết minh mới đã duyệt mà Tour chưa dùng: B\./)).toBeInTheDocument()
  expect(screen.getByText('Lời cũ của B.')).toBeInTheDocument()
  expect(screen.getByText('Lời mới của B.')).toBeInTheDocument()
  expect(screen.queryByText('Lời của E.')).toBeNull()
})

it('refreshes after confirmation with the Tour row version', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật lời thuyết minh mới' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cập nhật' }))
  await waitFor(() => expect(refreshed?.expectedRowVersion).toBe('AAAAAAAAB9E='))
  expect(refreshed?.requestId).toMatch(/^[0-9a-f-]{36}$/)
})

it('keeps the server sentence when the route path changed and offers no button', async () => {
  status = { ...stale, canRefresh: false, blockedCode: 'TOUR_ROUTE_CHANGED', blockedReason: 'Tuyến đã có bản mới đổi điểm dừng.' }
  mount()
  expect(await screen.findByText(/Tuyến đã có bản mới đổi điểm dừng\./)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cập nhật lời thuyết minh mới' })).toBeNull()
})

it('shows a refusal of the refresh in the dialog', async () => {
  refreshAnswer = new Response(JSON.stringify({ success: false, message: 'POI B không còn kết quả đạt.', errors: { code: 'POI_VERIFICATION_STALE' } }), { status: 409 })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Cập nhật lời thuyết minh mới' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cập nhật' }))
  expect(await screen.findByText('POI B không còn kết quả đạt.')).toBeInTheDocument()
})

it('says the Tour is up to date when no stop has newer narration', async () => {
  status = { ...stale, canRefresh: false, blockedCode: 'TOUR_NARRATION_UP_TO_DATE', blockedReason: 'x', stops: stale.stops.map(s => ({ ...s, hasNewer: false })) }
  mount()
  expect(await screen.findByText('Tour đang dùng lời thuyết minh đã duyệt mới nhất của mọi điểm dừng.')).toBeInTheDocument()
})

it('is not shown once the Tour has started', () => {
  const { container } = mount('RUNNING')
  expect(container).toBeEmptyDOMElement()
})

it('stays quiet on an answer without a stop list, as from an older server', async () => {
  status = [] as unknown as TourNarrationStatus
  mount()
  expect(await screen.findByRole('region', { name: 'Lời thuyết minh của Tour' })).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByText('Đang kiểm tra lời thuyết minh…')).toBeNull())
  expect(screen.queryByRole('button', { name: 'Cập nhật lời thuyết minh mới' })).toBeNull()
})
