import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { splitHeadPreset } from '../../technical/head-camera-preset'
import { HeadCameraPreview } from './HeadCameraPreview'

describe('POI camera preview', () => {
  it('names the angle in both views and turns the head by it', () => {
    const { container } = render(<HeadCameraPreview parts={splitHeadPreset('ANGLE:45,10')!} />)
    expect(screen.getByRole('img', { name: 'Nhìn từ trên: PAN 45° trái' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Nhìn ngang: TILT 10° ngửa' })).toBeInTheDocument()
    const turns = [...container.querySelectorAll('g[transform]')].map(group => group.getAttribute('transform'))
    expect(turns).toContain('rotate(-45 100 92)')
    expect(turns).toContain('rotate(-10 70 112)')
  })

  it('draws no view cone and no play button when the head stays put', () => {
    const { container } = render(<HeadCameraPreview parts={splitHeadPreset('NONE')!} />)
    expect(container.querySelectorAll('linearGradient')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Chạy thử/ })).not.toBeInTheDocument()
  })

  it('offers no play button when the head stays at the front', () => {
    render(<HeadCameraPreview parts={splitHeadPreset('FRONT')!} />)
    expect(screen.queryByRole('button', { name: /Chạy thử/ })).not.toBeInTheDocument()
  })

  describe('Chạy thử', () => {
    afterEach(() => { vi.useRealTimers() })

    it('turns the head from the front to the angle at the robot pace, then stops there', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
      const { container } = render(<HeadCameraPreview parts={splitHeadPreset('LEFT')!} />)
      const panTurn = () => container.querySelector('g[transform$=" 100 92)"]')!.getAttribute('transform') ?? ''
      const button = screen.getByRole('button', { name: /Chạy thử/ })
      expect(button).toHaveAttribute('title', 'Phát đúng tốc độ robot thật')

      act(() => { fireEvent.click(button) })
      act(() => { vi.advanceTimersByTime(1000) })                  // 90° takes 2 s on the robot
      expect(screen.getByRole('button', { name: /Dừng/ })).toBeInTheDocument()
      const halfway = Number(/rotate\((-?[\d.]+)/.exec(panTurn())![1])
      expect(halfway).toBeGreaterThan(-60)
      expect(halfway).toBeLessThan(-30)

      act(() => { vi.advanceTimersByTime(1200) })
      expect(panTurn()).toBe('rotate(-90 100 92)')
      expect(screen.getByRole('button', { name: /Chạy thử/ })).toBeInTheDocument()
    })
  })
})
