import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'
import { RouteSchematic } from './RouteSchematic'

const tour = {
  id: 'tour-1', code: 'T-01', name: 'Buổi sáng', routeName: 'Tuyến chính', scheduledAt: '', estimatedEndAt: '', state: 'Running', operationalStatus: 'Normal', readyBlockers: [], language: 'Tiếng Việt',
  registrations: [],
  stops: [
    { id: 'poi-1', name: 'AI Lab', position: { x: 0, y: 0 }, dwellSeconds: 10, headSteps: ['FRONT'], status: 'Completed', visits: 1 },
    { id: 'poi-2', name: 'Thư viện', position: { x: 1, y: 1 }, dwellSeconds: 10, headSteps: ['LEFT'], status: 'Current', visits: 0 },
  ],
  endPoint: { name: 'Sảnh', position: { x: 0, y: 0 } },
  progress: { step: 'Navigating', stopIndex: 1, hold: false, narration: 'Idle' }, livestream: { state: 'Live' }, startChecks: [], revision: 1,
  allowedActions: Object.fromEntries(['start', 'hold', 'next', 'endEarly', 'retryLeg', 'rerunPoi', 'retryFront', 'confirmComplete'].map((key) => [key, { allowed: false }])) as TourOperation['allowedActions'],
} satisfies TourOperation

const robot = {
  id: 'robot-1', name: 'SmartBus-01', operationalState: 'Running', connectionState: 'Live', sensorHealth: 'Healthy', source: 'Physical', poseAgeSeconds: 0.8,
} satisfies AmrStatus

describe('RouteSchematic', () => {
  it('shows the ordered POIs and live robot source without inventing a camera image', () => {
    const onSelect = vi.fn()
    render(<MemoryRouter><RouteSchematic tour={tour} robot={robot} onSelect={onSelect} /></MemoryRouter>)
    expect(screen.getByRole('region', { name: 'Sơ đồ tuyến vận hành' })).toBeInTheDocument()
    expect(screen.getByText('Sơ đồ tuyến · Physical')).toBeInTheDocument()
    expect(screen.getByText(/Pose: 0.8 giây/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thư viện/i })).toHaveTextContent('Điểm hiện tại')
    fireEvent.click(screen.getByRole('button', { name: /AI Lab/i }))
    expect(onSelect).toHaveBeenCalledWith('poi-1')
    expect(screen.getByRole('link', { name: /Mở Digital Twin 3D/i })).toHaveAttribute('href', '/staff/digital-twin')
  })
})
