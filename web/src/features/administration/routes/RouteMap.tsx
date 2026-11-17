import { buttonClass } from '../../../components/ui/ui-classes'
import { fitView, type FittedView } from '../pois/map/fit-view'
import { rosToImage, type RosPoint } from '../pois/map/occupancy-grid'
import { useMapRaster } from '../pois/map/use-map-raster'
import { ZoomableMap } from '../pois/map/ZoomableMap'

export type RouteMapPoint = RosPoint & { id: string; name: string }

const STOP = '#173b5f'
const CANDIDATE = '#94a3b8'
const START = '#15803d'
const END = '#b45309'

/** White symbol in an 18×18 box: a flag for the start, a ringed dot (the finish) for the end. */
function MarkerGlyph({ kind }: { kind: 'start' | 'end' }) {
  return kind === 'start'
    ? <path d="M6 14V4.5M6 4.5h6.5l-1.6 2.25 1.6 2.25H6" fill="#fff" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    : <><circle cx={9} cy={9} r={4.2} fill="none" stroke="#fff" strokeWidth={1.5} /><circle cx={9} cy={9} r={1.7} fill="#fff" /></>
}

/** The same marker, small, for the legend under the map. */
function LegendMarker({ kind, fill }: { kind: 'start' | 'end'; fill: string }) {
  return <svg aria-hidden="true" viewBox="0 0 18 18" className="size-3.5 shrink-0"><rect width={18} height={18} rx={4} fill={fill} /><MarkerGlyph kind={kind} /></svg>
}

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
  const fitted = fitView(map, [...path, ...candidates.map(at)])
  // "Quay về điểm bắt đầu" ends on the start itself: the line closes there and no second flag hides it.
  const endFlag = end && !(start && end.x === start.x && end.y === start.y) ? end : null
  const draw = (view: FittedView) => {
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
    // Start and end carry a drawn symbol, never a letter: a letter reads as a POI of that name (WF-A test, POI "B").
    const flag = (point: RosPoint, text: 'Điểm bắt đầu' | 'Điểm kết thúc', fill: string) => {
      const { u: x, v: y } = at(point)
      return <g aria-label={text}>
        <rect x={x - 9 * u} y={y - 9 * u} width={18 * u} height={18 * u} rx={4 * u} fill={fill} stroke="#fff" strokeWidth={2.5 * u} />
        <g transform={`translate(${x - 9 * u} ${y - 9 * u}) scale(${u})`}><MarkerGlyph kind={text === 'Điểm bắt đầu' ? 'start' : 'end'} /></g>
      </g>
    }
    return <>
      {path.length > 1 && <polyline points={path.map(point => `${point.u},${point.v}`).join(' ')} fill="none" stroke={STOP} strokeOpacity={0.55} strokeWidth={2.5 * u} strokeDasharray={`${6 * u} ${4 * u}`} strokeLinejoin="round" />}
      {candidates.map(point => pin(point, '', CANDIDATE, false))}
      {start && flag(start, 'Điểm bắt đầu', START)}
      {endFlag && flag(endFlag, 'Điểm kết thúc', END)}
      {stops.map((point, index) => pin(point, String(index + 1), STOP, true))}
    </>
  }
  return <figure className="min-w-0">
    <ZoomableMap key={map.imageUrl} map={map} fitted={fitted} className="h-64 sm:h-72" role="group" label="Lộ trình trên bản đồ">{draw}</ZoomableMap>
    <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748b]">
      {start && <span className="inline-flex items-center gap-1.5"><LegendMarker kind="start" fill={START} />Điểm bắt đầu</span>}
      {stops.length > 0 && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-full bg-[#173b5f]" />Điểm dừng theo thứ tự</span>}
      {endFlag && <span className="inline-flex items-center gap-1.5"><LegendMarker kind="end" fill={END} />Điểm kết thúc</span>}
      {candidates.length > 0 && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="size-2.5 rounded-full bg-[#94a3b8]" />POI đạt, chưa chọn</span>}
      {path.length > 1 && <span>Đường nối chỉ thứ tự đi, không phải đường robot chạy.</span>}
    </figcaption>
  </figure>
}
