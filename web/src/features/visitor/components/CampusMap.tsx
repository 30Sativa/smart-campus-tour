import { useCallback, useMemo, useRef, useState } from 'react'
import { Crosshair, Info, Minus, Plus, UserRound } from 'lucide-react'
import { RobotMark } from './RobotMark'
import {
  ATRIUM,
  COLUMNS,
  CORRIDOR,
  HALL,
  HALL_CURVES,
  OUTLINE,
  ROOMS,
  centroid,
  toPoints,
} from '../campus-floorplan'

export type MapPin = {
  id: string
  name: string
  x: number
  y: number
  role: 'place' | 'you' | 'robot' | 'destination'
}

type Point = { x: number; y: number }

/**
 * The campus plan, drawn as a 2D wayfinding map.
 *
 * What is real here and what is not, stated plainly because it matters:
 *
 * - The markers sit at the `mapX`/`mapY` the API returns for each place, and the
 *   route is a polyline through the real stop coordinates of the real tour. Move
 *   a place in the backend and it moves here.
 * - The building is a schematic traced from the campus model: the topology is
 *   right, the dimensions are approximate, and the panel says so rather than
 *   implying a surveyed plan. It lives in `campus-floorplan.ts`, so correcting
 *   it against the real model is a data edit and not a change to this file.
 *
 * Markers, route, zoom and pan all work in the same 0-100 space the API speaks,
 * so none of them has to change when the plan does.
 */

const MIN_ZOOM = 1
const MAX_ZOOM = 3.2

/**
 * The building, drawn from `campus-floorplan.ts`.
 *
 * Every shape here is read from that module — outline, atrium, rooms, columns,
 * corridor — so correcting the plan is a data edit, never a drawing edit. The
 * atrium is punched out with an even-odd fill rather than painted over, so the
 * void is genuinely a hole and the ground colour shows through it.
 */
function FloorPlan() {
  return (
    <g aria-hidden="true">
      {/* Plate, with the atrium as a hole in the same path. */}
      <path
        className="vs-plan__slab"
        fillRule="evenodd"
        d={`M${toPoints(OUTLINE).replace(/ /g, ' L')} Z M${toPoints(ATRIUM).replace(/ /g, ' L')} Z`}
      />

      {/* The circulation ring the robot travels. */}
      <polygon className="vs-plan__corridor" points={toPoints(CORRIDOR)} />

      {/* The open hall, and the curved floor markings inside it. */}
      <polygon className="vs-plan__hall" points={toPoints(HALL.points)} />
      {HALL_CURVES.map((d) => (
        <path key={d} className="vs-plan__curve" d={d} />
      ))}

      {/* Perimeter rooms. */}
      {ROOMS.map((room) => (
        <polygon key={room.id} className="vs-plan__room" points={toPoints(room.points)} />
      ))}

      {/* Columns around the atrium. */}
      {COLUMNS.map((column, index) => (
        <circle key={index} className="vs-plan__column" cx={column.x} cy={column.y} r={0.9} />
      ))}

      {/* Outer wall, drawn last so it sits over every room edge. */}
      <polygon className="vs-plan__wall" points={toPoints(OUTLINE)} />
      <polygon className="vs-plan__atrium-edge" points={toPoints(ATRIUM)} />

      {/* Room names, only where the room is big enough to carry one. */}
      {[...ROOMS, HALL]
        .filter((room) => room.label)
        .map((room) => {
          const centre = centroid(room.points)
          return (
            <text key={`${room.id}-label`} className="vs-plan__label" x={centre.x} y={centre.y}>
              {room.label}
            </text>
          )
        })}
    </g>
  )
}

