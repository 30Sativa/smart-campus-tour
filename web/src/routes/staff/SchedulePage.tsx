import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Info, Lock, Map as MapIcon, Plus, Search, Timer, Bot, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { LoadingPanel } from '../../components/ui/ConsolePrimitives'
import { Drawer } from '../../components/ui/Drawer'
import { buttonClass } from '../../components/ui/ui-classes'
import { useTourCalendar, useTourShifts } from '../../features/administration/tours/hooks'
import { TourListPanel } from '../../features/administration/tours/TourListPanel'
import { campusDay, campusTime } from '../../features/administration/tours/tour-calendar'
import { TOUR_STATE_LABEL, tourError } from '../../features/administration/tours/tour-messages'
import type { TourShift, TourState, TourSummary } from '../../features/administration/tours/types'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function addDays(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + delta)
  return dayKey(date)
}

/** Monday of the week holding `day`. */
function weekStart(day: string) {
  const date = new Date(`${day}T12:00:00`)
  return addDays(day, -((date.getDay() + 6) % 7))
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const STATES: TourState[] = ['SCHEDULED', 'READY', 'RUNNING', 'COMPLETED', 'CANCELLED']
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'
const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const control = `min-h-10 rounded-xl border border-[#e2e8f0] bg-white px-3 text-sm text-[#2d3748] ${focus}`

/** Soft fills, one per state; the legend under the calendar names them. */
const CHIP: Record<TourState, string> = {
  SCHEDULED: 'border-[#f3e2b8] bg-[#fff8e8] text-[#2d3748]',
  READY: 'border-[#cfe0fb] bg-[#eef4ff] text-[#2d3748]',
  RUNNING: 'border-[#d6e4f8] bg-[#e3eeff] text-[#2d3748]',
  COMPLETED: 'border-[#e2e8f0] bg-[#f1f5f9] text-[#475569]',
  CANCELLED: 'border-[#e2e8f0] bg-white text-[#64748b]',
}
const DOT: Record<TourState, string> = {
  SCHEDULED: 'bg-[#f6ddb0]', READY: 'bg-[#cfe0fb]', RUNNING: 'bg-[#a9c8f8]', COMPLETED: 'bg-[#e2e8f0]', CANCELLED: 'bg-white ring-1 ring-[#e2e8f0]',
}
const struck = (tour: TourSummary) => tour.state === 'CANCELLED' ? 'line-through' : ''

const durationOf = (tour: TourSummary) => tour.reservation?.expectedDurationSeconds ?? tour.reservation?.measuredDurationSeconds ?? 3600
const endOf = (tour: TourSummary) => new Date(new Date(tour.scheduledStartAt).getTime() + durationOf(tour) * 1000).toISOString()
const span = (tour: TourSummary) => `${campusTime(tour.scheduledStartAt)} - ${campusTime(endOf(tour))}`

const LEAD_TIME_MS = 72 * 3600_000
const instant = (value: string) => new Date(value).getTime()
/** A shift still takes a new Tour: not closed by Admin, no live Tour holds it and its Tour start is at least 72 hours away (docs/lich-tour-theo-ca.md §3, §5). */
const openShift = (shift: TourShift, tours: TourSummary[], now: number) =>
  !shift.block && instant(shift.tourStartsAt) - now >= LEAD_TIME_MS && !tours.some(tour => tour.state !== 'CANCELLED' &&
    instant(tour.reservation ? tour.reservation.startsAt : tour.scheduledStartAt) < instant(shift.endsAt) &&
    instant(tour.reservation ? tour.reservation.endsAt : endOf(tour)) > instant(shift.startsAt))
const createHref = (day: string, shift: TourShift) => `/staff/manage/tours/new?date=${day}&shift=${encodeURIComponent(shift.code)}`
const shiftSpan = (shift: TourShift) => `${campusTime(shift.startsAt)}-${campusTime(shift.endsAt)}`
/** `2099-01-05` as people read it: 05/01/2099. */
const readableDay = (day: string) => day.split('-').reverse().join('/')
const createLabel = (day: string, shift: TourShift) => `Tạo Tour ${shift.name} ngày ${readableDay(day)}`
const lockLabel = (shift: TourShift) => `${shift.name} ${shiftSpan(shift)}, đã khoá: ${shift.block!.reason}`

/** A Tour belongs to the shift its start falls in, so an older Tour typed at 09:00 stays with the morning shift it holds. */
const startsIn = (tour: TourSummary, shift: TourShift) =>
  instant(shift.startsAt) <= instant(tour.scheduledStartAt) && instant(tour.scheduledStartAt) < instant(shift.endsAt)
const byRobot = (a: TourSummary, b: TourSummary) => (a.reservation?.robotCode ?? '').localeCompare(b.reservation?.robotCode ?? '')
const toursOfShift = (tours: TourSummary[], shift: TourShift) => tours.filter(tour => startsIn(tour, shift)).sort(byRobot)
const toursOutside = (tours: TourSummary[], shifts: TourShift[]) => tours.filter(tour => !shifts.some(shift => startsIn(tour, shift)))

const NARROW_SCREEN = '(max-width: 767px)'
function useNarrowScreen() {
  return useSyncExternalStore(onChange => {
    const query = window.matchMedia(NARROW_SCREEN)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, () => window.matchMedia(NARROW_SCREEN).matches)
}

/**
 * Tour schedule from the live Tour list and the fixed shifts: the week as a shift-by-day table
 * (a list of days on a narrow screen), the chosen day as one card per shift, or a list. The
 * chosen Tour (`?tour=`) opens in a drawer on the right.
 */
export default function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const today = campusDay(new Date())
  const day = params.get('date') ?? today
  const view = params.get('view') === 'day' || params.get('view') === 'list' ? params.get('view')! : 'week'
  const robotFilter = params.get('robot') ?? ''
  const stateFilter = (STATES as string[]).includes(params.get('state') ?? '') ? params.get('state') as TourState : ''
  const query = params.get('q') ?? ''
  const monday = weekStart(day)
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const tours = useTourCalendar(week[0], week[6], view !== 'list')
  const shifts = useTourShifts(week[0], week[6], view !== 'list')
  const narrow = useNarrowScreen()
  const shiftsOf = (key: string) => [...(shifts.data?.days.find(item => item.date === key)?.shifts ?? [])].sort((a, b) => a.time.localeCompare(b.time))
  // Read once per mount: whether a shift is past the 72-hour mark does not need to tick.
  const [now] = useState(() => Date.now())

  const all = useMemo(() => tours.data?.data ?? [], [tours.data])
  const robots = useMemo(() => [...new Set(all.map(tour => tour.reservation?.robotCode).filter(Boolean) as string[])].sort(), [all])
  const filtered = all.filter(tour =>
    (!robotFilter || tour.reservation?.robotCode === robotFilter) &&
    (!stateFilter || tour.state === stateFilter) &&
    (!query.trim() || `${tour.name} ${tour.routeName}`.toLowerCase().includes(query.trim().toLowerCase())))
  const inDay = (key: string) => filtered.filter(tour => campusDay(tour.scheduledStartAt) === key)
  // Whether a shift is free does not depend on the filters, so it reads every Tour of the day.
  const isOpen = (key: string, item: TourShift) => openShift(item, all.filter(tour => campusDay(tour.scheduledStartAt) === key), now)
  const shown = inDay(day)
  const selected = all.find(tour => tour.id === params.get('tour'))

  const set = (changes: Record<string, string | null>, replace = true) => setParams(current => {
    const next = new URLSearchParams(current)
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key) }
    return next
  }, { replace })
  const setDay = (next: string) => set({ date: next === today ? null : next, tour: null }, false)
  const openDay = (key: string) => set({ date: key === today ? null : key, view: 'day', tour: null }, false)
  const selectTour = (id: string) => set({ tour: id })

  const heading = view === 'week'
    ? `${dayMonth(week[0]).slice(0, 2)} - ${dayMonth(week[6])}/${week[6].slice(0, 4)}`
    : new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${day}T12:00:00`))
  const step = view === 'week' ? 7 : 1
  const robotCount = new Set(filtered.map(tour => tour.reservation?.robotCode).filter(Boolean)).size
  const failed = tours.isError ? tours.error : shifts.isError ? shifts.error : null

  const header = <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-xl leading-tight font-bold text-[#2d3748] sm:text-2xl">Lịch tour</h1>
      <p className="mt-1 text-sm text-[#718096]">{view === 'list' ? 'Mọi Tour theo thời gian: sắp diễn ra, đang chạy, đã kết thúc.' : 'Tour đã lên lịch và thời gian giữ robot.'}</p>
    </div>
    <Link to="/staff/manage/tours/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo Tour</Link>
  </header>
  const viewToggle = <div role="group" aria-label="Chế độ xem lịch" className="ml-auto flex rounded-xl border border-[#e2e8f0] bg-white p-1">
    {([['week', 'Tuần'], ['day', 'Ngày'], ['list', 'Danh sách']] as const).map(([value, label]) => (
      <button key={value} type="button" aria-pressed={view === value} onClick={() => set({ view: value === 'week' ? null : value, tour: null })}
        className={`min-h-8 rounded-lg px-4 text-sm font-semibold transition-colors ${focus} ${view === value ? 'bg-[#edf3fb] text-[#4a6fa5]' : 'text-[#718096] hover:text-[#2d3748]'}`}>{label}</button>
    ))}
  </div>

  // The list is every Tour across time, not this week: it has its own filters and paging.
  if (view === 'list') return (
    <StaffPage>
      {header}
      <div className="mb-3 flex">{viewToggle}</div>
      <TourListPanel />
    </StaffPage>
  )

  return (
    <StaffPage>
      {header}

      <section className={`${card} p-4 sm:p-5`} aria-label="Lịch">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDay(addDays(day, -step))} className={`${buttonClass('secondary', 'sm')} size-10 px-0`} aria-label={view === 'week' ? 'Tuần trước' : 'Ngày trước'}><ChevronLeft size={16} /></button>
          <h2 className="min-w-36 px-1 text-center text-base font-bold text-[#2d3748] tabular-nums first-letter:uppercase">{heading}</h2>
          <button type="button" onClick={() => setDay(addDays(day, step))} className={`${buttonClass('secondary', 'sm')} size-10 px-0`} aria-label={view === 'week' ? 'Tuần sau' : 'Ngày sau'}><ChevronRight size={16} /></button>
          <button type="button" onClick={() => setDay(today)} disabled={day === today} className={`${buttonClass('secondary', 'sm')} min-h-10`}>Hôm nay</button>
          {viewToggle}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Lọc theo robot" value={robotFilter} onChange={event => set({ robot: event.target.value || null })} className={`${control} min-w-44`}>
            <option value="">Robot: Tất cả</option>
            {robots.map(code => <option key={code} value={code}>Robot: {code}</option>)}
          </select>
          <select aria-label="Lọc theo trạng thái" value={stateFilter} onChange={event => set({ state: event.target.value || null })} className={`${control} min-w-44`}>
            <option value="">Trạng thái: Tất cả</option>
            {STATES.map(state => <option key={state} value={state}>Trạng thái: {TOUR_STATE_LABEL[state]}</option>)}
          </select>
          <label className={`${control} flex min-w-48 flex-1 items-center gap-2 focus-within:ring-2 focus-within:ring-[#5b9dc9]`}>
            <Search size={16} aria-hidden="true" className="shrink-0 text-[#a0aec0]" />
            <input type="search" aria-label="Tìm Tour" value={query} onChange={event => set({ q: event.target.value || null })} placeholder="Tìm Tour…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#a0aec0]" />
          </label>
        </div>

        {failed && <div className="mt-4"><ErrorPanel error={new Error(tourError(failed))} onRetry={() => { if (tours.isError) void tours.refetch(); if (shifts.isError) void shifts.refetch() }} /></div>}

        {!failed && <div className="mt-4">
          {tours.isPending || shifts.isPending ? <LoadingPanel />
            : view === 'day' ? <section aria-label={`Lịch tour ${heading}`}><DayShifts day={day} shifts={shiftsOf(day)} tours={shown} isOpen={item => isOpen(day, item)} onSelect={selectTour} /></section>
            : narrow ? <WeekList week={week} today={today} inDay={inDay} shiftsOf={shiftsOf} isOpen={isOpen} onSelect={selectTour} onDay={openDay} />
            : <WeekTable week={week} today={today} inDay={inDay} shiftsOf={shiftsOf} isOpen={isOpen} showRobot={robots.length >= 2} onSelect={selectTour} onDay={openDay} />}
        </div>}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-[#718096]">
          <ul aria-label="Chú thích trạng thái" className="flex flex-wrap gap-x-3.5 gap-y-1">
            {STATES.map(state => <li key={state} className="flex items-center gap-1.5"><span aria-hidden="true" className={`size-2.5 rounded-full ${DOT[state]}`} />{TOUR_STATE_LABEL[state]}</li>)}
          </ul>
          <span>Giờ Việt Nam (UTC+7)</span>
        </div>
      </section>

      <footer className={`${card} mt-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm`}>
        <p className="font-bold text-[#2d3748]">{tours.isSuccess ? `${view === 'week' ? filtered.length : shown.length} Tour trong ${view === 'week' ? 'tuần' : 'ngày'} · ${robotCount} robot` : '-'}</p>
        <p className="flex items-center gap-2 text-[13px] text-[#718096]"><Info size={15} aria-hidden="true" />Bấm vào một Tour để xem thông tin và khung giữ robot.</p>
      </footer>

      {selected && <TourDrawer tour={selected} onClose={() => set({ tour: null })} />}
    </StaffPage>
  )
}

