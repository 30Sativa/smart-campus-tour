import { useEffect, useRef, type MutableRefObject } from 'react'
import type { PartGroupId } from './parts'
import { CALLOUTS, layoutCallouts, type CalloutPoint, type CalloutSide } from './callouts'
import type { CalloutFrame } from './robot-rig'

const LABEL = { height: 26, gap: 6, margin: 14, elbow: 16 } as const

/**
 * Labels at the stage's edges with a pointer line to each part, laid out every
 * frame through `frameRef` (written straight into the DOM, no re-render).
 * Labels are buttons: pointing at one lights its part up, pressing one opens
 * the robot on that part. `top`/`bottom` keep them clear of the stage's panels.
 */
export default function CalloutLabels({ frameRef, shown, state, side, top, bottom, left = LABEL.margin, right = LABEL.margin, onHover, onPick }: {
  frameRef: MutableRefObject<CalloutFrame | null>
  shown: readonly boolean[]
  state: readonly ('picked' | 'focus' | 'idle')[]
  side?: CalloutSide
  top: number
  bottom: number
  /** Room kept free at the stage's left and right edges (a panel), px. */
  left?: number
  right?: number
  onHover: (group: PartGroupId | null) => void
  onPick: (group: PartGroupId) => void
}) {
  const labels = useRef<(HTMLButtonElement | null)[]>([])
  const lines = useRef<(SVGPolylineElement | null)[]>([])
  const dots = useRef<(SVGCircleElement | null)[]>([])
  const svg = useRef<SVGSVGElement | null>(null)
  const sides = useRef(new Map<number, CalloutSide>())
  const widths = useRef<number[]>([])
  /** Where each label is drawn now; labels glide to their places instead of jumping. */
  const drawn = useRef(new Map<number, number>())
  const live = useRef({ shown, side, top, bottom, left, right })
  useEffect(() => { live.current = { shown, side, top, bottom, left, right } }, [shown, side, top, bottom, left, right])

  useEffect(() => {
    frameRef.current = (points, width, height) => {
      const { shown: visible, side: only, top: from, bottom: margin, left: inLeft, right: inRight } = live.current
      const usable = points.filter((point, id): point is CalloutPoint => point !== null && visible[id])
      const placed = layoutCallouts(usable, { width, top: from, bottom: height - margin, height: LABEL.height, gap: LABEL.gap, side: only, middle: (inLeft + width - inRight) / 2 }, sides.current)
      svg.current?.setAttribute('viewBox', `0 0 ${width} ${height}`)
      const where = new Map(placed.map(place => [place.id, place]))
      CALLOUTS.forEach((_, id) => {
        const label = labels.current[id]
        const line = lines.current[id]
        const dot = dots.current[id]
        const place = where.get(id)
        const point = points[id]
        if (!label || !line || !dot) return
        if (!place || !point) {
          drawn.current.delete(id)
          label.style.visibility = 'hidden'
          line.style.display = 'none'
          dot.style.display = 'none'
          return
        }
        if (sides.current.get(id) !== place.side) drawn.current.delete(id)
        sides.current.set(id, place.side)
        const before = drawn.current.get(id)
        const y = before === undefined ? place.y : before + (place.y - before) * 0.18
        drawn.current.set(id, y)
        const labelWidth = (widths.current[id] ||= label.offsetWidth)
        const middle = y + LABEL.height / 2
        const edge = place.side === 'left' ? inLeft + labelWidth : width - inRight - labelWidth
        const elbow = place.side === 'left' ? edge + LABEL.elbow : edge - LABEL.elbow
        label.style.visibility = 'visible'
        label.style.top = `${y.toFixed(1)}px`
        label.style.left = place.side === 'left' ? `${inLeft}px` : 'auto'
        label.style.right = place.side === 'right' ? `${inRight}px` : 'auto'
        line.style.display = ''
        line.setAttribute('points', `${edge},${middle} ${elbow},${middle} ${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        dot.style.display = ''
        dot.setAttribute('cx', point.x.toFixed(1))
        dot.setAttribute('cy', point.y.toFixed(1))
      })
    }
    return () => { frameRef.current = null }
  }, [frameRef])

  return (
    <div className="lp3-callouts">
      <svg ref={svg} className="lp3-callouts__lines" aria-hidden="true" preserveAspectRatio="none">
        {CALLOUTS.map((callout, id) => (
          <g key={callout.group} data-state={state[id]}>
            <polyline ref={node => { lines.current[id] = node }} style={{ display: 'none' }} />
            <circle ref={node => { dots.current[id] = node }} r="4" style={{ display: 'none' }} />
          </g>
        ))}
      </svg>
      {CALLOUTS.map((callout, id) => (
        <button
          key={callout.group}
          type="button"
          className="lp3-callouts__label"
          ref={node => { labels.current[id] = node }}
          data-state={state[id]}
          style={{ visibility: 'hidden' }}
          tabIndex={shown[id] ? 0 : -1}
          aria-hidden={!shown[id]}
          aria-label={`Chú thích ${id + 1}: ${callout.label}`}
          onPointerEnter={() => onHover(callout.group)}
          onPointerLeave={() => onHover(null)}
          onFocus={() => onHover(callout.group)}
          onBlur={() => onHover(null)}
          onClick={() => onPick(callout.group)}
        >
          <b>{id + 1}</b>{callout.label}
        </button>
      ))}
    </div>
  )
}
