import type { TourOperation } from '../../../api/contracts/staff'
import { formatTime } from '../formatters'
import { byStart, clockLabel, minuteOfDay, tourSpan } from '../today-board'

/** How long a session holds the robot before and after its route (SRS). */
const HOLD_MINUTES = 15

const BAR: Record<string, string> = {
  assist: 'bg-[#b23e31] text-white',
  Running: 'bg-[#2d719e] text-white',
  Ready: 'bg-[#b9dcf2] text-[#173b59]',
  Scheduled: 'bg-[#e2e8f0] text-[#334155]',
  Completed: 'bg-[#cfe9dc] text-[#1f7a55]',
  Cancelled: 'bg-[#f1f5f9] text-[#94a3b8] line-through',
}
const STRIPES = 'bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.6)_0_4px,transparent_4px_8px)]'

/**
 * The robot's day, one lane per session on one time axis: the route itself and
 * the quarter hour the robot is held on either side, with a line at "now".
 * Choosing a bar opens that session.
 */
export function DayGantt({ tours, now, onSelect, selectedId }: { tours: TourOperation[]; now?: number; onSelect: (id: string) => void; selectedId?: string }) {
  const sorted = [...tours].sort(byStart)
  let from = 8 * 60
  let to = 17 * 60
  for (const tour of sorted) {
    const span = tourSpan(tour)
    from = Math.min(from, Math.floor((span.start - HOLD_MINUTES) / 60) * 60)
    to = Math.max(to, Math.ceil((span.end + HOLD_MINUTES) / 60) * 60)
  }
  const stepMinutes = to - from > 10 * 60 ? 120 : 60
  if ((to - from) % stepMinutes) to += stepMinutes - ((to - from) % stepMinutes)
  const pct = (minute: number) => ((minute - from) / (to - from)) * 100
  const hours: number[] = []
  for (let minute = from; minute <= to; minute += stepMinutes) hours.push(minute)
  const nowMinute = now == null ? -1 : minuteOfDay(now)
  const showNow = now != null && nowMinute >= from && nowMinute <= to
  const n = hours.length - 1
  const grid = { backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(100% / ${n} - 1px), #eef1f4 calc(100% / ${n} - 1px) calc(100% / ${n}))` }

  if (sorted.length === 0) return <p className="px-3.5 py-8 text-center text-[13px] text-[#64748b]">Hôm nay chưa có buổi nào.</p>

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px] pt-2 pr-7 pb-3 pl-3.5">
        <div className="relative ml-[132px] h-5 text-[11px] text-[#64748b]" aria-hidden="true">
          {hours.map((minute) => <span key={minute} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(minute)}%` }}>{clockLabel(minute)}</span>)}
        </div>
        <ul aria-label="Robot trong ngày">
          {sorted.map((tour) => {
            const span = tourSpan(tour)
            const left = pct(span.start - HOLD_MINUTES)
            const width = pct(span.end + HOLD_MINUTES) - left
            const hold = (HOLD_MINUTES / (span.end - span.start + 2 * HOLD_MINUTES)) * 100
            const tone = tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance' ? 'assist' : tour.state
            const school = tour.registrations[0]?.schoolName ?? tour.name
            return (
              <li key={tour.id} className="grid min-h-[38px] grid-cols-[132px_minmax(0,1fr)] items-center border-t border-[#eef1f4]">
                <span className="min-w-0 pr-2.5 leading-tight">
                  <b className="block text-[12.5px] text-[#0f172a]">{tour.code}</b>
                  <small className="block truncate text-[11px] text-[#64748b]">{school}</small>
                </span>
                <span className="relative block h-[38px]" style={grid}>
                  {showNow && <span aria-hidden="true" className="absolute -top-1 -bottom-1 z-10 w-0.5 bg-[#b23e31]" style={{ left: `${pct(nowMinute)}%` }} />}
                  <button
                    type="button"
                    onClick={() => onSelect(tour.id)}
                    aria-pressed={selectedId === tour.id}
                    aria-label={`${tour.code} lúc ${formatTime(tour.scheduledAt)}, giữ robot ${clockLabel(span.start - HOLD_MINUTES)}–${clockLabel(span.end + HOLD_MINUTES)}`}
                    className={`absolute top-2 flex h-[22px] overflow-hidden rounded-[7px] text-[11px] font-semibold transition-shadow hover:shadow-[0_0_0_2px_#173b59] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${BAR[tone]} ${selectedId === tour.id ? 'shadow-[0_0_0_2px_#173b59]' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    <span aria-hidden="true" className={`h-full shrink-0 ${STRIPES}`} style={{ width: `${hold}%` }} />
                    <span className="flex-1" />
                    <span aria-hidden="true" className={`h-full shrink-0 ${STRIPES}`} style={{ width: `${hold}%` }} />
                  </button>
                  {/* The start time beside the bar, where it never gets cut. */}
                  <span aria-hidden="true" className="pointer-events-none absolute top-[11px] text-[11px] font-semibold whitespace-nowrap text-[#334155] tabular-nums" style={left + width > 82 ? { right: `${100 - left + 0.6}%` } : { left: `calc(${left + width}% + 5px)` }}>{formatTime(tour.scheduledAt)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 px-3.5 pb-3 text-[11.5px] text-[#64748b]" aria-label="Chú thích">
        {[['bg-[#2d719e]', 'Đang chạy'], ['bg-[#b23e31]', 'Cần hỗ trợ'], ['bg-[#b9dcf2]', 'Sẵn sàng'], ['bg-[#cfe9dc]', 'Hoàn thành'], ['bg-[#e2e8f0]', 'Chờ chốt']].map(([cls, label]) => (
          <li key={label} className="inline-flex items-center gap-1.5"><i aria-hidden="true" className={`h-2 w-4 rounded-[3px] ${cls}`} />{label}</li>
        ))}
        <li className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2 w-4 rounded-[3px] bg-[repeating-linear-gradient(135deg,#cbd5e1_0_3px,#fff_3px_6px)]" />Giữ robot 15 phút trước/sau</li>
      </ul>
    </div>
  )
}
