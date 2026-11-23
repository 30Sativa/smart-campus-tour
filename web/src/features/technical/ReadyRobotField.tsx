import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { formatDateTime } from '../../components/ui/date-time'
import { buttonClass, labelClass } from '../../components/ui/ui-classes'
import { DeployToRobotDialog } from './DeployToRobotDialog'
import type { MapVersion, PhysicalRobotOption } from './api/technical'
import { robotForMap, robotSetupPath } from './robot-readiness'
import { errorText } from './technical-format'

/** "{area} · {key} · v{n}": the read-only robot line always names the map exactly. */
const exactMapLabel = (map: Pick<MapVersion, 'areaName' | 'areaKey' | 'versionNumber'>) => `${map.areaName} · ${map.areaKey} · v${map.versionNumber}`

/**
 * The robot a POI check or a route test is recorded with. It is not chosen: one area holds one robot, and only the
 * robot the server calls ready on this exact version may record a result. When there is none, the form says why
 * and offers the one place that fixes it.
 */
export function ReadyRobotField({ robots, mapVersionId, map }: {
  robots: UseQueryResult<PhysicalRobotOption[]>; mapVersionId: string
  /** The version the POI or route is on, for the label; the robot's own readiness label is used while it loads. */
  map?: Pick<MapVersion, 'areaName' | 'areaKey' | 'versionNumber'>
}) {
  const [deploying, setDeploying] = useState(false)
  const { ready, assigned } = robotForMap(robots.data, mapVersionId)
  const refresh = !robots.isPending && !robots.isError && <button type="button" className={buttonClass('secondary', 'sm')} disabled={robots.isFetching} onClick={() => void robots.refetch()}><RefreshCw size={13} aria-hidden="true" />{robots.isFetching ? 'Đang cập nhật…' : 'Cập nhật trạng thái'}</button>
  const mapText = map ? exactMapLabel(map) : ready?.readiness.mapLabel ?? 'bản đồ này'
  return (
    <div>
      <div className="flex items-end justify-between gap-2"><span className={labelClass}>Robot vật lý</span>{refresh}</div>
      {robots.isPending ? <p role="status" className="mt-1 text-sm text-[#64748b]">Đang tải danh sách robot…</p>
        : robots.isError ? <div role="alert" className="mt-1 text-sm text-[#b23e18]"><p>{errorText(robots.error)}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={() => void robots.refetch()}>Tải lại danh sách robot</button></div>
        : ready ? <p className="mt-1 rounded-lg bg-[#f0fdf4] px-3 py-2 text-[13px] text-[#166534]">
          Robot: <span className="font-semibold">{ready.robotCode}</span> · sẵn sàng trên {mapText}{ready.readiness.deploymentCheckedAt ? ` (kiểm tra triển khai ${formatDateTime(ready.readiness.deploymentCheckedAt)})` : ''}
        </p>
        : assigned ? <div role="status" className="mt-1 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <p>{assigned.readiness?.reason ?? `Robot ${assigned.robotCode} chưa sẵn sàng trên bản đồ này.`}</p>
          <Link className={buttonClass('secondary', 'sm')} to={robotSetupPath(assigned.id)}>Mở thiết lập {assigned.robotCode}</Link>
        </div>
        : <div role="status" className="mt-1 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <p>Chưa có robot nào chạy bản đồ này.</p>
          <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => setDeploying(true)}>Gán robot cho bản đồ này</button>
        </div>}
      {deploying && <DeployToRobotDialog mapVersionId={mapVersionId} mapLabel={mapText} onClose={() => setDeploying(false)} />}
    </div>
  )
}
