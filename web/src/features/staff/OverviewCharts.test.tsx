import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { StaffDashboard } from '../../api/contracts/staff'
import { OverviewCharts } from './OverviewCharts'

const dashboard: StaffDashboard = {
  todayTours: 0, upcomingTours: 0, activeTours: 0, completedTours: 0, pendingTours: 0,
  activeAmrs: 0, offlineAmrs: 0, activeAlerts: 0, criticalAlerts: 0,
  todaySchedule: [], activeAmrsList: [], recentAlerts: [], activeSessions: [],
}

describe('OverviewCharts', () => {
  it('shows empty states without inventing readings or sessions', () => {
    render(<MemoryRouter><OverviewCharts dashboard={dashboard} updatedAt={0} /></MemoryRouter>)
    expect(screen.getByText('Chưa có số liệu AMR.')).toBeInTheDocument()
    expect(screen.getByText('Chưa có phiên tour đang hoạt động.')).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText('Đang chờ cập nhật')).toBeInTheDocument()
  })

  it('distinguishes missing readings from zero and labels stale battery data', () => {
    const readings: StaffDashboard = {
      ...dashboard,
      activeAmrsList: [
        { id: 'a', name: 'Robot A', connectionState: 'Live', operationalState: 'Idle', sensorHealth: 'Healthy', batteryPercent: 0 },
        { id: 'b', name: 'Robot B', connectionState: 'Stale', operationalState: 'Paused', sensorHealth: 'Unknown', batteryPercent: 42 },
        { id: 'c', name: 'Robot C', connectionState: 'Disconnected', operationalState: 'Offline', sensorHealth: 'Unknown', batteryPercent: null },
      ],
      activeSessions: [
        { id: 'tour-a', routeName: 'Tour A', status: 'InProgress', startTime: '', progressPercent: 62 },
        { id: 'tour-b', routeName: 'Tour B', status: 'Paused', startTime: '', progressPercent: null },
      ],
    }
    render(<MemoryRouter><OverviewCharts dashboard={readings} updatedAt={Date.now()} /></MemoryRouter>)
    expect(screen.getByRole('meter', { name: 'Pin Robot A' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('meter', { name: 'Pin Robot B' })).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText('Dữ liệu chậm · số liệu lần cuối')).toBeInTheDocument()
    expect(screen.queryByRole('meter', { name: 'Pin Robot C' })).not.toBeInTheDocument()
    expect(screen.getByText('Chưa có số liệu')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Tiến độ Tour A' })).toHaveAttribute('aria-valuenow', '62')
    expect(screen.queryByRole('progressbar', { name: 'Tiến độ Tour B' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tour A' })).toHaveAttribute('href', '/staff/tours/tour-a')
    const pausedTour = screen.getByRole('link', { name: 'Tour B' }).closest('li')!
    expect(within(pausedTour).getByText('Tạm dừng')).toBeInTheDocument()
    expect(within(pausedTour).getByText('Chưa có tiến độ')).toBeInTheDocument()
  })
})
