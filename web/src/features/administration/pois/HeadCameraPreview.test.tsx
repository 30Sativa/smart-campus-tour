import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
