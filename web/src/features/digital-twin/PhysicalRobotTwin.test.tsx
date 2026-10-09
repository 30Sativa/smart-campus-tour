import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeConnectionState } from '../../api/contracts/staff-realtime'
import { PhysicalRobotTwin } from './PhysicalRobotTwin'
import type { RobotTelemetrySource } from './robot-telemetry'

vi.mock('./TwinScene', () => ({ default: ({ robots, modelKey }: { robots: { stale: boolean }[]; modelKey: string }) => <div data-testid="physical-scene">{robots.length} robots {robots[0]?.stale ? 'stale' : ''} {modelKey}</div> }))
afterEach(() => vi.useRealTimers())

describe('physical robot twin preparation', () => {
  it('waits without showing a fake robot or connecting an unimplemented hub', async () => {
    render(<PhysicalRobotTwin />)
    expect(screen.getByText(/Chưa kết nối/)).toBeInTheDocument()
    expect(await screen.findByTestId('physical-scene')).toHaveTextContent('0 robots')
    expect(screen.getByTestId('physical-scene')).toHaveTextContent('nvh-v3')
    fireEvent.change(screen.getByRole('combobox', { name: 'Model 3D' }), { target: { value: 'legacy' } })
    expect(screen.getByTestId('physical-scene')).toHaveTextContent('legacy')
    expect(screen.getByText(/Phần này không dùng dữ liệu demo/)).toBeInTheDocument()
  })
  it('keeps real coordinates visible while an uncalibrated map prevents placement; cleans up subscriptions', async () => {
    let observe!: (sample: unknown) => void
    let connect!: (state: RealtimeConnectionState) => void
    const unsubscribe = vi.fn()
    const source: RobotTelemetrySource = { subscribe: (onSample, onState) => { observe = onSample; connect = onState; return unsubscribe } }
    const { unmount } = render(<PhysicalRobotTwin source={source} />)
    await screen.findByTestId('physical-scene')
    act(() => {
      connect('connected')
      observe({ robotId: 'robot_01', mapKey: 'map2-v2', frameId: 'map', streamId: 'a', seq: 1, capturedAt: new Date().toISOString(), pose: { x: 3, y: 4, yaw: 0 } })
    })
    expect(screen.getByText('X 3.00 · Y 4.00 m')).toBeInTheDocument()
    expect(screen.getByTestId('physical-scene')).toHaveTextContent('0 robots')
    act(() => observe({ seq: 0 }))
    expect(screen.getByRole('status')).toHaveTextContent('Bỏ qua mẫu vị trí')
    expect(screen.getByText('X 3.00 · Y 4.00 m')).toBeInTheDocument()
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('ages a pose without waiting for a new sample', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T05:00:00Z'))
    const source: RobotTelemetrySource = { subscribe: (observe, connect) => {
      connect('connected')
      observe({ robotId: 'robot_01', mapKey: 'map2-v2', frameId: 'map', streamId: 'a', seq: 1, capturedAt: new Date().toISOString(), pose: { x: 3, y: 4, yaw: 0 } })
      return () => {}
    } }
    let unmount!: () => void
    await act(async () => { ({ unmount } = render(<PhysicalRobotTwin source={source} />)) })
    expect(screen.getByText(/Đang nhận vị trí/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByText(/Dữ liệu vị trí cũ/)).toBeInTheDocument()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
