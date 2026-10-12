import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TwinSceneProps } from './TwinScene'
import { PatrolDemo } from './PatrolDemo'

vi.mock('./TwinScene', () => ({ default: ({ robots, syntheticPatrol }: TwinSceneProps) => <div data-testid="demo-scene">{syntheticPatrol ? 'synthetic' : 'telemetry'} · {robots.length} robots · {robots[0].pose.x.toFixed(3)}</div> }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('patrol demo controls', () => {
  it('starts six synthetic robots, pauses, resumes, changes playback speed and resets', async () => {
    render(<PatrolDemo overhead={false} showLabels={false} />)
    await screen.findByTestId('demo-scene')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    // Restart the interval so its clock and fake performance share the same origin.
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }))
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    expect(screen.getByTestId('demo-scene')).toHaveTextContent('synthetic · 6 robots')
    const initial = screen.getByTestId('demo-scene').textContent
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByTestId('demo-scene').textContent).not.toBe(initial)
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }))
    const paused = screen.getByTestId('demo-scene').textContent
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByTestId('demo-scene').textContent).toBe(paused)
    fireEvent.change(screen.getByLabelText('Tốc độ phát'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('12s tuần tra')).toBeInTheDocument()
    const visible = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const background = screen.getByTestId('demo-scene').textContent
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByTestId('demo-scene').textContent).toBe(background)
    visible.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }))
    expect(screen.getByTestId('demo-scene').textContent).toBe(initial)
    expect(screen.getByText('0s tuần tra')).toBeInTheDocument()
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })
})
