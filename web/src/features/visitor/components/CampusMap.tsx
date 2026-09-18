import { Info, MapPin, UserRound } from 'lucide-react'
import { RobotMark } from './RobotMark'

export type MapPin = {
  id: string
  name: string
  x: number
  y: number
  role: 'place' | 'you' | 'robot' | 'destination'
}

/**
 * The campus plan.
 *
 * No map service is wired in yet, so the ground is a plan-like plane and the
 * panel says so in one line rather than pretending to be a live map. The pins are
 * positioned from the `mapX`/`mapY` percentages the API already returns, and the
 * route is an SVG polyline through the same coordinates — so replacing the plane
 * with a real tile layer later is a change to this component and to nothing else.
 *
 * It renders inside a `.vs-card`, which is what keeps the map framed by the same
 * hairline and radius as every other panel on this surface.
 */
export function CampusMap({
  pins,
  route,
  selectedId,
  onSelect,
  note = 'Campus plan preview. Live positions appear here once the campus map service is connected.',
  children,
}: {
  pins: MapPin[]
  /** Ordered points the route line runs through, in the same percent space. */
  route?: Array<{ x: number; y: number }>
  selectedId?: string | null
  onSelect?: (id: string) => void
  note?: string
  /** Legend, filters or anything else that belongs under the plane. */
  children?: React.ReactNode
}) {
  const line = route && route.length > 1 ? route.map((point) => `${point.x},${point.y}`).join(' ') : null

  return (
    <div className="vs-card">
      <div className="vs-map" role="group" aria-label="Campus plan">
        <div className="vs-map__grid" aria-hidden="true" />

        {line && (
          <svg className="vs-map__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              points={line}
              fill="none"
              stroke="var(--lp-accent)"
              strokeWidth="0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2 1.6"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 2 }}
            />
          </svg>
        )}

        {pins.map((pin) => {
          const glyph = (
            <>
              <span className="vs-pin__label">{pin.name}</span>
              <span className="vs-pin__dot">
                {pin.role === 'robot' ? (
                  <RobotMark size={17} />
                ) : pin.role === 'you' ? (
                  <UserRound size={15} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <MapPin size={15} strokeWidth={2} aria-hidden="true" />
                )}
              </span>
            </>
          )
          const position = { left: `${pin.x}%`, top: `${pin.y}%` }

          // A pin is a control only when selecting it does something. A static
          // marker stays a span, so nothing lands in the tab order that a
          // keyboard user cannot act on.
          return onSelect ? (
            <button
              key={pin.id}
              type="button"
              className="vs-pin"
              data-role={pin.role}
              data-on={selectedId === pin.id ? 'true' : 'false'}
              style={position}
              onClick={() => onSelect(pin.id)}
              aria-pressed={selectedId === pin.id}
              aria-label={`Show ${pin.name} on the map`}
            >
              {glyph}
            </button>
          ) : (
            <span
              key={pin.id}
              className="vs-pin"
              data-role={pin.role}
              data-on={selectedId === pin.id ? 'true' : 'false'}
              style={position}
            >
              {glyph}
            </span>
          )
        })}

      </div>
        <p className="vs-map__note">
          <Info size={13} strokeWidth={1.9} aria-hidden="true" />
          {note}
        </p>
      {children}
    </div>
  )
}

/** The pin vocabulary, spelled out under the plane. */
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
