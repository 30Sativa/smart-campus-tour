import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { placeView, zoomView, type FittedView } from './fit-view'
import { screenToImage, type ImagePoint } from './occupancy-grid'

type PanDrag = { pointerId: number; start: ImagePoint; matrix: DOMMatrix; view: FittedView }

const STEP = 1.5
const WHEEL_STEP = 1.25
const zoomButton = 'grid size-8.5 place-items-center rounded-lg text-[#475569] transition-colors hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:text-[#c2cfda] disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]'

/**
 * A map raster that can be zoomed and dragged, with whatever the page draws on top of it. It opens on `fitted`
 * and follows it until someone zooms or drags. Remount it with a `key` when the raster changes.
 */
export function ZoomableMap({ map, fitted, className, role, label, reveal, children }: {
  map: { width: number; height: number; imageUrl: string }
  fitted: FittedView
  /** Sizes the map, e.g. its height. */
  className: string
  role: 'img' | 'group'
  label: string
  /** A point chosen elsewhere on the page: the view moves to it if it is out of sight. */
  reveal?: ImagePoint
  /** Draws the markers; sized with the view's `unit` so they stay the same size at every zoom. */
  children: (view: FittedView) => ReactNode
}) {
  const [moved, setMoved] = useState<FittedView | null>(null)
  const [revealed, setRevealed] = useState(reveal)
  const drag = useRef<PanDrag | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const view = moved ?? fitted

  if (reveal?.u !== revealed?.u || reveal?.v !== revealed?.v) {
    setRevealed(reveal)
    const outOfSight = reveal && (reveal.u < view.x || reveal.u > view.x + view.width || reveal.v < view.y || reveal.v > view.y + view.height)
    if (moved && reveal && outOfSight) setMoved(placeView(map, { ...moved, x: reveal.u - moved.width / 2, y: reveal.v - moved.height / 2 }))
  }

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP
      const focus = screenToImage(svg.getScreenCTM(), event.clientX, event.clientY) ?? undefined
      setMoved(current => zoomView(map, current ?? fitted, factor, focus))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [map, fitted])

  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    // Capturing the pointer would send a marker's click to the map instead.
    if (event.button !== 0 || drag.current || (event.target as Element).closest('[role="button"]')) return
    const matrix = event.currentTarget.getScreenCTM()
    const start = screenToImage(matrix, event.clientX, event.clientY)
    if (!matrix || !start) return
    drag.current = { pointerId: event.pointerId, start, matrix, view }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    // Freeze the starting CTM: reading the moving CTM would introduce pan drift.
    const point = screenToImage(current.matrix, event.clientX, event.clientY)
    if (point) setMoved(placeView(map, { ...current.view, x: current.view.x - (point.u - current.start.u), y: current.view.y - (point.v - current.start.v) }))
  }
  const finishPan = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const step = (factor: number) => setMoved(current => zoomView(map, current ?? fitted, factor))
  const canStep = (factor: number) => Math.abs(zoomView(map, view, factor).height - view.height) > 1e-6

  return (
    <div className="relative">
      {/* A finger keeps scrolling the page until the map has been zoomed. */}
      <svg
        ref={svgRef} role={role} aria-label={label}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        className={`block w-full cursor-grab rounded-xl bg-[#eef2f6] select-none active:cursor-grabbing ${moved ? 'touch-none' : ''} ${className}`}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={finishPan}
      >
        <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: 'pixelated' }} opacity={0.9} />
        {children(view)}
      </svg>
      <div className="absolute top-2 right-2 flex flex-col gap-0.5 rounded-xl border border-[#e2e8f0] bg-white p-1 shadow-xs">
        <button type="button" aria-label="Phóng to" title="Phóng to" disabled={!canStep(STEP)} onClick={() => step(STEP)} className={zoomButton}><Plus size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Thu nhỏ" title="Thu nhỏ" disabled={!canStep(1 / STEP)} onClick={() => step(1 / STEP)} className={zoomButton}><Minus size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Về khung ban đầu" title="Về khung ban đầu" disabled={!moved} onClick={() => setMoved(null)} className={zoomButton}><Maximize size={16} aria-hidden="true" /></button>
      </div>
    </div>
  )
}
