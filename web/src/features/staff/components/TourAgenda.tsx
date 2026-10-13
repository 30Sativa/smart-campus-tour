import { ChevronRight } from 'lucide-react'
import type { TourOperation } from '../../../api/contracts/staff'
import { groupSummary } from '../attention'
import { formatTime } from '../formatters'
import { clockLabel, minuteOfDay, timeHint, tourColor, tourNote, type TourNote } from '../today-board'
import { TourStateBadges } from './TourParts'

const NOTE_TONE: Record<TourNote['tone'], string> = {
  ok: 'text-[#15803d]',
  warn: 'text-[#b45309]',
  danger: 'text-[#b91c1c]',
  muted: 'text-[#64748b] font-medium',
}

/** POI progress of a running Tour as segments: done, current, still to come. */
function StopSegments({ tour }: { tour: TourOperation }) {
  if (!tour.stops.length) return null
  return (
    <span className="mt-2 flex max-w-80 gap-1" aria-hidden="true">
      {tour.stops.map((stop) => (
        <span
          key={stop.id}
          className={`h-[5px] flex-1 rounded-full ${
            stop.status === 'Completed' || stop.status === 'Skipped'
              ? 'bg-[#2563eb]'
              : stop.status === 'Current'
              ? 'bg-[linear-gradient(90deg,#2563eb_40%,#bfdbfe_40%)]'
              : 'bg-[#e2e8f0]'
          }`}
        />
      ))}
    </span>
  )
}

/**
 * Today's Tours in time order on a rail, with a "now" line between what has
 * started and what is still to come. Choosing a Tour opens it in the detail
 * panel; the Tour's own next step lives there.
 */
export function TourAgenda({ tours, now, selectedId, onSelect, showNow, label }: {
  tours: TourOperation[]
  now: number
  selectedId?: string
  onSelect: (id: string) => void
  showNow: boolean
  label: string
}) {
  const nowIndex = showNow ? tours.findIndex((tour) => new Date(tour.scheduledAt).getTime() > now) : -1
  return (
    <ul className="px-3 pt-2 pb-3" aria-label={label}>
      {tours.map((tour, index) => {
        const groups = groupSummary(tour)
        const note = tourNote(tour)
        const selected = tour.id === selectedId
        const hint = timeHint(tour, now)
        return [
          index === nowIndex ? (
            <li key="now" aria-label={`Bây giờ ${clockLabel(minuteOfDay(now))}`} className="flex items-center gap-2.5 py-2 pr-2 pl-[86px] text-[11.5px] font-extrabold text-[#0f172a] max-sm:pl-[66px]">
              <span aria-hidden="true" className="-ml-[5px] size-[9px] shrink-0 rounded-full bg-[#0f172a]" />
              Bây giờ · {clockLabel(minuteOfDay(now))}
              <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-[#0f172a]/85" />
            </li>
          ) : null,
          <li key={tour.id}>
            <button
              type="button"
              onClick={() => onSelect(tour.id)}
              aria-pressed={selected}
              className={`group grid w-full grid-cols-[64px_20px_minmax(0,1fr)_auto] gap-x-3 rounded-xl px-2.5 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] max-sm:grid-cols-[48px_16px_minmax(0,1fr)] max-sm:px-1.5 ${
                selected ? 'bg-[#eff6ff] shadow-[inset_0_0_0_1.5px_#bfdbfe]' : 'hover:bg-[#f8fafc]'
              }`}
            >
              <span>
                <span className="block text-[17px] leading-tight font-extrabold text-[#0f172a] tabular-nums max-sm:text-[15px]">{formatTime(tour.scheduledAt)}</span>
                {hint && <span className="mt-1 block text-[11px] text-[#94a3b8]">{hint}</span>}
              </span>
              <span className="relative flex justify-center" aria-hidden="true">
                <span className={`absolute w-0.5 bg-[#e6ebf1] ${index === 0 ? 'top-3' : '-top-3'} ${index === tours.length - 1 ? 'h-6' : '-bottom-3'}`} />
                <span
                  className={`relative mt-1.5 size-3 rounded-full border-[3px] border-white ${tour.state === 'Running' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
                  style={{ background: tourColor(tour), boxShadow: `0 0 0 1.5px ${tourColor(tour)}` }}
                />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-[#eff6ff] px-1.5 py-px font-mono text-[11.5px] font-bold text-[#2563eb]">{tour.code}</span>
                  <TourStateBadges tour={tour} />
                </span>
                <span className="mt-1.5 block text-[15px] font-extrabold text-[#0f172a]">{tour.name}</span>
                <span className="mt-0.5 block truncate text-[12.5px] text-[#64748b]">
                  {tour.routeName} · {tour.stops.length} POI · {groups.groups} đoàn · {groups.students} học sinh
                  {tour.robotName ? ` · ${tour.robotName}` : ''}
                </span>
                {tour.state === 'Running' && <StopSegments tour={tour} />}
                <span className={`mt-1.5 block text-xs font-semibold ${NOTE_TONE[note.tone]}`}>{note.text}</span>
              </span>
              <span className={`flex items-center gap-1 self-center text-xs font-bold max-sm:hidden ${selected ? 'text-[#2563eb]' : 'text-[#94a3b8]'}`}>
                Chi tiết
                <ChevronRight size={15} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </span>
            </button>
          </li>,
        ]
      })}
    </ul>
  )
}
