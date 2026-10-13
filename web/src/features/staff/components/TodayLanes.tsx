import { useEffect, useRef } from 'react'
import type { TourOperation } from '../../../api/contracts/staff'
import { formatTime } from '../formatters'
import { LANES, TODAY_STAGES, clockLabel, dayWindow, inWindow, laneOf, minuteOfDay, percentOf, tourColor, tourSpan } from '../today-board'

const LABEL_COLUMN = 104
/** A bar never gets narrower than its label, and never runs off the right edge. */
const BAR_MIN = 84

/**
 * The day in three lanes (Đang chạy / Sắp tới / Xong · hủy) on one time axis,
 * with a "now" line through all three. Each bar is a Tour; choosing one opens
 * it in the detail panel.
 */
export function TodayLanes({ tours, now, selectedId, onSelect }: { tours: TourOperation[]; now: number; selectedId?: string; onSelect: (id: string) => void }) {
  const range = dayWindow(tours)
  const nowMinute = minuteOfDay(now)
  const showNow = inWindow(nowMinute, range)
  const nowPct = percentOf(nowMinute, range)
  const hours = (range.to - range.from) / 60
  const ticks: number[] = []
  for (let minute = range.from; minute <= range.to; minute += 180) ticks.push(minute)
  if (ticks[ticks.length - 1] !== range.to) ticks.push(range.to)

  // On a narrow screen the strip scrolls sideways: open it at "now" once.
  const scroller = useRef<HTMLDivElement>(null)
  const centred = useRef(false)
  useEffect(() => {
    const box = scroller.current
    if (!box || centred.current || !showNow) return
    centred.current = true
    if (box.scrollWidth <= box.clientWidth) return
    const x = LABEL_COLUMN + (box.scrollWidth - LABEL_COLUMN) * (nowPct / 100)
    box.scrollLeft = x - box.clientWidth / 2
  }, [showNow, nowPct])

  const grid = {
    backgroundImage: `repeating-linear-gradient(90deg, transparent 0 calc(100% / ${hours} - 1px), #f1f4f8 calc(100% / ${hours} - 1px) calc(100% / ${hours}))`,
  }

  return (
    <div className="border-b border-[#f1f4f8] px-5 pt-4 pb-3">
      <h2 className="text-sm font-bold text-[#0f172a]">
        Trong ngày
        <span className="ml-2 text-xs font-medium text-[#94a3b8]">
          {clockLabel(range.from)} – {clockLabel(range.to)}
        </span>
      </h2>
      <div ref={scroller} className="mt-1 overflow-x-auto pb-1">
        <div className="relative min-w-[680px] pt-6">
          {LANES.map((lane) => {
            const list = tours.filter((tour) => laneOf(tour.state) === lane.key)
            return (
              <div key={lane.key} className="grid h-[42px] grid-cols-[104px_minmax(0,1fr)] border-t border-[#f1f4f8] last-of-type:border-b">
                <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#334155]">
                  {lane.label}
                  <span className="text-[10.5px] font-bold text-[#94a3b8] tabular-nums">{list.length}</span>
                </span>
                <div className="relative" style={grid}>
                  {showNow && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-[#94a3b8]/10" style={{ width: `${nowPct}%` }} />}
                  {list.map((tour) => {
                    const span = tourSpan(tour)
                    const left = percentOf(span.start, range)
                    const width = percentOf(span.end, range) - left
                    const label = TODAY_STAGES.find((stage) => stage.key === tour.state)?.label ?? tour.state
                    const cancelled = tour.state === 'Cancelled'
                    const selected = tour.id === selectedId
                    return (
                      <button
                        key={tour.id}
                        type="button"
                        onClick={() => onSelect(tour.id)}
                        aria-pressed={selected}
                        aria-label={`${tour.code} lúc ${formatTime(tour.scheduledAt)}, ${label}`}
                        title={`${tour.code} · ${formatTime(tour.scheduledAt)} – ${formatTime(tour.endedAt ?? tour.estimatedEndAt)} · ${label}`}
                        className={`absolute top-2 flex h-[26px] items-center gap-1.5 rounded-[7px] px-2 text-[11px] font-extrabold whitespace-nowrap transition-[transform,box-shadow] duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] motion-reduce:transition-none ${
                          cancelled ? 'text-[#b91c1c]' : 'text-white'
                        } ${selected ? 'shadow-[0_0_0_2px_#fff,0_0_0_3.5px_#0f172a]' : ''}`}
                        style={{
                          left: `min(${left}%, calc(100% - ${BAR_MIN + 2}px))`,
                          width: `max(${width}%, ${BAR_MIN}px)`,
                          background: cancelled ? 'repeating-linear-gradient(135deg, #fecaca 0 5px, #fee2e2 5px 10px)' : tourColor(tour),
                        }}
                      >
                        <span className="font-mono text-[10.5px]">{tour.code}</span>
                        <span className={cancelled ? 'line-through' : ''}>{formatTime(tour.scheduledAt)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {showNow && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-[18px] bottom-[20px] z-10 w-0.5 -translate-x-px rounded-full bg-[#0f172a]"
              style={{ left: `calc(${LABEL_COLUMN}px + (100% - ${LABEL_COLUMN}px) * ${nowPct / 100})` }}
            >
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-[5px] bg-[#0f172a] px-1.5 py-px text-[10.5px] font-extrabold whitespace-nowrap text-white">
                {clockLabel(nowMinute)}
              </span>
            </span>
          )}
          <div className="relative ml-[104px] h-[18px] font-mono text-[10.5px] text-[#94a3b8]" aria-hidden="true">
            {ticks.map((minute, index) => (
              <span
                key={minute}
                className={`absolute top-1 ${index === 0 ? '' : index === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
                style={{ left: `${percentOf(minute, range)}%` }}
              >
                {clockLabel(minute)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
