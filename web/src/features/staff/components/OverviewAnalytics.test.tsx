import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { OverviewAnalytics } from './OverviewAnalytics'

const tour = {
  id: 'tour-1', code: 'T-01', name: 'Buổi sáng', routeName: 'Tuyến chính', scheduledAt: '', estimatedEndAt: '', state: 'Running', operationalStatus: 'Normal', readyBlockers: [], language: 'Tiếng Việt',
  registrations: [{ id: 'group-1', schoolName: 'THPT A', representativeName: 'Cô A', state: 'Approved', studentCount: 30, roster: [] }],
  stops: [
    { id: 'poi-1', name: 'POI 1', position: { x: 0, y: 0 }, dwellSeconds: 10, headSteps: ['FRONT'], status: 'Completed', visits: 1 },
    { id: 'poi-2', name: 'POI 2', position: { x: 1, y: 1 }, dwellSeconds: 10, headSteps: ['LEFT'], status: 'Current', visits: 0 },
  ],
  endPoint: { name: 'Sảnh', position: { x: 0, y: 0 } },
  progress: { step: 'Navigating', stopIndex: 1, hold: false, narration: 'Idle' }, livestream: { state: 'Live' }, startChecks: [], revision: 1,
  allowedActions: Object.fromEntries(['start', 'hold', 'next', 'endEarly', 'retryLeg', 'rerunPoi', 'retryFront', 'confirmComplete'].map((key) => [key, { allowed: false }])) as TourOperation['allowedActions'],
} satisfies TourOperation

const robot = { id: 'robot-1', name: 'robot_01', operationalState: 'Running', connectionState: 'Live', sensorHealth: 'Healthy', batteryPercent: 78, localized: true, assignable: true } satisfies AmrStatus

describe('OverviewAnalytics', () => {
  it('summarises only the readings supplied by the operations responses', () => {
    render(<OverviewAnalytics tours={[tour]} robots={[robot]} />)
    expect(screen.getByRole('img', { name: 'T-01: 30 học sinh' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Pin robot_01' })).toHaveAttribute('aria-valuenow', '78')
    expect(screen.getByRole('progressbar', { name: 'Tiến độ T-01' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('meter', { name: 'Tỷ lệ robot sẵn sàng' })).toHaveAttribute('aria-valuenow', '100')
  })

  it('shows explicit empty states instead of inventing measurements', () => {
    render(<OverviewAnalytics tours={[]} robots={[]} />)
    expect(screen.getByText('Chưa có dữ liệu buổi hôm nay.')).toBeInTheDocument()
    expect(screen.getByText('Chưa có số đo để hiển thị.')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Tỷ lệ robot sẵn sàng' })).not.toHaveAttribute('aria-valuenow')
  })
})
