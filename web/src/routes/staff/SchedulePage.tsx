import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { FilterChips, LoadingPanel, PageHeader, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { useTourCalendar } from '../../features/administration/tours/hooks'
import { campusDay, campusMinutes, campusTime } from '../../features/administration/tours/tour-calendar'
import { TOUR_STATE_LABEL, tourError } from '../../features/administration/tours/tour-messages'
import type { TourState, TourSummary } from '../../features/administration/tours/types'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'

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
/** The robot's working day the bars measure against (07:00-19:00). */
const DAY_OPENS = 7 * 60
const DAY_MINUTES = 12 * 60

const CHIP: Record<TourState, string> = {
  RUNNING: 'border-[#2d719e] bg-[#2d719e] text-white',
  READY: 'border-[#cfe1fb] bg-[#eef5ff] text-[#2f62b8]',
  SCHEDULED: 'border-[#f0d89f] bg-[#fff8e6] text-[#8a5a06]',
  COMPLETED: 'border-[#cde9dc] bg-[#effbf5] text-[#1f7a55]',
  CANCELLED: 'border-[#dbe6f4] bg-[#f6f9fd] text-[#5d7085] line-through',
}

const heldMinutes = (tour: TourSummary) => tour.reservation
  ? (new Date(tour.reservation.endsAt).getTime() - new Date(tour.reservation.startsAt).getTime()) / 60_000 : 0

/**
 * Tour schedule from the live Tour list and its robot reservations: the week at
 * a glance, then the chosen day by robot or as a list. Each session opens its
 * Tour record.
 */
export default function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const today = campusDay(new Date())
  const day = params.get('date') ?? today
  const view = params.get('view') === 'day' || params.get('view') === 'list' ? params.get('view')! : 'week'
  const monday = weekStart(day)
  const week = Array.from({ length: 7 }, (_, i) => shift(monday, i))
  const tours = useTourCalendar(week[0], week[6])
  const inDay = (key: string) => (tours.data?.data ?? []).filter(tour => campusDay(tour.scheduledStartAt) === key)
  const shown = inDay(day)

  const setDay = (next: string) =>
    setParams((current) => {
      if (next === today) current.delete('date')
      else current.set('date', next)
      return current
    })

  const heading = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00`))
  const range = (key: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(`${key}T12:00:00`))
  const isToday = day === today

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Trong ngày"
        title="Lịch tour"
        description="Tour đã tạo và khung giữ robot. Chọn lịch tuần, lịch theo robot hoặc danh sách."
        action={
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setDay(shift(day, -7))} className={buttonClass('secondary', 'sm')} aria-label="Tuần trước"><ChevronLeft size={15} /></button>
            <input type="date" value={day} onChange={(event) => event.target.value && setDay(event.target.value)} aria-label="Chọn ngày" className="min-h-7 rounded-lg border border-[#d9e9f5] bg-white px-2 text-xs font-semibold text-[#0f172a] outline-none focus:ring-2 focus:ring-[#5b9dc9]" />
            <button type="button" onClick={() => setDay(shift(day, 7))} className={buttonClass('secondary', 'sm')} aria-label="Tuần sau"><ChevronRight size={15} /></button>
            {!isToday && <button type="button" onClick={() => setDay(today)} className={buttonClass('ghost', 'sm')}>Hôm nay</button>}
          </div>
        }
      />

      <div className="mb-4">
        <FilterChips label="Chế độ xem lịch" value={view} onChange={value => setParams(current => { const next = new URLSearchParams(current); next.set('view', value); return next }, { replace: true })}
          options={[{ value: 'week', label: 'Tuần' }, { value: 'day', label: 'Ngày' }, { value: 'list', label: 'Danh sách' }]} />
      </div>
      {tours.isError && <div className="mb-4"><ErrorPanel error={new Error(tourError(tours.error))} onRetry={() => void tours.refetch()} /></div>}
      {view === 'week' && <section className={`${panelClass} mb-5`} aria-label="Lịch tuần">
        <div className="flex items-center justify-between border-b border-[#eef1f4] px-3.5 py-2.5">
          <h2 className="text-[13px] font-semibold text-[#0f172a]">Tuần {range(week[0])} - {range(week[6])}</h2>
          <span className="text-[11.5px] text-[#64748b]">bấm một ngày để xem theo robot</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-7">
          {week.map((key) => <DayCell key={key} day={key} tours={inDay(key)} loading={tours.isPending} selected={key === day} today={key === today} onPick={() => setParams(current => { const next = new URLSearchParams(current); next.set('date', key); next.set('view', 'day'); return next })} />)}
        </div>
      </section>}

      {view !== 'week' && !tours.isError && <section className={panelClass} aria-label={`Lịch tour ${heading}`}>
        <div className="flex items-center justify-between gap-3 border-b border-[#eef1f4] px-3.5 py-2.5">
          <h2 className="text-[13px] font-semibold text-[#0f172a] first-letter:uppercase">{heading}{view === 'day' ? ' theo robot' : ''}{isToday ? ' · hôm nay' : ''}</h2>
          {tours.data && <span className="text-xs text-[#64748b] tabular-nums">{shown.length} buổi</span>}
        </div>
        {tours.isPending ? <div className="p-4"><LoadingPanel /></div>
          : shown.length === 0 ? <div className="p-4"><EmptyPanel>Không có tour nào trong ngày này.</EmptyPanel></div>
          : view === 'day' ? <RobotDay tours={shown} /> : <SessionList tours={shown} />}
      </section>}
    </StaffPage>
  )
}

/** One day of the week: its date, how much of the working day robots are held, and its sessions as chips. */
function DayCell({ day, tours, loading, selected, today, onPick }: { day: string; tours: TourSummary[]; loading: boolean; selected: boolean; today: boolean; onPick: () => void }) {
  const date = new Date(`${day}T12:00:00`)
  const held = tours.reduce((sum, tour) => sum + heldMinutes(tour), 0)
  const full = Math.min(100, Math.round((held / DAY_MINUTES) * 100))
  return (
    <button type="button" onClick={onPick} aria-pressed={selected} aria-label={`${WEEKDAY[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}: ${tours.length} buổi, ${loading ? 'đang tải dữ liệu' : `giữ robot ${full}% ngày`}`}
      className={`flex min-h-28 flex-col gap-1 rounded-[10px] border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${selected ? 'border-[#2d719e] bg-[#f1f8fe]' : 'border-[#e2e8f0] bg-white hover:border-[#c9dcec]'}`}>
      <span className="flex items-baseline justify-between">
        <b className={`text-[13px] ${today ? 'text-[#2d719e]' : 'text-[#0f172a]'}`}>{WEEKDAY[date.getDay()]} {date.getDate()}</b>
        <small className="text-[11px] text-[#64748b]">{loading ? '…' : `${tours.length} buổi`}</small>
      </span>
      <span className="h-[5px] overflow-hidden rounded-full bg-[#eef1f4]" aria-hidden="true" hidden={loading}><i className="block h-full rounded-full bg-[#7db9db]" style={{ width: `${full}%` }} /></span>
      {tours.slice(0, 4).map((tour) => <span key={tour.id} className={`truncate rounded-[5px] border px-1.5 text-[11px] font-semibold ${CHIP[tour.state]}`}>{campusTime(tour.scheduledStartAt)} {tour.name}</span>)}
      {tours.length > 4 && <span className="text-[11px] text-[#64748b]">+{tours.length - 4} buổi</span>}
    </button>
  )
}

/** Each robot's held windows across the working day. A Tour without a hold has no bar and stays in the list view. */
function RobotDay({ tours }: { tours: TourSummary[] }) {
  const held = tours.filter(tour => tour.reservation)
  const robots = [...new Set(held.map(tour => tour.reservation!.robotCode))].sort()
  if (robots.length === 0) return <div className="p-4"><EmptyPanel>Các buổi trong ngày này không giữ robot.</EmptyPanel></div>
  return <ul aria-label="Robot trong ngày" className="divide-y divide-[#eef1f4]">{robots.map(robot => <li key={robot} className="flex items-center gap-3 px-3.5 py-3">
    <span className="w-24 shrink-0 truncate font-mono text-xs text-[#334155]">{robot}</span>
    <div className="relative h-9 min-w-0 flex-1 rounded-lg bg-[#f1f5f9]">
      {held.filter(tour => tour.reservation!.robotCode === robot).map(tour => {
        const left = Math.max(0, (campusMinutes(tour.reservation!.startsAt) - DAY_OPENS) / DAY_MINUTES * 100)
        return <Link key={tour.id} to={`/staff/manage/tours/${tour.id}`} title={`${campusTime(tour.reservation!.startsAt)} - ${campusTime(tour.reservation!.endsAt)}`}
          className={`absolute inset-y-1 truncate rounded-md border px-1.5 text-[11px] leading-6 font-semibold ${CHIP[tour.state]}`}
          style={{ left: `${left}%`, width: `${Math.min(100 - left, heldMinutes(tour) / DAY_MINUTES * 100)}%` }}>{tour.name}</Link>
      })}
    </div>
  </li>)}</ul>
}

function SessionList({ tours }: { tours: TourSummary[] }) {
  return <ul aria-label="Lịch tour" className="divide-y divide-[#eef1f4]">{tours.map(tour => <li key={tour.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5 text-sm">
    <span className="w-12 shrink-0 font-semibold text-[#0f172a] tabular-nums">{campusTime(tour.scheduledStartAt)}</span>
    <span className="min-w-0 flex-1"><Link to={`/staff/manage/tours/${tour.id}`} className="font-medium text-[#0f172a] hover:text-[#2d719e] hover:underline">{tour.name}</Link>
      <span className="block text-xs text-[#64748b]">{tour.routeName}{tour.reservation && ` · robot ${tour.reservation.robotCode} · giữ ${campusTime(tour.reservation.startsAt)} - ${campusTime(tour.reservation.endsAt)}`}</span></span>
    <span className={`rounded-full border px-2 py-px text-[11px] font-bold whitespace-nowrap ${CHIP[tour.state]}`}>{TOUR_STATE_LABEL[tour.state]}</span>
  </li>)}</ul>
}