type WeekProps = {
  week: string[]; today: string; inDay: (key: string) => TourSummary[]; shiftsOf: (key: string) => TourShift[]
  isOpen: (key: string, shift: TourShift) => boolean; onSelect: (id: string) => void; onDay: (key: string) => void
}

const weekdayOf = (key: string) => WEEKDAY[new Date(`${key}T12:00:00`).getDay()]
const dayMonth = (key: string) => readableDay(key).slice(0, 5)

/** The week as one row per shift and one column per day, each shift named once at the head of its row. */
function WeekTable({ week, today, inDay, shiftsOf, isOpen, showRobot, onSelect, onDay }: WeekProps & { showRobot: boolean }) {
  // Every day carries the same configured shifts; a row is one of them, the days supply its cells.
  const rows = [...new Map(week.flatMap(shiftsOf).map(item => [item.code, item])).values()].sort((a, b) => a.time.localeCompare(b.time))
  const outside = week.map(key => toursOutside(inDay(key), shiftsOf(key)))
  const rowHead = 'w-44 border-t border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-2 text-left align-middle font-normal'
  const cellEdge = 'border-t border-l border-[#e2e8f0]'
  return (
    <section aria-label="Lịch tuần" className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
      <table className="w-full min-w-[720px] table-fixed border-collapse">
        <thead>
          <tr>
            <th scope="col" className="w-44 bg-[#f8fafc]"><span className="sr-only">Ca</span></th>
            {week.map(key => <th key={key} scope="col" className="border-l border-[#e2e8f0] p-0 font-normal">
              <button type="button" onClick={() => onDay(key)} aria-label={`${weekdayOf(key)} ${dayMonth(key)}: ${inDay(key).length} buổi. Xem theo ca`}
                className={`flex w-full flex-col items-center gap-0.5 px-1 py-2 transition-colors hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9] ${key === today ? 'bg-[#edf3fb]' : 'bg-[#f8fafc]'}`}>
                <b className="text-sm text-[#2d3748]">{weekdayOf(key)}</b>
                <span className="text-xs text-[#718096] tabular-nums">{dayMonth(key)}</span>
                {key === today && <span className="text-[11px] font-semibold text-[#4a6fa5]">Hôm nay</span>}
              </button>
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.code}>
            <th scope="row" className={rowHead}>
              <span className="block text-[13px] leading-snug text-[#2d3748]"><b className="font-semibold">{row.name}</b> · <span className="whitespace-nowrap tabular-nums">{shiftSpan(row)}</span></span>
              <span className="mt-0.5 block text-[11px] text-[#718096] tabular-nums">Tour bắt đầu {row.time}</span>
            </th>
            {week.map(key => {
              const item = shiftsOf(key).find(other => other.code === row.code)
              return <ShiftCell key={key} day={key} shift={item} tours={item ? toursOfShift(inDay(key), item) : []} open={item ? isOpen(key, item) : false} showRobot={showRobot} onSelect={onSelect} className={cellEdge} />
            })}
          </tr>)}
          {outside.some(list => list.length > 0) && <tr>
            <th scope="row" className={`${rowHead} text-[13px] font-semibold text-[#9a6b16]`}>Ngoài ca</th>
            {week.map((key, index) => <td key={key} aria-label={`Ngoài ca ngày ${readableDay(key)}`} className={`${cellEdge} space-y-1 p-1.5 align-top`}>
              {outside[index].map(tour => <TourCard key={tour.id} tour={tour} outside showRobot={showRobot} onSelect={onSelect} />)}
            </td>)}
          </tr>}
        </tbody>
      </table>
    </section>
  )
}

