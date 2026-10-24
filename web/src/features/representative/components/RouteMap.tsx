import type { RepresentativeTour } from '../api/types'

/**
 * A schematic of the Tour's route: the stops in order on a gentle curve over a
 * stylised campus, the line drawing itself and a robot riding it. It shows the
 * order of the stops, not real positions; the stop list below carries the
 * information.
 */
export function RouteMap({ tour }: { tour: RepresentativeTour }) {
  const stops = [...tour.stops].sort((a, b) => a.order - b.order)
  const points = [{ x: 60, y: 210, name: 'Xuất phát' }, ...stops.map((stop, i) => {
    const t = (i + 1) / Math.max(1, stops.length)
    return { x: 60 + t * 560, y: 150 - Math.sin(t * Math.PI * 1.4) * 90, name: stop.name }
  })]
  const d = points.map((p, i) => {
    if (!i) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const mx = (prev.x + p.x) / 2
    return `C ${mx} ${prev.y} ${mx} ${p.y} ${p.x} ${p.y}`
  }).join(' ')
  return (
    <div className="rep-map">
      <svg viewBox="0 0 680 280" role="img" aria-label={`Sơ đồ ${tour.routeName}: ${stops.map((s) => s.name).join(', ')}`}>
        <rect width="680" height="280" rx="20" fill="var(--rep-sunk)" />
        <g fill="color-mix(in srgb, var(--rep-leaf) 22%, var(--rep-surface))">
          <rect x="30" y="26" width="130" height="80" rx="14" /><rect x="200" y="200" width="150" height="58" rx="14" /><rect x="420" y="30" width="120" height="70" rx="14" /><rect x="560" y="170" width="96" height="84" rx="14" />
        </g>
        <ellipse cx="300" cy="80" rx="54" ry="30" fill="color-mix(in srgb, #6fb7d1 30%, var(--rep-surface))" />
        <path d={d} fill="none" stroke="var(--rep-line-2)" strokeWidth="3" strokeDasharray="3 8" strokeLinecap="round" />
        <path id={`rep-map-${tour.id}`} className="rep-map-path" d={d} fill="none" stroke="#87b661" strokeWidth="4.5" strokeLinecap="round" pathLength={1000} />
        <g fontSize="13" fontWeight="700">
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={i ? 15 : 8} fill={i ? '#102d31' : 'var(--rep-ink-3)'} stroke="#d6f18d" strokeWidth={i ? 3 : 0} />
              {i > 0 && <text x={p.x} y={p.y + 5} fill="#d6f18d" textAnchor="middle">{i}</text>}
              <text x={p.x} y={p.y + (p.y > 150 ? 36 : -24)} fill="var(--rep-ink)" textAnchor="middle">{p.name}</text>
            </g>
          ))}
        </g>
        <circle r="9" fill="#d6f18d" stroke="#102d31" strokeWidth="3" className="rep-map-bot">
          <animateMotion dur="9s" begin="1.8s" repeatCount="indefinite"><mpath href={`#rep-map-${tour.id}`} /></animateMotion>
        </circle>
      </svg>
    </div>
  )
}
