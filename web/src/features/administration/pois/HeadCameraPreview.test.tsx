import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { splitHeadPreset } from '../../technical/head-camera-preset'
import { HeadCameraPreview } from './HeadCameraPreview'
import { ROBOT_SILHOUETTES } from './robot-silhouettes'

/** Extent of an SVG path made of absolute M/L commands, in its own units (mm). */
function extent(path: string) {
  const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number)
  const xs = numbers.filter((_, i) => i % 2 === 0), ys = numbers.filter((_, i) => i % 2 === 1)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe('POI camera preview drawn from the real robot', () => {
  it('is to scale: the 563 × 803 mm body, the Quest in front, the TILT shaft inside the pan-tilt dome', () => {
    const body = extent(ROBOT_SILHOUETTES.top.body)
    expect(body.maxX - body.minX).toBeGreaterThan(558)
    expect(body.maxX - body.minX).toBeLessThan(568)
    expect(body.maxY - body.minY).toBeGreaterThan(798)
    expect(body.maxY - body.minY).toBeLessThan(808)
    // Seen from above with the front up, the visor is ahead of the column axis.
    expect(extent(ROBOT_SILHOUETTES.top.quest).minY).toBeLessThan(-140)
    // Seen from the right with the front to the right: the shaft (z 1,9 mm, 968,65 mm high) sits in the dome.
    const dome = extent(ROBOT_SILHOUETTES.side.dome)
    expect(dome.minX).toBeLessThan(1.9)
    expect(dome.maxX).toBeGreaterThan(1.9)
    expect(dome.minY).toBeLessThan(-968.65)
    expect(dome.maxY).toBeGreaterThan(-968.65)
    expect(extent(ROBOT_SILHOUETTES.side.quest).maxX).toBeGreaterThan(145)
  })

  it('turns PAN about the column and TILT about the real shaft', () => {
    const { container } = render(<HeadCameraPreview parts={splitHeadPreset('ANGLE:45,10')!} />)
    expect(screen.getByRole('img', { name: 'Nhìn từ trên: PAN 45° trái' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Nhìn ngang: TILT 10° ngửa' })).toBeInTheDocument()
    const turns = [...container.querySelectorAll('g[transform]')].map(group => group.getAttribute('transform'))
    expect(turns).toContain('rotate(-45)')
    expect(turns).toContain('rotate(-10 1.9 -968.65)')
  })
})
