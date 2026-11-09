import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fitView, placeView, zoomView } from './fit-view'
import { installSvgLayout, pointerAt } from './picker-test-support'
import { ZoomableMap } from './ZoomableMap'

const map = { width: 1000, height: 1000, imageUrl: 'map.png' }
const points = [{ u: 400, v: 400 }, { u: 600, v: 600 }]
const fitted = fitView(map, points)
const button = (name: string) => screen.getByRole('button', { name })

function Harness({ onPin = () => {} }: { onPin?: () => void }) {
  const [reveal, setReveal] = useState<{ u: number; v: number }>()
  return <>
    <button type="button" onClick={() => setReveal({ u: 900, v: 900 })}>Chọn điểm xa</button>
    <ZoomableMap map={map} fitted={fitted} className="h-64" role="img" label="Bản đồ" reveal={reveal}>
      {view => <g role="button" aria-label="Ghim" data-unit={view.unit} onClick={onPin}><circle cx={500} cy={500} r={10 * view.unit} /></g>}
    </ZoomableMap>
  </>
}

const viewBox = () => screen.getByRole('img', { name: 'Bản đồ' }).getAttribute('viewBox')!.split(' ').map(Number)
const svg = () => screen.getByRole('img', { name: 'Bản đồ' }) as unknown as SVGSVGElement

describe('zoomView', () => {
  it('keeps the point under the cursor in place', () => {
    const zoomed = zoomView(map, fitted, 2, { u: 450, v: 550 })
    expect((450 - zoomed.x) / zoomed.width).toBeCloseTo((450 - fitted.x) / fitted.width)
    expect((550 - zoomed.y) / zoomed.height).toBeCloseTo((550 - fitted.y) / fitted.height)
  })

  it('stops zooming out once the whole map fits, even in a frame of another shape', () => {
    const wide = { x: 400, y: 450, width: 200, height: 100, unit: 1 }
    const tall = { x: 450, y: 400, width: 100, height: 200, unit: 1 }
    expect(zoomView(map, wide, 0.0001)).toMatchObject({ width: 2000, height: 1000, x: -500, y: 0 })
    expect(zoomView(map, tall, 0.0001)).toMatchObject({ width: 1000, height: 2000, x: 0, y: -500 })
  })

  it('keeps a dragged view over the map', () => {
    expect(placeView(map, { x: -300, y: 950, width: 200, height: 200 })).toMatchObject({ x: 0, y: 800 })
  })
})

describe('ZoomableMap', () => {
  let restore: () => void
  beforeEach(() => { restore = installSvgLayout() })
  afterEach(() => { restore(); vi.unstubAllGlobals() })

  it('can zoom out past the fitted frame to the whole map, and back to the frame', () => {
    render(<Harness />)
    const opening = viewBox()
    expect(button('Về khung ban đầu')).toBeDisabled()
    expect(button('Thu nhỏ')).toBeEnabled()
    for (let i = 0; i < 6; i++) if (!button('Thu nhỏ').hasAttribute('disabled')) fireEvent.click(button('Thu nhỏ'))
    expect(button('Thu nhỏ')).toBeDisabled()
    expect(viewBox()[3]).toBe(1000)
    fireEvent.click(button('Về khung ban đầu'))
    expect(viewBox()).toEqual(opening)
  })

  it('zooms with the wheel without scrolling the page', () => {
    render(<Harness />)
    const before = viewBox()
    const scrolled = !fireEvent.wheel(svg(), { ...pointerAt(svg(), 500, 500), deltaY: -100 })
    expect(scrolled).toBe(true)
    expect(viewBox()[2]).toBeLessThan(before[2])
  })

  it('drags the map, keeps markers the same on-screen size, and stops on release', () => {
    render(<Harness />)
    fireEvent.click(button('Phóng to'))
    const zoomed = viewBox()
    const from = pointerAt(svg(), 500, 500)
    fireEvent.pointerDown(svg(), from)
    fireEvent.pointerMove(svg(), { ...from, clientX: from.clientX + 40 })
    const dragged = viewBox()
    expect(dragged[0]).toBeLessThan(zoomed[0])
    expect(dragged[1]).toBeCloseTo(zoomed[1])
    expect(Number(screen.getByRole('button', { name: 'Ghim' }).getAttribute('data-unit'))).toBeCloseTo(Math.max(dragged[2], dragged[3]) / 560)
    fireEvent.pointerUp(svg(), from)
    fireEvent.pointerMove(svg(), { ...from, clientX: from.clientX + 90 })
    expect(viewBox()).toEqual(dragged)
  })

  it('leaves a marker clickable instead of starting a drag on it', () => {
    const onPin = vi.fn()
    render(<Harness onPin={onPin} />)
    const pin = screen.getByRole('button', { name: 'Ghim' })
    const capture = vi.spyOn(svg(), 'setPointerCapture')
    fireEvent.pointerDown(pin, { button: 0, pointerId: 1 })
    fireEvent.click(pin)
    expect(capture).not.toHaveBeenCalled()
    expect(onPin).toHaveBeenCalledOnce()
  })

  it('moves to a point chosen elsewhere when zooming has put it out of sight', () => {
    render(<Harness />)
    for (let i = 0; i < 3; i++) fireEvent.click(button('Phóng to'))
    fireEvent.click(screen.getByText('Chọn điểm xa'))
    const [x, y, width, height] = viewBox()
    expect(900).toBeGreaterThanOrEqual(x)
    expect(900).toBeLessThanOrEqual(x + width)
    expect(900).toBeGreaterThanOrEqual(y)
    expect(900).toBeLessThanOrEqual(y + height)
  })
})
