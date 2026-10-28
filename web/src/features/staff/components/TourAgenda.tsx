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
    <span className="mt-1.5 flex max-w-80 gap-1" aria-hidden="true">
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
 * Today's Tours in time order, split into morning and afternoon, with a "now"
 * line between what has started and what is still to come. Each row reads
 * left to right: time, a dot in the session's colour, who and which route,
 * how many students, and the state. Choosing a row opens the session in the
 * middle of the page.
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
  const afternoonIndex = tours.findIndex((tour) => new Date(tour.scheduledAt).getHours() >= 12)
  return (
    <ul aria-label={label}>
      {tours.map((tour, index) => {
        const groups = groupSummary(tour)
        const note = tourNote(tour)
        const selected = tour.id === selectedId
        const hint = timeHint(tour, now)
        const school = tour.registrations.map((reg) => reg.schoolName).filter(Boolean).slice(0, 2).join(', ')
        return [
          index === 0 && afternoonIndex !== 0 ? <li key="am" role="presentation" className="border-b border-[#eef1f4] bg-[#f8fafc] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#64748b]">Buổi sáng</li> : null,
          index === afternoonIndex ? <li key="pm" role="presentation" className="border-y border-[#eef1f4] bg-[#f8fafc] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#64748b]">Buổi chiều</li> : null,
          index === nowIndex ? (
            <li key="now" aria-label={`Bây giờ ${clockLabel(minuteOfDay(now))}`} className="flex items-center gap-2.5 px-3.5 py-1 text-[11px] font-bold text-[#b23e31]">
              Bây giờ · {clockLabel(minuteOfDay(now))}
              <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-[#b23e31]/70" />
            </li>
          ) : null,
          <li key={tour.id} className="border-b border-[#eef1f4] last:border-b-0">
            <button
              type="button"
              onClick={() => onSelect(tour.id)}
              aria-pressed={selected}
              className={`group grid w-full grid-cols-[64px_16px_minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9] max-md:grid-cols-[52px_14px_minmax(0,1fr)] ${
                selected ? 'bg-[#f1f8fe]' : 'hover:bg-[#fafcfe]'
              }`}
            >
              <span>
                <span className="block text-sm leading-tight font-bold text-[#0f172a] tabular-nums">{formatTime(tour.scheduledAt)}</span>
                {hint && <span className="block text-[11px] text-[#64748b]">{hint}</span>}
              </span>
              <span aria-hidden="true" className={`size-3 justify-self-center rounded-full border-[3px] border-white ${tour.state === 'Running' ? 'animate-pulse motion-reduce:animate-none' : ''}`} style={{ background: tourColor(tour), boxShadow: `0 0 0 1px ${tourColor(tour)}` }} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-[#f1f8fe] px-1.5 py-px font-mono text-[11px] font-bold text-[#2d719e]">{tour.code}</span>
                  <b className="truncate text-[13px] font-semibold text-[#0f172a]">{school || tour.name}</b>
                </span>
                <span className="mt-0.5 block truncate text-xs text-[#64748b]">
                  {tour.routeName} · {tour.stops.length} POI{tour.robotName ? ` · ${tour.robotName}` : ''}
                  {note.tone !== 'muted' && note.tone !== 'ok' ? <span className={`ml-1 ${NOTE_TONE[note.tone]}`}>· {note.text}</span> : null}
                </span>
                {tour.state === 'Running' && <StopSegments tour={tour} />}
              </span>
              <span className="flex items-center gap-3 max-md:col-start-3 max-md:mt-1.5">
                <span className="text-right text-xs text-[#334155] tabular-nums">
                  <b className="block text-[13px] text-[#0f172a]">{groups.students} HS</b>
                  {groups.groups} đoàn{groups.pending ? <span className="text-[#b45309]"> · {groups.pending} chờ duyệt</span> : ''}
                </span>
                <TourStateBadges tour={tour} />
              </span>
            </button>
          </li>,
        ]
      })}
    </ul>
  )
}
