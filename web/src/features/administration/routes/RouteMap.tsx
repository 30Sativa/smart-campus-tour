import { buttonClass } from '../../../components/ui/ui-classes'
import { fitView } from '../pois/map/fit-view'
import { rosToImage, type RosPoint } from '../pois/map/occupancy-grid'
import { useMapRaster } from '../pois/map/use-map-raster'

export type RouteMapPoint = RosPoint & { id: string; name: string }

const STOP = '#173b5f'
const CANDIDATE = '#94a3b8'
const START = '#15803d'
const END = '#b45309'

/**
 * A small map of a route, drawn the way the POI map draws its points: start, the numbered stops and the end,
 * joined by straight lines in the order the robot goes. The lines show order, not the path Nav2 will drive.
 * With `onToggle`, the passed POIs not yet chosen show in grey and a point chooses or drops its stop.
 */
export function RouteMap({ mapVersionId, stops, start, end, candidates = [], onToggle }: {
  mapVersionId: string; stops: RouteMapPoint[]; start?: RosPoint | null
  /** Where the route ends when it is not the last stop. */
  end?: RosPoint | null
  candidates?: RouteMapPoint[]; onToggle?: (id: string) => void
}) {
  const { map, error, retry } = useMapRaster(mapVersionId)
  if (error) return <div role="alert" className="grid min-h-48 place-items-center gap-2 rounded-xl bg-[#f8fafc] p-4 text-center text-sm text-[#64748b]"><p>{error}</p><button type="button" className={buttonClass('secondary', 'sm')} onClick={retry}>Thử lại</button></div>
  if (!map) return <p aria-busy="true" className="grid min-h-48 place-items-center rounded-xl bg-[#f8fafc] text-sm text-[#64748b]">Đang tải bản đồ…</p>
  const at = (point: RosPoint) => rosToImage(map, point)
  const path = [start, ...stops, end].filter((point): point is RosPoint => point != null).map(at)
  const view = fitView(map, [...path, ...candidates.map(at)])
  // "Quay về điểm bắt đầu" ends on the start itself: the line closes there and no second flag hides it.
  const endFlag = end && !(start && end.x === start.x && end.y === start.y) ? end : null
  // This frame is about half the POI map's height, so markers get a larger unit to read the same size.
  const u = view.unit * 1.7
  const pin = (point: RouteMapPoint, label: string, fill: string, chosen: boolean) => {
    const { u: x, v: y } = at(point)
    const select = onToggle ? () => onToggle(point.id) : undefined
    return <g key={point.id} role={select ? 'button' : undefined} tabIndex={select ? 0 : undefined} aria-pressed={select ? chosen : undefined}
      aria-label={select ? `${chosen ? 'Bỏ chọn' : 'Chọn'} ${point.name}` : `${label}. ${point.name}`} onClick={select}
      onKeyDown={select ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } } : undefined}
      className={select ? 'cursor-pointer focus:outline-none' : undefined}>
      <title>{point.name}</title>
      <circle cx={x} cy={y} r={11 * u} fill={fill} stroke="#fff" strokeWidth={2.5 * u} />
      {label && <text x={x} y={y + 4.5 * u} textAnchor="middle" fontSize={12.5 * u} fontWeight={700} fill="#fff">{label}</text>}
    </g>
  }
  const flag = (point: RosPoint, text: string, fill: string) => {
    const { u: x, v: y } = at(point)
    return <g aria-label={text}>
      <rect x={x - 9 * u} y={y - 9 * u} width={18 * u} height={18 * u} rx={4 * u} fill={fill} stroke="#fff" strokeWidth={2.5 * u} />
      <text x={x} y={y + 4.5 * u} textAnchor="middle" fontSize={11 * u} fontWeight={700} fill="#fff">{text === 'Điểm bắt đầu' ? 'B' : 'K'}</text>
    </g>
  }
  return <figure className="min-w-0">
    <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} className="block h-64 w-full rounded-xl bg-[#eef2f6] sm:h-72" role="group" aria-label="Lộ trình trên bản đồ">
      <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: 'pixelated' }} opacity={0.9} />
      {path.length > 1 && <polyline points={path.map(point => `${point.u},${point.v}`).join(' ')} fill="none" stroke={STOP} strokeOpacity={0.55} strokeWidth={2.5 * u} strokeDasharray={`${6 * u} ${4 * u}`} strokeLinejoin="round" />}
      {candidates.map(point => pin(point, '', CANDIDATE, false))}
      {start && flag(start, 'Điểm bắt đầu', START)}
      {endFlag && flag(endFlag, 'Điểm kết thúc', END)}
      {stops.map((point, index) => pin(point, String(index + 1), STOP, true))}
    </svg>
    <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748b]">
      {start && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-[3px] bg-[#15803d]" />B: điểm bắt đầu</span>}
      {stops.length > 0 && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-full bg-[#173b5f]" />Điểm dừng theo thứ tự</span>}
      {endFlag && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-[3px] bg-[#b45309]" />K: điểm kết thúc</span>}
      {candidates.length > 0 && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-full bg-[#94a3b8]" />POI đạt, chưa chọn</span>}
      {path.length > 1 && <span>Đường nối chỉ thứ tự đi, không phải đường robot chạy.</span>}
    </figcaption>
  </figure>
}
