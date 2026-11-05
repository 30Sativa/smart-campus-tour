import { useId } from 'react'
import type { RepresentativeTour } from '../api/types'

/** Only server-provided stop order is known; no invented spatial map. */
export function RouteMap({ tour }: { tour: RepresentativeTour }) {
  const titleId = useId()
  const stops = [...tour.stops].sort((a, b) => a.order - b.order)
  return <section className="rep-section" aria-labelledby={titleId}>
    <div className="rep-section-head"><h2 id={titleId}>Các điểm dừng</h2><span className="rep-muted">{tour.routeName}</span></div>
    {stops.length ? <ol className="rep-stops">{stops.map(stop => <li key={stop.order}>
      <b className="num" aria-hidden="true">{String(stop.order).padStart(2, '0')}</b>
      <div><h3>{stop.name}</h3>{stop.description && <p>{stop.description}</p>}</div>
    </li>)}</ol> : <p className="rep-hint">Chưa có thông tin điểm dừng cho buổi tham quan này.</p>}
  </section>
}
