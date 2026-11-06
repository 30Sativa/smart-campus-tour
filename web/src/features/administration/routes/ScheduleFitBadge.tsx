import { ToneBadge } from '../../technical/TechnicalUi'
import { scheduleFitLabel } from './route-messages'
import type { VersionedRoute } from './versioned-api'

/** docs/lich-tour-theo-ca.md §4: red when no shift can hold the route, amber when it is over the recommended length. */
export function ScheduleFitBadge({ route }: { route: Pick<VersionedRoute, 'scheduleFit' | 'expectedDurationSeconds'> }) {
  const label = scheduleFitLabel(route)
  return label ? <span title={label.detail}><ToneBadge tone={label.tone}>{label.text}</ToneBadge></span> : null
}
