import { useState } from 'react'
import { Link } from 'react-router'
import { formatSlot } from '../admin-format'
import { tourStateLabel } from '../tours/tour-messages'
import type { RouteScheduledTour } from './versioned-api'

/** Links to those Tours, with their time and state. */
export function RouteScheduledToursList({ tours }: { tours: RouteScheduledTour[] }) {
  const [now] = useState(() => Date.now())
  return <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">{tours.map(tour => <li key={tour.id}>
    <Link to={`/staff/manage/tours/${tour.id}`} className="text-[#2d719e] hover:underline">{tour.name}</Link>{' '}
    <span className="text-xs opacity-80">· {formatSlot(tour.scheduledStartAt)} · {tourStateLabel(tour, now)}</span>
  </li>)}</ul>
}
