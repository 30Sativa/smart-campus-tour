import type { UseQueryResult } from '@tanstack/react-query'
import { Check, RefreshCw, X } from 'lucide-react'
import { Link } from 'react-router'
import { formatDateTime } from '../../components/ui/date-time'
import { buttonClass, labelClass } from '../../components/ui/ui-classes'
import type { MapVersion, PhysicalRobotOption } from './api/technical'
import { robotForMap, robotSetupPath } from './robot-readiness'
import { useAllMapVersions } from './technical-hooks'
import { errorText, robotFieldText } from './technical-format'

/** "{area} · {key} · v{n}": the read-only robot line always names the map exactly. */
const exactMapLabel = (map: Pick<MapVersion, 'areaName' | 'areaKey' | 'versionNumber'>) => `${map.areaName} · ${map.areaKey} · v${map.versionNumber}`
const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && a!.normalize('NFC').trim().toLocaleLowerCase('vi') === b!.normalize('NFC').trim().toLocaleLowerCase('vi')

/**
 * The robot a POI check or a route test is recorded with. It is not chosen: one area holds one robot, and only the
 * robot the server calls ready on this exact version may record a result. When there is none, the form lists what is
 * done and what is next for this map, and every way to the robot page carries `returnTo` so it can come back here.
 */
export function ReadyRobotField({ robots, mapVersionId, map, subject, returnTo, onAssignRobot }: {
  robots: UseQueryResult<PhysicalRobotOption[]>; mapVersionId: string
  /** The version the POI or route is on, for the label; the robot's own readiness label is used while it loads. */
  map?: Pick<MapVersion, 'areaName' | 'areaKey' | 'versionNumber' | 'mapKey'>
  /** What the form records, as people read it in "khác bản đồ của POI này". */
  subject: 'POI' | 'tuyến'
  /** Where the robot page goes back to: this form, reopened. */
  returnTo: string
  /**
   * "Gán robot cho bản đồ này". The page closes the form and opens `DeployToRobotDialog` itself: rendered here it sat
   * inside the form's <form>, and Chrome stops a nested form's submit before React's root listener sees it, so
   * "Tiếp tục" reloaded the page instead of opening the robot setup. `preselectRobotId` is the robot running the
   * same-named area, the usual one to move.
   */
  onAssignRobot: (mapLabel: string, preselectRobotId?: string) => void
}) {
  const maps = useAllMapVersions()
  const { ready, assigned } = robotForMap(robots.data, mapVersionId)
  const refresh = !robots.isPending && !robots.isError && <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>
  const mapText = map ? exactMapLabel(map) : ready?.readiness.mapLabel ?? 'bản đồ này'
  // Two areas may share a name ("Tầng 6"); a robot on the other one is the usual reason none runs this map.
  const elsewhere = map && !assigned ? robots.data?.find(robot => !robot.deactivatedAt && robot.assignedMapVersionId && robot.assignedMapVersionId !== mapVersionId && sameName(robot.assignedAreaName, map.areaName)) : undefined
  const elsewhereMap = elsewhere && maps.data?.find(item => item.map.id === elsewhere.assignedMapVersionId)?.map
  const elsewhereText = elsewhere && (elsewhereMap ? exactMapLabel(elsewhereMap) : `${elsewhere.assignedAreaName} · ${elsewhere.assignedMapKey} · v${elsewhere.assignedVersionNumber}`)
  return (
    <div>
      <div className="flex items-end justify-between gap-2"><span className={labelClass}>Robot vật lý</span>{refresh}</div>
      {robots.isPending ? <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách robot…</p>
        : robots.isError ? <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div>
        : ready ? <p className="mt-1 rounded-lg bg-[#f0fdf4] px-3 py-2 text-[13px] text-[#166534]">
          Robot: <span className="font-semibold">{ready.robotCode}</span> · sẵn sàng trên {mapText}{ready.readiness.deploymentCheckedAt ? ` (kiểm tra triển khai ${formatDateTime(ready.readiness.deploymentCheckedAt)})` : ''}
        </p>
        : assigned ? <NotReadyChecklist robot={assigned} mapKey={map?.mapKey ?? assigned.assignedMapKey ?? ''} returnTo={returnTo} />
        : <div role="status" className="mt-1 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <p>{robotFieldText.noRobot}</p>
          {elsewhere && map && <p>{robotFieldText.otherMap(elsewhere.robotCode, elsewhereText!, subject, exactMapLabel(map))}</p>}
          <div className="space-y-1">
            <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => onAssignRobot(mapText, elsewhere?.id)}>Gán robot cho bản đồ này</button>
            <p className="text-xs">{robotFieldText.assignConsequence}</p>
          </div>
          <p className="text-xs">{subject === 'POI' ? robotFieldText.wrongMapPoi : robotFieldText.wrongMapRoute}</p>
        </div>}
    </div>
  )
}

/** The robot holds this map but is not ready: three lines for this map, and one button for the server's next step. */
function NotReadyChecklist({ robot, mapKey, returnTo }: { robot: PhysicalRobotOption; mapKey: string; returnTo: string }) {
  const wrongMap = robot.connectionStatus === 'WRONG_MAP' ? robot.lastRejectedReport : null
  const reporting = robot.readiness?.reportingOnAssignedMap === true
  const next = robot.readiness?.nextStep
  const lines: Array<{ label: string; done: boolean; note?: string }> = [
    { label: robotFieldText.assignedLine(robot.robotCode, formatDateTime(robot.mapAssignedAt)), done: true },
    { label: robotFieldText.reportingLine(mapKey), done: reporting, note: !reporting && wrongMap ? robotFieldText.reportingWrongMap(wrongMap.mapKey) : undefined },
    // Not ready while holding this map means no passing check here: a pass needs a confirmed, reporting robot.
    { label: robotFieldText.deploymentLine, done: false },
  ]
  return (
    <div role="status" className="mt-1 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <ul aria-label={`Chuẩn bị ${robot.robotCode}`} className="space-y-0.5">
        {lines.map(line => <li key={line.label} className="flex items-start gap-1.5">
          {line.done ? <Check size={14} className="mt-0.5 shrink-0 text-[#166534]" aria-hidden="true" /> : <X size={14} className="mt-0.5 shrink-0 text-[#b23e31]" aria-hidden="true" />}
          <span><span className="sr-only">{line.done ? 'Xong: ' : 'Chưa xong: '}</span>{line.label}{line.note && <span className="text-[#b23e31]"> ({line.note})</span>}</span>
        </li>)}
      </ul>
      <Link className={buttonClass('secondary', 'sm')} to={robotSetupPath(robot.id, undefined, returnTo)}>{next ? robotFieldText.nextStep[next](robot.robotCode) : robotFieldText.openSetup(robot.robotCode)}</Link>
    </div>
  )
}
