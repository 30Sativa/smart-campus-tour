import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { PagedApiResponse } from '../../api/contracts/shared'
import { useAuthStore } from '../../stores/auth-store'
import RepDashboardPage from '../../routes/representative/RepDashboardPage'
import RepTourDetailPage from '../../routes/representative/RepTourDetailPage'
import type { RegistrationSummary, RepresentativeTour } from './api/types'
import { representativeApi } from './api/representative-api'
import { loadActiveRegistrations, nextUpcomingRegistration } from './upcoming-registrations'

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
function registration(id = 'registered', days = 5, changes: Partial<RegistrationSummary> = {}): RegistrationSummary {
  return { id, tourId: 'tour', tourName: `Buổi ${id}`, tourScheduledStartAt: future(days), tourState: 'SCHEDULED',
    schoolName: 'Trường thật', groupName: `Đoàn ${id}`, state: 'SUBMITTED', rowCount: 1, submittedAt: future(-10), updatedAt: future(-1), ...changes }
}
function paged<T>(data: T[], totalItems = data.length, page = 1, totalPages = 1): PagedApiResponse<T> {
  return { success: true, message: null, errors: null, data, pagination: { page, pageSize: 100, totalItems, totalPages } }
}
function tour(): RepresentativeTour {
  return { id: 'tour', name: 'Buổi từ máy chủ', description: 'Thông tin buổi tham quan.', scheduledStartAt: future(7), state: 'SCHEDULED',
    rowVersion: 'version', routeName: 'Tuyến từ máy chủ', stops: [{ order: 2, name: 'Điểm thứ hai', description: null }, { order: 1, name: 'Điểm đầu tiên', description: null }],
    register: { allowed: true, reason: null } }
}
const clients: QueryClient[] = []
function renderPage(path = '/dai-dien/buoi/tour') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchInterval: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/dai-dien" element={<RepDashboardPage />} />
    <Route path="/dai-dien/buoi/:tourId" element={<RepTourDetailPage />} />
  </Routes></MemoryRouter></QueryClientProvider>)
  return client
}
beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', { userId: 'catalog-owner', username: 'representative', role: 'Representative' })
  vi.spyOn(representativeApi, 'tour').mockImplementation(async () => tour())
  vi.spyOn(representativeApi, 'tours').mockImplementation(async () => paged([tour()], 42))
})
afterEach(() => {
  onlineManager.setOnline(true)
  clients.forEach(client => client.clear())
  clients.length = 0
  useAuthStore.getState().logout()
  vi.restoreAllMocks()
})

describe('upcoming Representative registrations', () => {
  it('loads every active page before choosing the nearest future registration', async () => {
    const recent = registration('recent', 10)
    const nearer = registration('older-update', 2, { tourState: 'READY' })
    const expired = registration('past', -2)
    const api = vi.spyOn(representativeApi, 'registrations')
      .mockResolvedValueOnce(paged([recent, expired], 3, 1, 2))
      .mockResolvedValueOnce(paged([nearer], 3, 2, 2))
    const signal = new AbortController().signal
    expect(nextUpcomingRegistration(await loadActiveRegistrations(signal))?.id).toBe('older-update')
    expect(api).toHaveBeenNthCalledWith(1, { group: 'active', page: 1, size: 100, sort: '-updatedAt' }, signal)
    expect(api).toHaveBeenNthCalledWith(2, { group: 'active', page: 2, size: 100, sort: '-updatedAt' }, signal)
  })
  it('excludes past, running, completed, cancelled and refused records', () => {
    expect(nextUpcomingRegistration([
      registration('past', -1), registration('running', 1, { tourState: 'RUNNING' }),
      registration('finished', 2, { tourState: 'COMPLETED' }), registration('cancelled-tour', 3, { tourState: 'CANCELLED' }),
      registration('cancelled', 4, { state: 'CANCELLED' }), registration('refused', 5, { state: 'REJECTED' }),
    ])).toBeNull()
  })
  it('does not return partial coverage when a later page fails', async () => {
    vi.spyOn(representativeApi, 'registrations').mockResolvedValueOnce(paged([registration()], 2, 1, 2))
      .mockRejectedValueOnce(new Error('Later page failed'))
    await expect(loadActiveRegistrations()).rejects.toThrow('Later page failed')
  })
})