/** One shift of one day. Tours print first; then the shift is closed, free to create in, or plain empty. */
function ShiftCell({ day, shift, tours, open, showRobot, onSelect, className }: { day: string; shift?: TourShift; tours: TourSummary[]; open: boolean; showRobot: boolean; onSelect: (id: string) => void; className: string }) {
  const tone = shift?.block ? 'bg-[#e8ecf1]' : tours.length > 0 || open ? 'bg-white' : 'bg-[#f8fafc]'
  return <td className={`${className} ${tone} h-20 space-y-1 p-1.5 ${tours.length > 0 ? 'align-top' : 'align-middle'}`}>
    {tours.map(tour => <TourCard key={tour.id} tour={tour} showRobot={showRobot} onSelect={onSelect} />)}
    {shift?.block && <div role="group" aria-label={lockLabel(shift)} title={shift.block.reason} className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
      <Lock size={12} aria-hidden="true" className="shrink-0" /><span className="min-w-0 truncate">{shift.block.reason}</span>
    </div>}
    {shift && open && <Link to={createHref(day, shift)} aria-label={createLabel(day, shift)} title={createLabel(day, shift)}
      className={`mx-auto grid size-8 place-items-center rounded-lg border border-dashed border-[#cbd5e1] text-[#7c8ba1] transition-colors hover:border-[#2563eb] hover:bg-[#eff6ff] hover:text-[#2563eb] focus-visible:border-[#2563eb] focus-visible:bg-[#eff6ff] focus-visible:text-[#2563eb] ${focus}`}><Plus size={16} aria-hidden="true" /></Link>}
  </td>
}

