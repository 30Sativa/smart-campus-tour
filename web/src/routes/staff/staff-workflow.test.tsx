import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import StartCheckPage from './StartCheckPage'
import ToursTodayPage from './ToursTodayPage'
import { OperationControls } from '../../features/staff/components/OperationControls'
import { RunStatus } from '../../features/staff/components/RunStatus'
import { command, confirmRobotReady, resetSim, tick, tourById, tourView } from '../../mocks/staff-sim'

/**
 * The operator workflow as a person meets it (remote-tour scope): the right
 * next step per session, Start held back with its reason until the server says
 * so and the on-site checks are ticked, and End Early only with a reason.
 */
function renderAt(path: string, element: ReactNode, route: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
          <Route path="*" element={<p>Đã chuyển trang</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('staff session workflow', () => {
  beforeEach(() => resetSim())
  afterEach(() => resetSim())

  it('keeps live state and missing telemetry visible in the compact status card', () => {
    renderAt('/staff/live/tour-01', <RunStatus tour={tourView(tourById('tour-01')!)} now={Date.now()} compact />, '/staff/live/:tourId')
    expect(screen.getByText('Đang chạy')).toBeInTheDocument()
    expect(screen.getByText('Bước hiện tại')).toBeInTheDocument()
    expect(screen.getByText('Thời gian dừng còn')).toBeInTheDocument()
    expect(screen.getByText('Chưa có dữ liệu robot')).toBeInTheDocument()
    expect(screen.getByText('Không có lệnh đang chờ')).toBeInTheDocument()
  })

  it('offers each session the next step its state calls for', async () => {
    renderAt('/staff/tours', <ToursTodayPage />, '/staff/tours')
    const table = await screen.findByRole('table', { name: 'Buổi hôm nay' })
    const row = (code: string) => within(table).getByText(code).closest('tr') as HTMLElement
    expect(within(row('T-01')).getByRole('link', { name: 'Điều hành' })).toHaveAttribute('href', '/staff/live/tour-01')
    expect(within(row('T-02')).getByRole('link', { name: 'Kiểm tra & bắt đầu' })).toHaveAttribute('href', '/staff/tours/tour-02/start')
    expect(within(row('T-03')).getByRole('link', { name: 'Xem chi tiết' })).toBeInTheDocument()
    expect(within(row('T-03')).getByText(/chờ Admin duyệt/)).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: /Bắt đầu/ })).toBeNull()
  })

  it('keeps Start disabled with the server reason while the robot serves another session', async () => {
    renderAt('/staff/tours/tour-02/start', <StartCheckPage />, '/staff/tours/:tourId/start')
    const start = await screen.findByRole('button', { name: /Bắt đầu buổi/ })
    expect(start).toBeDisabled()
    expect(screen.getByText(/Chưa thể bắt đầu: Đang phục vụ T-01/)).toBeInTheDocument()
  })

  it('starts a Ready session only after on-site confirmations and a dialog', async () => {
    command('tour-01', 'endEarly', 'Diễn tập')
    tick(3)
    confirmRobotReady('robot_01')
    renderAt('/staff/tours/tour-02/start', <StartCheckPage />, '/staff/tours/:tourId/start')
    const start = await screen.findByRole('button', { name: /Bắt đầu buổi/ })
    expect(start).toBeDisabled()
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
    expect(start).toBeEnabled()
    fireEvent.click(start)
    const dialog = screen.getByRole('dialog', { name: /Bắt đầu T-02/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bắt đầu' }))
    await screen.findByText('Đã chuyển trang')
    expect(tourById('tour-02')?.state).toBe('Running')
  })

  it('ends a session early only with a confirmed reason, as Cancelled', async () => {
    renderAt('/staff/live/tour-01', <OperationControls tour={tourView(tourById('tour-01')!)} />, '/staff/live/:tourId')
    expect(screen.getByRole('button', { name: /Giữ tại POI/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Kết thúc sớm/ }))
    const dialog = screen.getByRole('dialog', { name: /Kết thúc sớm T-01/ })
    const confirm = within(dialog).getByRole('button', { name: 'Kết thúc sớm' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Mạng hội trường không ổn định' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(tourById('tour-01')?.state).toBe('Cancelled'))
    expect(tourById('tour-01')?.endReason).toContain('Mạng hội trường')
  })
})
