import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewPage from './OverviewPage'
import { mockStaffApi } from '../../mocks/staff-mock'
import { resetSim, tourById, tourView } from '../../mocks/staff-sim'
import { useAuthStore } from '../../stores/auth-store'
import type { TourOperation } from '../../api/contracts/staff'
import { overviewDays } from '../../features/staff/overview-dashboard'

const clients: QueryClient[] = []
let today: TourOperation[]
let yesterday: TourOperation[]

function Location() {
  const location = useLocation()
  return <output aria-label="Địa chỉ trang">{location.pathname}{location.search}</output>
}

function show(path = '/staff') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><OverviewPage /><Location /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 1, 12))
  resetSim()
  useAuthStore.getState().setAuth('test-token', { userId: 'overview-staff', username: 'staff', role: 'Staff' })
  const running = tourView(tourById('tour-01')!)
  today = [running, tourView(tourById('tour-02')!), tourView(tourById('tour-03')!),
    { ...running, id: 'completed', code: 'T-99', name: 'Buổi đã hoàn thành', state: 'Completed' }]
  yesterday = [{ ...running, id: 'history', code: 'H-01', name: 'Buổi ngày trước', state: 'Completed', scheduledAt: new Date(2026, 8, 30, 9).toISOString() }]
  vi.spyOn(mockStaffApi, 'tours').mockImplementation(async (filters = {}) => filters.history || filters.date === '2026-09-30' ? yesterday : today)
  vi.spyOn(mockStaffApi, 'amrs').mockResolvedValue([])
})

afterEach(() => {
  clients.splice(0).forEach(client => client.clear())
  useAuthStore.getState().logout()
  resetSim()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('operations analytical overview', () => {
  it('filters the same list from KPI buttons and the ring, retaining the existing operation links', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Buổi tổng quan' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(within(list).getByRole('link', { name: 'Điều hành T-01' })).toHaveAttribute('href', '/staff/live/tour-01')
    expect(within(list).getByRole('link', { name: 'Kiểm tra & bắt đầu T-02' })).toHaveAttribute('href', '/staff/tours/tour-02/start')
    fireEvent.click(within(screen.getByRole('region', { name: 'Tình hình trong ngày' })).getByRole('button', { name: /Đang chạy/ }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Địa chỉ trang' })).toHaveTextContent('view=Running')
    fireEvent.click(screen.getByRole('button', { name: 'Lọc Sẵn sàng: 1 buổi' }))
    expect(within(list).getByRole('link', { name: 'Kiểm tra & bắt đầu T-02' })).toBeInTheDocument()
    expect(within(list).queryByRole('link', { name: 'Điều hành T-01' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lọc Sẵn sàng: 1 buổi' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
  })

  it('selects a historical day from the line chart, clears stale filters and updates the schedule link', async () => {
    show('/staff?view=Ready&q=T-02')
    fireEvent.click(await screen.findByRole('button', { name: 'Xem ngày 30/09' }))
    const list = await screen.findByRole('list', { name: 'Buổi tổng quan' })
    expect(await within(list).findByRole('button', { name: 'Buổi ngày trước, H-01' })).toBeInTheDocument()
    expect(screen.getByLabelText('Chọn ngày tổng quan')).toHaveValue('2026-09-30')
    expect(screen.getByRole('searchbox', { name: 'Tìm buổi tổng quan' })).toHaveValue('')
    expect(screen.getByRole('status', { name: 'Địa chỉ trang' })).toHaveTextContent('date=2026-09-30')
    expect(screen.getByRole('status', { name: 'Địa chỉ trang' })).not.toHaveTextContent('view=')
    expect(screen.getByRole('link', { name: 'Xem lịch' })).toHaveAttribute('href', '/staff/schedule?date=2026-09-30')
  })

  it('explains empty search results and restores the list when filters are cleared', async () => {
    show()
    await screen.findByRole('list', { name: 'Buổi tổng quan' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm buổi tổng quan' }), { target: { value: 'không tồn tại' } })
    expect(screen.getByText('Không có buổi khớp bộ lọc.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }))
    expect(within(screen.getByRole('list', { name: 'Buổi tổng quan' })).getAllByRole('listitem')).toHaveLength(4)
  })

  it('opens the existing inspector and closes with Escape without putting Start on the dashboard', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Buổi tổng quan' })
    const opener = within(list).getByRole('button', { name: /T-01$/ })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Chi tiết buổi' })
    expect(within(dialog).getByRole('link', { name: 'Điều hành' })).toHaveAttribute('href', '/staff/live/tour-01')
    expect(screen.queryByRole('button', { name: /Bắt đầu/ })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('keeps the daily list usable when history fails instead of drawing a false zero trend', async () => {
    vi.mocked(mockStaffApi.tours).mockImplementation(async (filters = {}) => {
      if (filters.history) throw new Error('History unavailable')
      return today
    })
    show()
    expect(await screen.findByRole('list', { name: 'Buổi tổng quan' })).toBeInTheDocument()
    expect(await within(screen.getByRole('region', { name: 'Buổi hoàn thành trong bảy ngày' })).findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Chọn ngày từ biểu đồ' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Trạng thái 4 buổi/ })).toBeInTheDocument()
  })

  it('keeps failed totals unknown and does not render a misleading empty state', async () => {
    vi.mocked(mockStaffApi.tours).mockRejectedValue(new Error('Unavailable'))
    show()
    await within(screen.getByRole('region', { name: 'Danh sách buổi tổng quan' })).findByRole('alert')
    const stats = screen.getByRole('region', { name: 'Tình hình trong ngày' })
    expect(within(stats).getByRole('button', { name: /Buổi trong ngày/ })).toHaveTextContent('-')
    expect(screen.queryByText('Không có buổi tham quan trong ngày đã chọn.')).not.toBeInTheDocument()
  })

  it('deduplicates snapshots and counts completion on the scheduled campus date', () => {
    const stale = { ...today[0], state: 'Completed' as const }
    const days = overviewDays(today, [stale, ...yesterday], Date.now())
    expect(days).toHaveLength(7)
    expect(days.at(-1)).toMatchObject({ date: '2026-10-01', completed: 1 })
    expect(days.at(-2)).toMatchObject({ date: '2026-09-30', completed: 1 })
  })
})