function TourCard({ tour, outside = false, showRobot, onSelect }: { tour: TourSummary; outside?: boolean; showRobot: boolean; onSelect: (id: string) => void }) {
  const robot = showRobot ? tour.reservation?.robotCode : undefined
  return <button type="button" onClick={() => onSelect(tour.id)} aria-haspopup="dialog" title={tour.name}
    aria-label={`${outside ? 'Ngoài ca: ' : ''}${span(tour)} ${tour.name}, ${TOUR_STATE_LABEL[tour.state]}${robot ? `, robot ${robot}` : ''}`}
    className={`block w-full rounded-lg border px-1.5 py-1 text-left transition-shadow hover:shadow-[0_6px_14px_-8px_rgba(15,23,42,0.35)] ${CHIP[tour.state]} ${focus}`}>
    <span className="flex flex-wrap gap-x-1.5 text-[11px] tabular-nums opacity-80">{campusTime(tour.scheduledStartAt)}{robot && <span className="font-mono whitespace-nowrap">{robot}</span>}</span>
    <span className={`line-clamp-2 text-xs font-semibold break-words ${struck(tour)}`}>{tour.name}</span>
    <span className="mt-1 inline-block rounded bg-white/70 px-1 text-[10.5px] font-semibold">{TOUR_STATE_LABEL[tour.state]}</span>
  </button>
}

