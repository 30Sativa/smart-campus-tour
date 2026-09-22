import { CircleCheck, Clock, Flag, Headphones, MapPin, TriangleAlert, Video } from 'lucide-react'
import type { AdminRoute } from '../../../api/contracts/admin'
import { HEAD_LABEL } from '../../staff/status'

/**
 * A prepared route, read-only (scope §3.1: "Admin chỉ chọn route, chưa có
 * route editor"). Order, dwell, view angles and narration come from the
 * technical team's config; nothing here edits a POI, a pose or an angle.
 *
 * The sketch places the points by their map coordinates and deliberately
 * draws no lines between them: the robot's real path is Nav2's, not a
 * straight segment (scope §11.3).
 */
export function RoutePreview({ route, compact = false }: { route: AdminRoute; compact?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-[#1e293b]">{route.name}</p>
          <p className="mt-0.5 text-sm leading-6 text-[#64748b]">{route.description}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef3fb] px-2.5 py-1 text-xs font-bold text-[#35507a]"><MapPin size={13} aria-hidden="true" />{route.stops.length} POI</span>
      </div>

      {route.valid ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2f7a5b]"><CircleCheck size={14} aria-hidden="true" />Cấu hình tuyến hợp lệ</p>
      ) : (
        <div className="rounded-xl border border-[#f1dcb0] bg-[#fffaf0] px-3.5 py-2.5 text-[13px] text-[#7d5310]" role="note">
          <p className="flex items-center gap-1.5 font-bold"><TriangleAlert size={14} aria-hidden="true" />Tuyến chưa dùng được</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{route.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          <p className="mt-1 text-xs">Nhóm kỹ thuật cần hoàn thiện cấu hình; Admin không sửa tuyến trên web.</p>
        </div>
      )}

      <div className={`grid gap-4 ${compact ? '' : 'lg:grid-cols-[minmax(0,1fr)_260px]'}`}>
        <ol className="space-y-2" aria-label={`Các điểm của ${route.name}`}>
          <Cap label="Xuất phát" name={route.startPoint.name} />
          {route.stops.map((stop) => (
            <li key={stop.id} className="flex gap-3 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#1e293b] text-xs font-bold text-white tabular-nums" aria-hidden="true">{stop.order}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#1e293b]"><span className="sr-only">POI {stop.order}: </span>{stop.name}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#64748b]">
                  <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" />Dừng {stop.dwellSeconds} giây</span>
                  <span className="inline-flex items-center gap-1"><Video size={12} aria-hidden="true" />Góc: {stop.headSteps.map((step) => HEAD_LABEL[step] ?? step).join(' → ')}</span>
                  <span className={`inline-flex items-center gap-1 ${stop.narration ? '' : 'font-bold text-[#b23e31]'}`}><Headphones size={12} aria-hidden="true" />{stop.narration ? 'Có thuyết minh' : 'Thiếu thuyết minh'}</span>
                </p>
              </div>
            </li>
          ))}
          <Cap label="Điểm kết thúc" name={route.endPoint?.name ?? 'Chưa cấu hình'} missing={!route.endPoint} />
        </ol>
        {!compact && <RouteSketch route={route} />}
      </div>
    </div>
  )
}

function Cap({ label, name, missing = false }: { label: string; name: string; missing?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-3 py-1">
      <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-[#d5dfec] bg-white text-[#64748b]" aria-hidden="true"><Flag size={12} /></span>
      <p className="text-[13px] text-[#64748b]"><span className="font-bold text-[#334155]">{label}:</span> <span className={missing ? 'font-bold text-[#b23e31]' : ''}>{name}</span></p>
    </li>
  )
}

function RouteSketch({ route }: { route: AdminRoute }) {
  const points = [route.startPoint.position, ...route.stops.map((stop) => stop.position), ...(route.endPoint ? [route.endPoint.position] : [])]
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const pad = 1.6
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad
  const maxY = Math.max(...ys) + pad
  // Map frame: y grows up, SVG y grows down.
  const at = (p: { x: number; y: number }) => ({ cx: p.x - minX, cy: maxY - p.y })
  return (
    <figure className="rounded-xl border border-[#e2e8f0] bg-[#f8fafd] p-3">
      <svg viewBox={`0 0 ${maxX - minX} ${maxY - minY}`} className="aspect-[4/3] w-full" role="img" aria-label={`Sơ đồ vị trí các điểm của ${route.name}`}>
        <defs>
          <pattern id="route-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#e3e9f2" strokeWidth="0.04" /></pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#route-grid)" />
        {(() => {
          const s = at(route.startPoint.position)
          return <rect x={s.cx - 0.45} y={s.cy - 0.45} width="0.9" height="0.9" rx="0.2" fill="#fff" stroke="#64748b" strokeWidth="0.12" />
        })()}
        {route.stops.map((stop) => {
          const p = at(stop.position)
          return (
            <g key={stop.id}>
              <circle cx={p.cx} cy={p.cy} r="0.55" fill="#1e293b" />
              <text x={p.cx} y={p.cy + 0.2} textAnchor="middle" fontSize="0.6" fontWeight="700" fill="#fff">{stop.order}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 text-[11px] leading-4 text-[#94a3b8]">Vị trí trên bản đồ (■ xuất phát/kết thúc). Không vẽ đường nối vì robot tự tìm đường giữa các điểm.</figcaption>
    </figure>
  )
}