describe('Representative Tour detail ownership', () => {
  it('opens the existing registration instead of offering a second one', async () => {
    vi.spyOn(representativeApi, 'registrations').mockResolvedValue(paged([registration()]))
    renderPage()
    expect(await screen.findByRole('link', { name: 'Xem đăng ký' })).toHaveAttribute('href', '/dai-dien/dang-ky/registered')
    expect(screen.queryByRole('link', { name: 'Đăng ký đoàn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đăng ký đoàn' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map(stop => stop.textContent)).toEqual(['01Điểm đầu tiên', '02Điểm thứ hai'])
  })
  it('offers registration only after successfully confirming an empty result', async () => {
    vi.spyOn(representativeApi, 'registrations').mockResolvedValue(paged([]))
    renderPage()
    expect(await screen.findByRole('link', { name: 'Đăng ký đoàn' })).toHaveAttribute('href', '/dai-dien/buoi/tour/dang-ky')
  })
  it('does not interpret a pending ownership check as no registration', async () => {
    vi.spyOn(representativeApi, 'registrations').mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(await screen.findByText('Đang kiểm tra đăng ký của bạn…')).toBeInTheDocument()
    expect(screen.queryByText('Bạn chưa đăng ký buổi tham quan này.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đăng ký đoàn' })).not.toBeInTheDocument()
  })
  it('blocks new registration and exposes retry if ownership cannot be checked', async () => {
    vi.spyOn(representativeApi, 'registrations').mockRejectedValue(new Error('Unavailable'))
    renderPage()
    expect(await screen.findByText('Không kiểm tra được đăng ký')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    expect(screen.queryByText('Bạn chưa đăng ký buổi tham quan này.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đăng ký đoàn' })).not.toBeInTheDocument()
  })
  it('retains the server refusal for a Tour that does not allow registration', async () => {
    vi.mocked(representativeApi.tour).mockResolvedValue({ ...tour(), register: { allowed: false, reason: 'Buổi đã chốt đăng ký.' } })
    vi.spyOn(representativeApi, 'registrations').mockResolvedValue(paged([]))
    renderPage()
    expect(await screen.findByRole('button', { name: 'Đăng ký đoàn' })).toBeDisabled()
    expect(screen.getByText('Buổi đã chốt đăng ký.')).toBeInTheDocument()
  })
})

describe('Representative overview state', () => {
  it('keeps an empty overview useful with catalog and activity navigation', async () => {
    vi.spyOn(representativeApi, 'registrations').mockResolvedValue(paged([]))
    vi.mocked(representativeApi.tours).mockResolvedValue(paged([]))
    renderPage('/dai-dien')
    expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument()
    expect(screen.getByText('Bạn chưa có đăng ký nào')).toBeInTheDocument()
    expect(screen.getByText('Chưa có buổi nhận đăng ký')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem buổi tham quan' })).toHaveAttribute('href', '/dai-dien/buoi')
    expect(screen.getByRole('link', { name: 'Đăng ký của tôi' })).toHaveAttribute('href', '/dai-dien/dang-ky')
    expect(screen.getByRole('link', { name: 'Xem tất cả buổi' })).toHaveAttribute('href', '/dai-dien/buoi')
  })
  it('shows server totals and the nearest visit beyond the recent list in the owner cache', async () => {
    vi.spyOn(representativeApi, 'registrations').mockImplementation(async parameters => {
      if (parameters.group === 'active') return parameters.page === 1
        ? paged([registration('recent', 10)], 2, 1, 2) : paged([registration('nearest', 1)], 2, 2, 2)
      return paged([registration('recent', 10)], 25)
    })
    const client = renderPage('/dai-dien')
    expect(await screen.findByRole('link', { name: 'Xem đăng ký sắp tới' })).toHaveAttribute('href', '/dai-dien/dang-ky/nearest')
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getAllByText('25')).toHaveLength(2)
    await waitFor(() => expect(client.getQueryData(['representative', 'catalog-owner', 'upcoming-registrations'])).toHaveLength(2))
  })
  it('does not claim an empty upcoming list while its complete query is pending', async () => {
    vi.spyOn(representativeApi, 'registrations').mockImplementation(parameters => parameters.group === 'active'
      ? new Promise(() => {}) : Promise.resolve(paged([], 25)))
    renderPage('/dai-dien')
    expect(await screen.findByText('Đang kiểm tra lịch tham quan của bạn…')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có đăng ký chờ duyệt hoặc đã duyệt cho một buổi tham quan sắp tới.')).not.toBeInTheDocument()
  })
  it('shows incomplete coverage as an error while preserving actual server totals', async () => {
    vi.spyOn(representativeApi, 'registrations').mockImplementation(async parameters => {
      if (parameters.group === 'active') {
        if (parameters.page === 2) throw new Error('Later page failed')
        return paged([registration()], 2, 1, 2)
      }
      return paged([], 25)
    })
    renderPage('/dai-dien')
    expect(await screen.findByText('Chưa xác định được buổi sắp tới')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.queryByText('Chưa có đăng ký chờ duyệt hoặc đã duyệt cho một buổi tham quan sắp tới.')).not.toBeInTheDocument()
  })
  it('does not fabricate zero totals after a summary load failure', async () => {
    vi.spyOn(representativeApi, 'registrations').mockResolvedValue(paged([]))
    vi.mocked(representativeApi.tours).mockRejectedValue(new Error('Unavailable'))
    renderPage('/dai-dien')
    expect(await screen.findByText('Không tải được tổng quan')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
  it('shows a failed source instead of waiting forever for another source', async () => {
    vi.spyOn(representativeApi, 'registrations').mockImplementation(() => new Promise(() => {}))
    vi.mocked(representativeApi.tours).mockRejectedValue(new Error('Unavailable'))
    renderPage('/dai-dien')
    expect(await screen.findByText('Không tải được tổng quan')).toBeInTheDocument()
  })
  it('attempts real reads even when browser connectivity detection is stale', async () => {
    onlineManager.setOnline(false)
    vi.spyOn(representativeApi, 'registrations').mockResolvedValue(paged([]))
    renderPage('/dai-dien')
    expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument()
    expect(representativeApi.tours).toHaveBeenCalled()
    expect(representativeApi.registrations).toHaveBeenCalled()
  })
})