/** The week on a narrow screen: a list of days, so nothing scrolls sideways. */
function WeekList({ week, today, inDay, shiftsOf, isOpen, onSelect, onDay }: WeekProps) {
  return <section aria-label="Lịch tuần">
    <ol className="space-y-5">{week.map(key => <li key={key}>
      <button type="button" onClick={() => onDay(key)} className={`mb-2 flex min-h-10 w-full items-center gap-2 rounded-lg bg-[#f8fafc] px-3 text-left text-sm text-[#2d3748] ${focus}`}>
        <b>{weekdayOf(key)}</b><span className="text-[#718096] tabular-nums">{dayMonth(key)}</span>
        {key === today && <span className="ml-auto text-xs font-semibold text-[#4a6fa5]">Hôm nay</span>}
      </button>
      <DayShifts day={key} shifts={shiftsOf(key)} tours={inDay(key)} isOpen={item => isOpen(key, item)} onSelect={onSelect} />
    </li>)}</ol>
  </section>
}

/** One day: a card per shift, then any Tour outside every shift. */
function DayShifts({ day, shifts, tours, isOpen, onSelect }: { day: string; shifts: TourShift[]; tours: TourSummary[]; isOpen: (shift: TourShift) => boolean; onSelect: (id: string) => void }) {
  const outside = toursOutside(tours, shifts)
  return <div className="space-y-2.5">
    {shifts.map(item => <ShiftCard key={item.code} day={day} shift={item} tours={toursOfShift(tours, item)} open={isOpen(item)} onSelect={onSelect} />)}
    {outside.length > 0 && <section aria-label={`Ngoài ca ngày ${readableDay(day)}`} className="rounded-xl border border-[#e2e8f0] p-3.5 sm:p-4">
      <h3 className="text-sm font-semibold text-[#9a6b16]">Ngoài ca</h3>
      <TourRows tours={outside} outside onSelect={onSelect} />
    </section>}
  </div>
}

