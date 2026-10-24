import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { RunningFunnel, StudentsByTour } from './OverviewAnalytics'

const tour = {
  id: 'tour-1', code: 'T-01', name: 'Buổi sáng', routeName: 'Tuyến chính', scheduledAt: '2026-10-09T06:00:00Z', estimatedEndAt: '2026-10-09T07:00:00Z', startedAt: '2026-10-09T06:00:00Z', state: 'Running', operationalStatus: 'Normal', readyBlockers: [], language: 'Tiếng Việt',
  registrations: [{ id: 'group-1', schoolName: 'THPT A', representativeName: 'Cô A', state: 'Approved', studentCount: 30, roster: [] }],
  robotId: 'robot-1',
  stops: [
    { id: 'poi-1', name: 'POI 1', position: { x: 0, y: 0 }, dwellSeconds: 10, headSteps: ['FRONT'], status: 'Completed', visits: 1 },
    { id: 'poi-2', name: 'POI 2', position: { x: 1, y: 1 }, dwellSeconds: 10, headSteps: ['LEFT'], status: 'Current', visits: 0 },
  ],
  endPoint: { name: 'Sảnh', position: { x: 0, y: 0 } },
  progress: { step: 'Navigating', stopIndex: 1, hold: false, narration: 'Idle' }, livestream: { state: 'Live' }, startChecks: [], revision: 1,
  allowedActions: Object.fromEntries(['start', 'hold', 'next', 'endEarly', 'retryLeg', 'rerunPoi', 'retryFront', 'confirmComplete'].map((key) => [key, { allowed: false }])) as TourOperation['allowedActions'],
} satisfies TourOperation

const robot = { id: 'robot-1', name: 'robot_01', operationalState: 'Running', connectionState: 'Live', sensorHealth: 'Healthy', batteryPercent: 78, localized: true, assignable: true } satisfies AmrStatus
const now = new Date('2026-10-09T06:30:00Z').getTime()

describe('overview charts', () => {
  it('draws the running session only from the readings the operations responses supplied', () => {
    render(<MemoryRouter><RunningFunnel tours={[tour]} robots={[robot]} now={now} /></MemoryRouter>)
    expect(screen.getByRole('progressbar', { name: 'POI đã qua' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('progressbar', { name: 'Thời gian đã chạy' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('progressbar', { name: 'Pin robot_01' })).toHaveAttribute('aria-valuenow', '78')
  })

  it('counts approved students per session', () => {
    render(<MemoryRouter><StudentsByTour tours={[tour]} /></MemoryRouter>)
    expect(screen.getByRole('img', { name: 'T-01: 30 học sinh' })).toBeInTheDocument()
  })

  it('says so when there is nothing to draw instead of inventing measurements', () => {
    render(<MemoryRouter><RunningFunnel tours={[]} robots={[]} now={now} /><StudentsByTour tours={[]} /></MemoryRouter>)
    expect(screen.getByText('Hiện không có buổi nào đang chạy.')).toBeInTheDocument()
    expect(screen.getByText('Chưa có dữ liệu buổi hôm nay.')).toBeInTheDocument()
  })
})
