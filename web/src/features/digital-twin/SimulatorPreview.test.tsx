import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimulatorPreview } from './SimulatorPreview'

vi.mock('../../three/DigitalTwinCanvas', () => ({ DigitalTwinCanvas: () => <div>3D scene</div> }))

describe('simulator playback', () => {
  afterEach(() => vi.useRealTimers())
  it('labels the demo, starts paused, plays, pauses and resets the pose', () => {
    vi.useFakeTimers()
    render(<SimulatorPreview />)
    expect(screen.getByText(/Dữ liệu demo · Chưa kết nối robot/)).toBeInTheDocument()
    expect(screen.getByTestId('pose-y')).toHaveTextContent('0.00 m')
    fireEvent.click(screen.getByRole('button', { name: 'Phát demo' }))
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByTestId('pose-y')).not.toHaveTextContent('0.00 m')
    fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng demo' }))
    const paused = screen.getByTestId('pose-y').textContent
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByTestId('pose-y').textContent).toBe(paused)
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }))
    expect(screen.getByTestId('pose-y')).toHaveTextContent('0.00 m')
    expect(screen.getByTestId('pose-x')).toHaveTextContent('4.00 m')
    expect(screen.getByRole('button', { name: 'Phát demo' })).toBeInTheDocument()
  })
  it('changes playback rate and cleans up the timer on unmount', () => {
    vi.useFakeTimers()
    const { unmount } = render(<SimulatorPreview />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Tốc độ phát' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Phát demo' }))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByTestId('pose-y')).toHaveTextContent('1.56 m')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
