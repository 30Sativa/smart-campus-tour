import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import type { TourOperation } from '../../api/contracts/staff'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { TourTable } from '../../features/staff/components/TourParts'
import { DayGantt } from '../../features/staff/components/DayGantt'
import { useNow } from '../../features/staff/use-now'
import { formatTime } from '../../features/staff/formatters'
import { byStart, tourSpan } from '../../features/staff/today-board'

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function shift(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + delta)
  return dayKey(date)
}

/** Monday of the week holding `day`. */
function weekStart(day: string) {
  const date = new Date(`${day}T12:00:00`)
  const offset = (date.getDay() + 6) % 7
  return shift(day, -offset)
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
/** The robot's working day the occupancy bar measures against (08:00–18:00). */
const DAY_MINUTES = 600

const CHIP: Record<string, string> = {
  assist: 'border-[#f5c8c2] bg-[#fff1ef] text-[#b23e31]',
  Running: 'border-[#2d719e] bg-[#2d719e] text-white',
  Ready: 'border-[#cfe1fb] bg-[#eef5ff] text-[#2f62b8]',
  Scheduled: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]',
  Completed: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]',
  Cancelled: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085] line-through',
}

/**
 * Tour schedule: the week at a glance (how full the robot is each day and its
 * sessions), then the chosen day hour by hour with its sessions in a table.
 */
export default function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const today = dayKey(new Date())
  const day = params.get('date') ?? today
  const tours = useTours({ date: day })
  const now = useNow(30_000)
  const monday = weekStart(day)
  const week = Array.from({ length: 7 }, (_, i) => shift(monday, i))

  const setDay = (next: string) =>
    setParams((current) => {
      if (next === today) current.delete('date')
      else current.set('date', next)
      return current
    })

  const heading = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00`))
  const range = (key: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(`${key}T12:00:00`))
  const isToday = day === today
  const open = (id: string) => navigate(isToday ? `/staff/tours?tour=${id}` : `/staff/tours/${id}`)

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Trong ngày"
        title="Lịch tour"
        description="Mỗi buổi giữ robot 15 phút trước và sau tuyến. Thanh dưới mỗi ngày cho biết robot đã kín lịch bao nhiêu."
        action={
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setDay(shift(day, -7))} className={buttonClass('secondary', 'sm')} aria-label="Tuần trước"><ChevronLeft size={15} /></button>
            <input type="date" value={day} onChange={(event) => event.target.value && setDay(event.target.value)} aria-label="Chọn ngày" className="min-h-7 rounded-lg border border-[#d9e9f5] bg-white px-2 text-xs font-semibold text-[#0f172a] outline-none focus:ring-2 focus:ring-[#5b9dc9]" />
            <button type="button" onClick={() => setDay(shift(day, 7))} className={buttonClass('secondary', 'sm')} aria-label="Tuần sau"><ChevronRight size={15} /></button>
            {!isToday && <button type="button" onClick={() => setDay(today)} className={buttonClass('ghost', 'sm')}>Hôm nay</button>}
          </div>
        }
      />

      <section className={`${panelClass} mb-3`} aria-label="Lịch tuần">
        <div className="flex items-center justify-between border-b border-[#eef1f4] px-3.5 py-2.5">
          <h2 className="text-[13px] font-semibold text-[#0f172a]">Tuần {range(week[0])} – {range(week[6])}</h2>
          <span className="text-[11.5px] text-[#64748b]">bấm một ngày để xem theo giờ</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-7">
          {week.map((key) => <DayCell key={key} day={key} selected={key === day} today={key === today} onPick={() => setDay(key)} />)}
        </div>
      </section>

      <section className={panelClass} aria-label={`Lịch tour ${heading}`}>
        <div className="flex items-center justify-between gap-3 border-b border-[#eef1f4] px-3.5 py-2.5">
          <h2 className="text-[13px] font-semibold text-[#0f172a] first-letter:uppercase">{heading} theo giờ{isToday ? ' · hôm nay' : ''}</h2>
          {tours.data && <span className="text-xs text-[#64748b] tabular-nums">{tours.data.length} buổi</span>}
        </div>
        {tours.isPending ? (
          <div className="p-4"><LoadingPanel /></div>
        ) : tours.isError ? (
          <div className="p-4"><ErrorPanel error={tours.error} onRetry={tours.refetch} /></div>
        ) : tours.data.length === 0 ? (
          <div className="p-4"><EmptyPanel>Không có tour nào trong ngày này.</EmptyPanel></div>
        ) : (
          <>
            <DayGantt tours={tours.data} now={isToday ? now : undefined} onSelect={open} />
            <div className="border-t border-[#eef1f4]">
              <TourTable tours={tours.data} now={now} label="Lịch tour" />
            </div>
          </>
        )}
      </section>
    </StaffPage>
  )
}

/** One day of the week: its date, how full the robot is, and its sessions as chips. */
function DayCell({ day, selected, today, onPick }: { day: string; selected: boolean; today: boolean; onPick: () => void }) {
  const tours = useTours({ date: day })
  const list: TourOperation[] = [...(tours.data ?? [])].sort(byStart)
  const date = new Date(`${day}T12:00:00`)
  const busy = list.filter((tour) => tour.state !== 'Cancelled').reduce((sum, tour) => { const span = tourSpan(tour); return sum + (span.end - span.start) + 30 }, 0)
  const full = Math.min(100, Math.round((busy / DAY_MINUTES) * 100))
  return (
    <button type="button" onClick={onPick} aria-pressed={selected} aria-label={`${WEEKDAY[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}: ${list.length} buổi, robot kín ${full}%`}
      className={`flex min-h-28 flex-col gap-1 rounded-[10px] border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${selected ? 'border-[#2d719e] bg-[#f1f8fe]' : 'border-[#e2e8f0] bg-white hover:border-[#c9dcec]'}`}>
      <span className="flex items-baseline justify-between">
        <b className={`text-[13px] ${today ? 'text-[#2d719e]' : 'text-[#0f172a]'}`}>{WEEKDAY[date.getDay()]} {date.getDate()}</b>
        <small className="text-[11px] text-[#64748b]">{tours.isPending ? '…' : `${list.length} buổi`}</small>
      </span>
      <span className="h-[5px] overflow-hidden rounded-full bg-[#eef1f4]" aria-hidden="true"><i className="block h-full rounded-full bg-[#7db9db]" style={{ width: `${full}%` }} /></span>
      {list.slice(0, 4).map((tour) => {
        const tone = tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance' ? 'assist' : tour.state
        return <span key={tour.id} className={`truncate rounded-[5px] border px-1.5 text-[11px] font-semibold ${CHIP[tone]}`}>{formatTime(tour.scheduledAt)} {tour.code}</span>
      })}
      {list.length > 4 && <span className="text-[11px] text-[#64748b]">+{list.length - 4} buổi</span>}
    </button>
  )
}
