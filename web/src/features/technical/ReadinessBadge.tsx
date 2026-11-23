import { ToneBadge } from './TechnicalUi'
import type { RobotReadiness } from './api/technical'
import { readinessView } from './robot-readiness'

export function ReadinessBadge({ readiness }: { readiness: Pick<RobotReadiness, 'state' | 'mapLabel'> }) {
  const view = readinessView(readiness)
  return <ToneBadge tone={view.tone}>{view.label}</ToneBadge>
}

/**
 * The chip with its reason underneath. A robot that is not set up has a reason too (no map, connection not
 * confirmed); a ready robot has none.
 */
export function ReadinessSummary({ readiness }: { readiness: RobotReadiness }) {
  return <><ReadinessBadge readiness={readiness} />{readiness.state !== 'READY' && readiness.reason && <p className="mt-0.5 text-[11.5px] text-amber-800">{readiness.reason}</p>}</>
}