export function CampusMap({
  pins,
  route,
  selectedId,
  onSelect,
  note = 'Building floor plan. Traced from the campus model — room positions are approximate.',
  children,
}: {
  pins: MapPin[]
  /** Ordered points the route runs through, in the same 0-100 percent space. */
  route?: Point[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  note?: string
  children?: React.ReactNode
}) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const line = useMemo(
    () => (route && route.length > 1 ? route.map((p) => `${p.x},${p.y}`).join(' ') : null),
    [route],
  )

  const reset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  /** Panning is only possible once zoomed in; at 1x there is nothing to reveal. */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || (event.target as HTMLElement).closest('.vs-pin')) return
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    const limit = (zoom - 1) * 50
    const next = {
      x: start.panX + ((event.clientX - start.x) / event.currentTarget.clientWidth) * 100,
      y: start.panY + ((event.clientY - start.y) / event.currentTarget.clientHeight) * 100,
    }
    setPan({
      x: Math.max(-limit, Math.min(limit, next.x)),
      y: Math.max(-limit, Math.min(limit, next.y)),
    })
  }

  const endDrag = () => {
    drag.current = null
  }

  const step = (direction: 1 | -1) =>
    setZoom((current) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number((current + direction * 0.4).toFixed(2))))
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })

  return (
    <div className="vs-card">
      <div
        className="vs-map"
        role="group"
        aria-label="Campus plan"
        data-pannable={zoom > 1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* One transformed stage holds the ground, the route and the markers, so
            zooming moves all three together and they can never drift apart. */}
        <div
          className="vs-map__stage"
          style={{ transform: `translate(${pan.x}%, ${pan.y}%) scale(${zoom})` }}
        >
          <svg className="vs-map__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
            <FloorPlan />

            {line && (
              <>
                {/* Drawn twice: a wide soft casing under a solid core, which is
                    how a route reads as a route rather than as a stray line. */}
                <polyline className="vs-map__route-casing" points={line} />
                <polyline className="vs-map__route" points={line} />
              </>
            )}
          </svg>

          {pins.map((pin) => {
            const glyph =
              pin.role === 'robot' ? (
                <RobotMark size={16} />
              ) : pin.role === 'you' ? (
                <UserRound size={14} strokeWidth={2.2} aria-hidden="true" />
              ) : null

            const body = (
              <>
                <span className="vs-pin__mark">{glyph}</span>
                <span className="vs-pin__label">{pin.name}</span>
              </>
            )

            // Counter-scaled, so a marker stays the same size on screen however
            // far the plan is zoomed in — the behaviour of every real map.
            const style = {
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              '--vs-pin-scale': 1 / zoom,
            } as React.CSSProperties

            // A marker is a control only when selecting it does something.
            return onSelect ? (
              <button
                key={pin.id}
                type="button"
                className="vs-pin"
                data-role={pin.role}
                data-on={selectedId === pin.id ? 'true' : 'false'}
                style={style}
                onClick={() => onSelect(pin.id)}
                aria-pressed={selectedId === pin.id}
                aria-label={`Show ${pin.name} on the map`}
              >
                {body}
              </button>
            ) : (
              <span
                key={pin.id}
                className="vs-pin"
                data-role={pin.role}
                data-on={selectedId === pin.id ? 'true' : 'false'}
                style={style}
              >
                {body}
              </span>
            )
          })}
        </div>

        <div className="vs-map__controls">
          <button type="button" onClick={() => step(1)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => step(-1)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
            <Minus size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button type="button" onClick={reset} disabled={zoom === 1 && pan.x === 0 && pan.y === 0} aria-label="Recentre the plan">
            <Crosshair size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <p className="vs-map__note">
          <Info size={13} strokeWidth={1.9} aria-hidden="true" />
          {note}
        </p>
      </div>

      {children}
    </div>
  )
}

/** The marker vocabulary, spelled out under the plan. */
export function MapLegend() {
  return (
    <div className="vs-legend">
      <span>
        <i data-role="you" />
        You are here
      </span>
      <span>
        <i data-role="robot" />
        Your robot
      </span>
      <span>
        <i data-role="destination" />
        Destination
      </span>
      <span>
        <i />
        Campus place
      </span>
    </div>
  )
}
