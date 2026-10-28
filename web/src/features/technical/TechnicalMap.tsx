import { OCCUPANCY_MAPS } from '../administration/pois/map/catalog'
import { rosToImage } from '../administration/pois/map/occupancy-grid'
import type { PoiCheckState, TechnicalPoi } from './types'

const FILL: Record<PoiCheckState | 'preview', string> = { VERIFIED: '#1f7a55', PENDING: '#d69412', FAILED: '#b23e31', preview: '#7c3aed' }

export function MapLegend({ preview = false }: { preview?: boolean }) {
  const items: [string, string][] = [[FILL.VERIFIED, 'Đã xác minh'], [FILL.PENDING, 'Chờ xác minh'], [FILL.FAILED, 'Không đạt']]
  if (preview) items.push([FILL.preview, 'Sắp import'])
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748b]">
      {items.map(([color, label]) => <li key={label} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />{label}</li>)}
    </ul>
  )
}

type MapPoi = Pick<TechnicalPoi, 'id' | 'name' | 'x' | 'y'> & { state: PoiCheckState | 'preview' }

/**
 * Read-only view of a registered occupancy map with POIs drawn on it. The view
 * is cropped to the POIs of the map (`frame`), so a large mostly-unknown map
 * still shows the working area at a useful size.
 */
export function TechnicalMap({ mapKey, pois, frame, selectedId, onSelect, route, labels = true, className = '' }: {
  mapKey: string
  pois: MapPoi[]
  frame?: MapPoi[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** POI ids in visiting order, drawn as a dashed line. */
  route?: string[]
  labels?: boolean
  className?: string
}) {
  const map = OCCUPANCY_MAPS.find((item) => item.mapKey === mapKey)
  if (!map) {
    return <div className={`grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-6 text-center text-[13px] text-[#64748b] ${className}`}>Chưa có ảnh xem trước cho {mapKey}. Ảnh map được nạp khi có API kỹ thuật.</div>
  }
  const place = (poi: MapPoi) => ({ poi, at: rosToImage(map, poi) })
  const placed = pois.map(place)
  const bounds = (frame?.length ? frame : pois).map(place)
  let box = { u: 0, v: 0, w: map.width, h: map.height }
  if (bounds.length) {
    const us = bounds.map((p) => p.at.u), vs = bounds.map((p) => p.at.v)
    const pad = Math.max(map.width, map.height) * 0.08
    const u0 = Math.max(0, Math.min(...us) - pad), u1 = Math.min(map.width, Math.max(...us) + pad)
    const v0 = Math.max(0, Math.min(...vs) - pad), v1 = Math.min(map.height, Math.max(...vs) + pad)
    box = { u: u0, v: v0, w: Math.max(u1 - u0, map.width * 0.3), h: Math.max(v1 - v0, map.height * 0.3) }
  }
  const r = Math.max(box.w, box.h) / 70
  const line = route?.map((id) => placed.find((p) => p.poi.id === id)?.at).filter((p) => p != null)

  return (
    <svg viewBox={`${box.u} ${box.v} ${box.w} ${box.h}`} role="group" aria-label={`Bản đồ ${mapKey}`} className={`block h-auto w-full rounded-2xl border border-[#e2e8f0] bg-[#eef1f4] ${className}`} style={{ aspectRatio: `${box.w} / ${box.h}`, maxHeight: '70vh' }}>
      <image href={map.imageUrl} x={0} y={0} width={map.width} height={map.height} style={{ imageRendering: 'pixelated' }} aria-hidden="true" />
      {line && line.length > 1 && <polyline points={line.map((p) => `${p.u},${p.v}`).join(' ')} fill="none" stroke="#2d719e" strokeWidth={r * 0.45} strokeDasharray={`${r * 1.2} ${r * 0.9}`} strokeLinejoin="round" aria-hidden="true" />}
      {placed.map(({ poi, at }) => {
        const selected = poi.id === selectedId
        const mark = (
          <>
            {selected && <circle cx={at.u} cy={at.v} r={r * 1.9} fill="#2d719e" opacity={0.22} />}
            <circle cx={at.u} cy={at.v} r={selected ? r * 1.2 : r} fill={FILL[poi.state]} stroke="#fff" strokeWidth={r * 0.45} />
            {labels && <text x={at.u} y={at.v + r * 3} textAnchor="middle" fontSize={r * 1.7} fontWeight={600} fill="#0f172a" stroke="#fff" strokeWidth={r * 0.5} paintOrder="stroke">{poi.name}</text>}
          </>
        )
        if (!onSelect || poi.state === 'preview') return <g key={poi.id} aria-hidden="true">{mark}</g>
        return (
          <g key={poi.id} role="button" tabIndex={0} aria-label={`Xác minh ${poi.name}`} aria-pressed={selected} className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-[#2d719e]"
            onClick={() => onSelect(poi.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(poi.id) } }}>
            {mark}
          </g>
        )
      })}
    </svg>
  )
}
