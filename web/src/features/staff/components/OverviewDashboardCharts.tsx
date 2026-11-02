import { useEffect, useRef, useState } from 'react'
import type { TourOperation } from '../../../api/contracts/staff'
import { OVERVIEW_STATES, type OverviewDay, type OverviewFilter } from '../overview-dashboard'
import { statusLabel } from '../status'

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'

export function OverviewCompletedChart({ days, selectedDate, onDate }: {
  days: OverviewDay[]; selectedDate: string; onDate: (date: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(480)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const measured = node.getBoundingClientRect().width
      if (measured > 0) setWidth(measured)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const height = 186, left = 28, right = 17, top = 28, bottom = 15
  const maximum = Math.max(2, Math.ceil(Math.max(...days.map(day => day.completed), 0) / 2) * 2)
  const step = maximum / 3 > 1 ? Math.ceil(maximum / 3) : 1
  const ticks = Array.from({ length: Math.floor(maximum / step) + 1 }, (_, i) => i * step)
  const x = (index: number) => left + 10 + index * (width - left - right - 20) / Math.max(1, days.length - 1)
  const y = (value: number) => top + (height - top - bottom) * (1 - value / maximum)
  const points = days.map((day, index) => `${x(index)},${y(day.completed)}`).join(' ')
  const selected = days.find(day => day.date === selectedDate)

  return <div className="px-4 pb-4 sm:px-5">
    <p className="mb-1 text-xs text-[#64748b]">Số buổi theo ngày</p>
    <div ref={ref}>
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-[186px] w-full" role="img"
      aria-label={`Buổi hoàn thành: ${days.map(day => `${day.label}: ${day.completed}`).join(', ')}`}>
      {ticks.map(tick => <g key={tick}>
        <line x1={left} y1={y(tick)} x2={width - right} y2={y(tick)} stroke="#e2e8f0" />
        <text x={left - 10} y={y(tick) + 4} textAnchor="end" fontSize={11} fill="#64748b">{tick}</text>
      </g>)}
      {days.length > 0 && <>
        <polygon points={`${x(0)},${y(0)} ${points} ${x(days.length - 1)},${y(0)}`} fill="#2563eb" fillOpacity={0.055} />
        <polyline points={points} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </>}
      {days.map((day, index) => <g key={day.date}>
        <circle cx={x(index)} cy={y(day.completed)} r={day.date === selectedDate ? 4.5 : 3.5} fill={day.date === selectedDate ? '#2563eb' : '#fff'} stroke="#2563eb" strokeWidth={2} />
        <text x={x(index)} y={y(day.completed) - 12} textAnchor="middle" fontSize={12} fontWeight={600} fill="#2d3748">{day.completed}</text>
      </g>)}
    </svg>
    </div>
    <div role="group" aria-label="Chọn ngày từ biểu đồ" className="mr-2 ml-6 grid grid-cols-7 gap-1">
      {days.map((day, index) => <button key={day.date} type="button" aria-label={`Xem ngày ${day.label}`} aria-pressed={day.date === selectedDate}
        onClick={() => onDate(day.date)} className={`min-h-8 rounded-lg px-0.5 text-xs tabular-nums transition-colors ${focus} ${day.date === selectedDate ? 'bg-[#dbeafe] font-semibold text-[#2563eb]' : 'text-[#64748b] hover:bg-[#eff6ff]'}`}>
        <span className="sm:hidden">{index === 0 ? day.label : day.label.slice(0, 2)}</span><span className="hidden sm:inline">{day.label}</span>
      </button>)}
    </div>
    <p className="mt-3 text-xs text-[#64748b]" aria-live="polite">{selected ? `${selected.label}: ${selected.completed} buổi hoàn thành.` : 'Chọn một ngày để xem danh sách buổi.'}{selectedDate === days.at(-1)?.date ? ' Hôm nay chưa kết thúc.' : ''}</p>
  </div>
}

export function OverviewStateRing({ tours, filter, onFilter }: { tours: TourOperation[]; filter: OverviewFilter; onFilter: (filter: OverviewFilter) => void }) {
  const parts = OVERVIEW_STATES.map(item => ({ ...item, label: statusLabel(item.state), count: tours.filter(tour => tour.state === item.state).length }))
  const total = tours.length
  const circle = 2 * Math.PI * 45
  const selected = parts.find(part => part.state === filter)
  const assistance = tours.filter(tour => tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance').length
  const center = filter === 'assistance' ? assistance : selected ? selected.count : total
  const label = filter === 'assistance' ? 'Cần hỗ trợ' : selected ? selected.label : 'buổi trong ngày'

  return <div className="px-4 pb-4 sm:px-5">
    <div className="relative mx-auto mb-2 size-[146px]">
      <svg viewBox="0 0 130 130" className="size-full -rotate-90" role="img" aria-label={`Trạng thái ${total} buổi: ${parts.map(part => `${part.label}: ${part.count}`).join(', ')}`}>
        <circle cx={65} cy={65} r={45} fill="none" stroke="#eff6ff" strokeWidth={12} />
        {parts.map((part, index) => {
          if (!part.count || !total) return null
          const offset = parts.slice(0, index).reduce((sum, item) => sum + item.count, 0) / total * circle
          const active = filter === 'all' || filter === part.state || filter === 'assistance' && part.state === 'Running'
          return <circle key={part.state} cx={65} cy={65} r={45} fill="none" stroke={part.color} strokeWidth={12}
            strokeDasharray={`${Math.max(0, part.count / total * circle - 3)} ${circle}`} strokeDashoffset={-offset} opacity={active ? 1 : 0.22} className="transition-opacity duration-150 motion-reduce:transition-none" />
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <strong className="text-[28px] leading-tight font-semibold tracking-tight text-[#2d3748] tabular-nums">{center}</strong>
        <span className="mt-1 max-w-24 text-xs text-[#64748b]">{label}</span>
      </div>
    </div>
    <div role="group" aria-label="Lọc từ biểu đồ trạng thái" className="mx-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-1">
      {parts.map(part => <button key={part.state} type="button" onClick={() => onFilter(part.state)} aria-pressed={filter === part.state}
        aria-label={`Lọc ${part.label}: ${part.count} buổi`}
        className={`flex min-h-8 min-w-0 items-center gap-2 rounded-md text-left text-xs ${focus} ${filter === part.state ? 'font-semibold text-[#2d3748]' : 'text-[#64748b] hover:text-[#2d3748]'}`}>
        <span className="size-2 shrink-0 rounded-full" style={{ background: part.color }} aria-hidden="true" />
        <span className="min-w-0 flex-1">{part.label}</span><b className="font-semibold text-[#2d3748] tabular-nums">{part.count}</b>
      </button>)}
    </div>
    {total === 0 && <p className="mt-3 text-center text-xs text-[#64748b]">Không có buổi trong ngày đã chọn.</p>}
  </div>
}
