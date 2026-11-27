import { ToneBadge } from './TechnicalUi'
import type { RobotReadiness } from './api/technical'
import { readinessView } from './robot-readiness'
import { setupText } from './technical-format'

export function ReadinessBadge({ readiness, mapText }: { readiness: Pick<RobotReadiness, 'state' | 'mapLabel'>; mapText?: string | null }) {
  const view = readinessView(readiness, mapText)
  return <ToneBadge tone={view.tone}>{view.label}</ToneBadge>
}

/**
 * The chip with its reason underneath. A robot that is not set up has a reason too (no map, connection not
 * confirmed); a ready robot has none. `mainLine` is the step to do, said first when the page knows it (1.1); the
 * server's reason then follows as the detail. `notDriving`: READY, but the robot itself reports it cannot drive yet (2.7).
 */
export function ReadinessSummary({ readiness, mapText, mainLine, notDriving = false }: { readiness: RobotReadiness; mapText?: string | null; mainLine?: string | null; notDriving?: boolean }) {
  return <><ReadinessBadge readiness={readiness} mapText={mapText} />
    {mainLine && <p className="mt-0.5 text-[12.5px] font-semibold text-amber-900">{mainLine}</p>}
    {readiness.state !== 'READY' && readiness.reason && <p className={`mt-0.5 text-[11.5px] ${mainLine ? 'text-[#64748b]' : 'text-amber-800'}`}>{readiness.reason}</p>}
    {readiness.state === 'READY' && notDriving && <p className="mt-0.5 text-[11.5px] text-amber-800">{setupText.readyNotDriving}</p>}</>
}
