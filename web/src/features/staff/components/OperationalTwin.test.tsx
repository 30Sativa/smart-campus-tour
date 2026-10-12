import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TwinSceneProps } from '../../digital-twin/TwinScene'
import { OperationalTwin } from './OperationalTwin'
import type { TourOperation } from '../../../api/contracts/staff'
vi.mock('../../digital-twin/TwinScene', () => ({
  default: ({ modelKey, overhead, showLabels, robots }: TwinSceneProps) => <div data-testid="scene">{modelKey} · {overhead ? 'overhead' : 'perspective'} · {showLabels ? 'points' : 'no points'} · {robots.length} robots</div>,
}))
describe('OperationalTwin default fleet', () => {
  it('keeps reported poses and missing-pose warnings when displaying a Tour', async () => {
    const tour = {
      id: 'tour-1', code: 'T-01', name: 'Tour', routeName: 'Route', scheduledAt: '', estimatedEndAt: '', state: 'Running', operationalStatus: 'Normal', readyBlockers: [], language: 'Tiếng Việt', registrations: [], stops: [],
      endPoint: { name: 'Sảnh', position: { x: 0, y: 0 } }, livestream: { state: 'Live' }, startChecks: [], revision: 1,
      allowedActions: Object.fromEntries(['start', 'hold', 'next', 'endEarly', 'retryLeg', 'rerunPoi', 'retryFront', 'confirmComplete'].map(key => [key, { allowed: false }])) as TourOperation['allowedActions'],
    } satisfies TourOperation
    render(<OperationalTwin tour={tour} robots={[
      { id: 'gazebo', name: 'Preview', operationalState: 'Idle', connectionState: 'Live', sensorHealth: 'Healthy', source: 'Gazebo', pose: { x: 1, y: 2, yaw: 0 } },
      { id: 'missing', name: 'Missing', operationalState: 'Idle', connectionState: 'Disconnected', sensorHealth: 'Unknown' },
    ]} />)
    expect(await screen.findByTestId('scene')).toHaveTextContent('no points · 1 robots')
    expect(screen.getByText(/có dữ liệu Gazebo/)).toBeInTheDocument()
    expect(screen.getByText('1 robot không gửi vị trí')).toBeInTheDocument()
    expect(screen.queryByText('R1')).not.toBeInTheDocument()
  })
  it('starts six local robots without a demo switch and toggles points independently', async () => {
    render(<OperationalTwin robots={[]} />)
    expect(await screen.findByTestId('scene')).toHaveTextContent('nvh-v3 · perspective · no points · 6 robots')
    expect(screen.getByText('6 robot · Chưa kết nối miniPC')).toBeInTheDocument()
    for (const name of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']) expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mô phỏng/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Điểm point' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Điểm point' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhìn từ trên' }))
    expect(screen.getByTestId('scene')).toHaveTextContent('nvh-v3 · overhead · points · 6 robots')
    fireEvent.click(screen.getByRole('button', { name: 'Điểm point' }))
    expect(screen.getByTestId('scene')).toHaveTextContent('no points · 6 robots')
  })
})