function ShiftCard({ day, shift, tours, open, onSelect }: { day: string; shift: TourShift; tours: TourSummary[]; open: boolean; onSelect: (id: string) => void }) {
  return <article aria-label={`${shift.name} ${shiftSpan(shift)}`} className={`rounded-xl border border-[#e2e8f0] p-3.5 sm:p-4 ${shift.block ? 'bg-[#f1f4f7]' : ''}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="text-sm text-[#2d3748]"><b className="font-semibold">{shift.name}</b> · <span className="tabular-nums">{shiftSpan(shift)}</span></h3>
      <span className="text-xs text-[#718096] tabular-nums">Tour bắt đầu {shift.time}</span>
    </div>
    {tours.length > 0 && <TourRows tours={tours} onSelect={onSelect} />}
    {shift.block && <p role="group" aria-label={lockLabel(shift)} className="mt-2 flex items-start gap-1.5 text-[13px] font-medium text-[#475569]"><Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">Đã khoá: {shift.block.reason}</span></p>}
    {open && <Link to={createHref(day, shift)} aria-label={createLabel(day, shift)} className={`${buttonClass('secondary', 'sm')} mt-2.5`}><Plus size={14} aria-hidden="true" />Tạo Tour</Link>}
    {!tours.length && !shift.block && !open && <p className="mt-2 text-[13px] text-[#718096]">Chưa có Tour.</p>}
  </article>
}

/** Tours of one shift, by robot: the same facts the day's robot view gave, with nothing cut short. */
function TourRows({ tours, outside = false, onSelect }: { tours: TourSummary[]; outside?: boolean; onSelect: (id: string) => void }) {
  return <ul aria-label="Tour trong ca" className="mt-2.5 space-y-2">{tours.map(tour => <li key={tour.id}>
    <button type="button" onClick={() => onSelect(tour.id)} aria-haspopup="dialog" aria-label={`${outside ? 'Ngoài ca: ' : ''}${span(tour)} ${tour.name}, ${TOUR_STATE_LABEL[tour.state]}`}
      className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-left text-sm transition-shadow hover:shadow-[0_6px_14px_-8px_rgba(15,23,42,0.35)] ${CHIP[tour.state]} ${focus}`}>
      <span className="font-semibold tabular-nums">{span(tour)}</span>
      <span className="min-w-0 flex-1 basis-48"><span className={`block font-semibold break-words ${struck(tour)}`}>{tour.name}</span>
        <span className="block text-xs break-words opacity-80">{tour.routeName} · {tour.reservation ? `robot ${tour.reservation.robotCode} · giữ ${campusTime(tour.reservation.startsAt)} - ${campusTime(tour.reservation.endsAt)}` : 'không giữ robot'}</span></span>
      <span className="rounded bg-white/70 px-1.5 text-[11px] font-semibold whitespace-nowrap">{TOUR_STATE_LABEL[tour.state]}</span>
    </button>
  </li>)}</ul>
}

