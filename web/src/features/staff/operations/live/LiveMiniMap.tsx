import { Link } from 'react-router'
import { fitView } from '../../../administration/pois/map/fit-view'
import { rosToImage, type RosPoint } from '../../../administration/pois/map/occupancy-grid'
import { useMapRaster } from '../../../administration/pois/map/use-map-raster'
import type { TourDetails } from '../../../administration/tours/types'
import { useFleetRobot } from '../fleet-telemetry'

const STOP = '#173b5f'
const CURRENT = '#2563eb'
const ROBOT = '#dc2626'

const sameId = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/**
 * A small, still map of the Tour's route on its uploaded map version (the raster
 * the route screens draw), with the stop the Tour is at or heading to and the
 * robot's own reported position. The whole map opens the Digital Twin.
 */
export function LiveMiniMap({ detail }: { detail: TourDetails }) {
  const revision = detail.routeRevision
  const { robot } = useFleetRobot(detail.reservation?.robotCode)
  const { map, error } = useMapRaster(revision?.mapVersionId)
  const currentId = detail.tour.state === 'RUNNING' ? detail.execution?.currentRevisionStopId : null
  const current = revision?.stops.find(stop => sameId(stop.id, currentId)) ?? null
  // The robot's pose is drawn only on the map it says it is on.
  const pose = robot?.pose && revision && robot.mapKey === revision.mapKey ? robot.pose : null

  const caption = <p className="mt-2 text-xs text-muted">
    {current ? `Điểm dừng hiện tại: ${current.stopOrder}. ${current.name}. ` : ''}
    {!robot?.pose ? 'Robot chưa báo vị trí.' : !pose ? 'Robot báo vị trí trên bản đồ khác.' : robot.poseFresh ? '' : 'Vị trí robot đã cũ.'}
  </p>

  let body
  if (!revision) body = <p className="grid h-44 place-items-center rounded-xl bg-[#f8fafc] p-4 text-center text-[13px] text-muted">Tour này không có tuyến trên bản đồ.</p>
  else if (error) body = <p className="grid h-44 place-items-center rounded-xl bg-[#f8fafc] p-4 text-center text-[13px] text-muted">Không tải được bản đồ.</p>
  else if (!map) body = <p aria-busy="true" className="grid h-44 place-items-center rounded-xl bg-[#f8fafc] text-[13px] text-muted">Đang tải bản đồ…</p>
  else {
    const at = (point: RosPoint) => rosToImage(map, point)
    const start = { x: revision.startX, y: revision.startY }
    const path = [start, ...revision.stops].map(at)
    const robotAt = pose ? at(pose) : null
    const view = fitView(map, robotAt ? [...path, robotAt] : path)
    const u = view.unit * 1.7
    body = <svg role="img" aria-label="Bản đồ nhỏ vị trí robot và điểm dừng" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} className="block h-44 w-full rounded-xl bg-[#eef2f6]">
      <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: 'pixelated' }} opacity={0.9} />
      {path.length > 1 && <polyline points={path.map(point => `${point.u},${point.v}`).join(' ')} fill="none" stroke={STOP} strokeOpacity={0.5} strokeWidth={2 * u} strokeDasharray={`${5 * u} ${4 * u}`} />}
      {revision.stops.map(stop => {
        const point = at(stop)
        const isCurrent = current === stop
        return <circle key={`${stop.stopOrder}-${stop.poiRevisionId}`} cx={point.u} cy={point.v} r={(isCurrent ? 10 : 7) * u} fill={isCurrent ? CURRENT : STOP} stroke="#fff" strokeWidth={2 * u} />
      })}
      {robotAt && <circle cx={robotAt.u} cy={robotAt.v} r={8 * u} fill={ROBOT} fillOpacity={robot?.poseFresh ? 1 : 0.45} stroke="#fff" strokeWidth={2.5 * u} />}
    </svg>
  }

  return (
    <Link to="/staff/digital-twin" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]" aria-label="Mở Digital Twin">
      {body}
      {revision && caption}
      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#dc2626]" />Robot</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#2563eb]" />Điểm dừng hiện tại</span>
      </span>
    </Link>
  )
}
