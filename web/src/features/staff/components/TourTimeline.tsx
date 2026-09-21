import { Check, Flag, MapPinned, SkipForward } from 'lucide-react'
import type { RouteStop, TourOperation } from '../../../api/contracts/staff'
import { formatTime } from '../formatters'
import { stepLabel } from '../status'

/**
 * The route as a timeline: start, each POI (with its dwell and head angles),
 * and the leg back to the end point, which is a real leg (scope §4.3).
 *
 * Selecting a stop only selects it - for the twin and the detail below. The
 * route is the server's; nothing here re-orders or re-targets navigation.
 */
export function TourTimeline({ tour, selectedId, onSelect, compact = false }: {
  tour: Pick<TourOperation, 'stops' | 'endPoint' | 'progress' | 'state' | 'startedAt'>
  selectedId?: string | null
  onSelect?: (stopId: string) => void
  compact?: boolean
}) {
  const step = tour.progress?.step
  const returning = step === 'ReturningToEnd'
  const finished = tour.state === 'Completed'
  return (
    <ol className="relative" aria-label="Lộ trình">
      <Cap label="Xuất phát" sub={tour.endPoint.name} reached={Boolean(tour.startedAt)} />
      {tour.stops.map((stop, index) => (
        <StopRow key={stop.id} stop={stop} index={index} step={tour.progress?.stopIndex === index ? step : undefined} selected={selectedId === stop.id} onSelect={onSelect} compact={compact} />
      ))}
      <Cap label="Về điểm kết thúc" sub={returning ? `Đang về ${tour.endPoint.name}` : finished ? `Đã dừng tại ${tour.endPoint.name}` : tour.endPoint.name} reached={finished} active={returning} last />
    </ol>
  )
}

function Cap({ label, sub, reached, active = false, last = false }: { label: string; sub: string; reached: boolean; active?: boolean; last?: boolean }) {
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!last && <Rail done={reached} />}
      <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full ${reached ? 'bg-[#1f314d] text-white' : active ? 'bg-[#5b91ed] text-white' : 'border-2 border-[#d5dfec] bg-white text-[#a8b6c9]'}`} aria-hidden="true">
        <Flag size={12} />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className={`block text-[13px] font-bold ${active ? 'text-[#1f314d]' : 'text-[#40546f]'}`}>{label}</span>
        <span className="block truncate text-xs text-[#8a98ac]">{sub}</span>
      </span>
    </li>
  )
}

function Rail({ done }: { done: boolean }) {
  return <span aria-hidden="true" className={`absolute top-7 bottom-0 left-[13px] w-0.5 transition-colors duration-500 ${done ? 'bg-[#5b91ed]' : 'bg-[#e1e8f2]'}`} />
}

function StopRow({ stop, index, step, selected, onSelect, compact }: { stop: RouteStop; index: number; step?: string; selected: boolean; onSelect?: (id: string) => void; compact: boolean }) {
  const current = stop.status === 'Current'
  const done = stop.status === 'Completed'
  const skipped = stop.status === 'Skipped'
  const marker = done ? (
    <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-[#2f8f6b] text-white"><Check size={14} strokeWidth={3} /></span>
  ) : skipped ? (
    <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-[#eef2f8] text-[#8a98ac]"><SkipForward size={13} /></span>
  ) : current ? (
    <span className="relative z-10 grid size-7 shrink-0 place-items-center">
      <span className="absolute inset-0 animate-ping rounded-full bg-[#5b91ed]/30 [animation-duration:2.4s] motion-reduce:hidden" />
      <span className="relative grid size-7 place-items-center rounded-full bg-[#5b91ed] text-white"><MapPinned size={13} /></span>
    </span>
  ) : (
    <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 border-[#d5dfec] bg-white text-[11px] font-bold text-[#8a98ac]">{index + 1}</span>
  )

  const meta = [
    stop.arrivedAt ? `Tới ${formatTime(stop.arrivedAt)}` : null,
    `Dừng ${stop.dwellSeconds}s`,
    stop.visits > 1 ? `${stop.visits} lượt dừng` : null,
  ].filter(Boolean).join(' · ')

  const content = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <span className={`truncate text-[14px] ${current ? 'font-extrabold text-[#1f314d]' : done ? 'font-semibold text-[#40546f]' : 'font-semibold text-[#71819a]'} ${skipped ? 'line-through decoration-[#b9c6d8]' : ''}`}>{stop.name}</span>
        {current && step && <span className="shrink-0 rounded-full bg-[#eaf4ff] px-2 py-0.5 text-[10px] font-bold text-[#2f62b8]">{stepLabel(step)}</span>}
      </span>
      {!compact && (
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#8a98ac]">
          <span>{meta}</span>
          <span className="flex gap-1" aria-label={`Góc quan sát: ${stop.headSteps.join(', ')}`}>
            {stop.headSteps.map((preset, i) => <span key={`${preset}-${i}`} className="rounded bg-[#f1f5fb] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#647793]">{preset}</span>)}
          </span>
        </span>
      )}
    </>
  )

  return (
    <li className="relative flex gap-3 pb-3">
      <Rail done={done || skipped} />
      {marker}
      {onSelect ? (
        <button type="button" onClick={() => onSelect(stop.id)} aria-pressed={selected} className={`-mt-1 min-w-0 flex-1 rounded-lg px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f8df7] ${selected ? 'bg-[#eaf4ff]' : current ? 'bg-[#f5f9ff] hover:bg-[#eaf4ff]' : 'hover:bg-[#f5f8fd]'}`}>
          {content}
        </button>
      ) : (
        <span className="min-w-0 flex-1 pt-0.5">{content}</span>
      )}
    </li>
  )
}
