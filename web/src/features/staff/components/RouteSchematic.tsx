import { ArrowUpRight, Bot, MapPinned } from 'lucide-react'
import { Link } from 'react-router'
import type { AmrStatus, TourOperation } from '../../../api/contracts/staff'

/** Ordered POI diagram for the live console. The rail shows sequence, not a Nav2 trajectory. */
export function RouteSchematic({ tour, robot, selectedStopId, onSelect }: {
  tour: TourOperation
  robot?: AmrStatus
  selectedStopId?: string | null
  onSelect: (id: string) => void
}) {
  const currentIndex = tour.progress?.stopIndex ?? null
  const isReturning = tour.progress?.step === 'ReturningToEnd'
  return (
    <section className="relative flex min-h-[430px] flex-col overflow-hidden rounded-[20px] border border-[#d9e9f5] bg-[#f5faff]" aria-label="Sơ đồ tuyến vận hành">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(#d9e9f5_1px,transparent_1px),linear-gradient(90deg,#d9e9f5_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="relative flex flex-wrap items-center justify-between gap-2 p-4">
        <span className="inline-flex items-center gap-2 rounded-lg border border-[#d3e7f4] bg-white px-3 py-2 text-[11px] font-bold text-[#285c7d]"><MapPinned size={15} aria-hidden="true" />Sơ đồ tuyến · {robot?.source ?? 'Chưa rõ nguồn'}</span>
        <span className="rounded-lg border border-[#d3e7f4] bg-white px-3 py-2 text-[11px] font-bold text-[#285c7d]">{tour.stops.length} POI · {tour.code}</span>
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-5 px-5 py-7 sm:px-8">
        <div className="flex items-center gap-2 text-sm font-bold text-[#173b59]"><Bot size={18} aria-hidden="true" />{robot?.name ?? 'Chưa gán robot'}<span className="text-xs font-medium text-[#758ea0]">· {robot?.executionState ?? 'Chưa rõ trạng thái'}</span></div>
        <ol className="flex min-w-0 gap-0 overflow-x-auto pb-3" aria-label="Các POI theo thứ tự">
          {tour.stops.map((stop, index) => {
            const current = index === currentIndex && tour.state === 'Running' && !isReturning
            const done = stop.status === 'Completed'
            const selected = selectedStopId === stop.id
            return (
              <li key={stop.id} className="relative min-w-[100px] flex-1 sm:min-w-[138px]">
                {index < tour.stops.length - 1 && <span aria-hidden="true" className={`absolute top-[21px] left-11 right-0 h-1 ${done ? 'bg-[#7db9db]' : 'bg-[#c9dfee]'}`} />}
                <button type="button" onClick={() => onSelect(stop.id)} aria-pressed={selected} className="relative z-10 flex w-full flex-col items-start gap-3 rounded-xl p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">
                  <span className={`grid size-10 place-items-center rounded-full border-[5px] border-[#f5faff] text-xs font-extrabold shadow-[0_4px_15px_#39799e2b] ${current ? 'bg-[#347ea9] text-white' : done ? 'bg-[#aadcf6] text-[#285c7d]' : 'bg-[#d5eaf8] text-[#3d789d]'}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={`line-clamp-2 text-xs font-bold ${selected || current ? 'text-[#28739f]' : 'text-[#527b98]'}`}>{stop.name}</span>
                  <span className="text-[10px] text-[#8a9fb0]">{current ? 'Điểm hiện tại' : done ? 'Đã qua' : 'Sắp tới'}</span>
                </button>
              </li>
            )
          })}
        </ol>
        {tour.stops.length === 0 && <p className="text-sm text-[#738da2]">Chưa có POI trong tuyến.</p>}
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-[#d9e9f5] bg-white/70 p-4 text-[11px] text-[#5c7b91]">
        <span>Nguồn: {robot?.source ?? '—'} · Pose: {robot?.poseAgeSeconds == null ? 'chưa có' : `${robot.poseAgeSeconds.toFixed(1)} giây`}</span>
        <Link to="/staff/digital-twin" className="inline-flex items-center gap-1 font-bold text-[#2d78a9] hover:underline">Mở Digital Twin 3D<ArrowUpRight size={13} aria-hidden="true" /></Link>
      </div>
    </section>
  )
}