/** The chosen Tour: its time, robot hold and where to go next. */
function TourDrawer({ tour, onClose }: { tour: TourSummary; onClose: () => void }) {
  const hold = tour.reservation
  const rows: Array<[typeof Clock, string, ReactNode]> = [
    [CalendarDays, 'Ngày tổ chức', new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(tour.scheduledStartAt))],
    [Clock, 'Thời gian Tour', span(tour)],
    [Bot, 'Robot', hold?.robotCode ?? '-'],
    [CalendarDays, 'Giữ chỗ robot', hold ? `${campusTime(hold.startsAt)} - ${campusTime(hold.endsAt)}` : 'Không giữ robot'],
    [Timer, 'Thời lượng dự kiến', `${Math.round(durationOf(tour) / 60)} phút`],
    [MapIcon, 'Tuyến', tour.routeName],
    [Users, 'Đăng ký', `${tour.registrationCount} đoàn`],
  ]
  return (
    <Drawer open side="right" title="Buổi đang chọn" onClose={onClose} footer={<>
      <Link to={`/staff/manage/tours/${tour.id}`} className={`${buttonClass('primary')} w-full`}>Xem chi tiết Tour</Link>
      <Link to="/staff/manage/registrations" className={`mt-3 block rounded-md text-center text-sm font-semibold text-[#2d3748] underline-offset-4 hover:underline ${focus}`}>Xem đăng ký</Link>
    </>}>
      <p className={`text-lg leading-snug font-bold break-words text-[#2d3748] ${struck(tour)}`}>{tour.name}</p>
      <span className={`mt-2 inline-block rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${CHIP[tour.state]}`}>{TOUR_STATE_LABEL[tour.state]}</span>
      <dl className="mt-4 divide-y divide-[#eef2f6]">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="flex items-center gap-3 py-2.5 text-sm">
            <Icon size={16} aria-hidden="true" className="shrink-0 text-[#a0aec0]" />
            <dt className="w-32 shrink-0 text-[#718096]">{label}</dt>
            <dd className="min-w-0 font-semibold break-words text-[#2d3748] first-letter:uppercase">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#f8fafc] px-3.5 py-3 text-[13px] text-[#718096]"><Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />Giữ chỗ robot gồm cả thời gian chuẩn bị và kết thúc.</p>
    </Drawer>
  )
}
