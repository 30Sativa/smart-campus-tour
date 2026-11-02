import { useMemo, type ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Info, Map as MapIcon, Plus, Search, Timer, Bot, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { LoadingPanel } from '../../components/ui/ConsolePrimitives'
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
  return shift(day, -((date.getDay() + 6) % 7))
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
/** The robot's working day the grid shows (07:00-19:00). */
const DAY_OPENS = 7 * 60
const DAY_MINUTES = 12 * 60
const HOUR_PX = 44
const STATES: TourState[] = ['SCHEDULED', 'READY', 'RUNNING', 'COMPLETED', 'CANCELLED']
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'
const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const control = `min-h-10 rounded-xl border border-[#e2e8f0] bg-white px-3 text-sm text-[#2d3748] ${focus}`

/** Soft fills, one per state; the legend under the grid names them. */
const CHIP: Record<TourState, string> = {
  SCHEDULED: 'border-[#f3e2b8] bg-[#fff8e8] text-[#2d3748]',
  READY: 'border-[#cfe0fb] bg-[#eef4ff] text-[#2d3748]',
  RUNNING: 'border-[#d6e4f8] bg-[#e3eeff] text-[#2d3748]',
  COMPLETED: 'border-[#e2e8f0] bg-[#f1f5f9] text-[#475569]',
  CANCELLED: 'border-[#e2e8f0] bg-white text-[#94a3b8] line-through',
}
const DOT: Record<TourState, string> = {
  SCHEDULED: 'bg-[#f6ddb0]', READY: 'bg-[#cfe0fb]', RUNNING: 'bg-[#a9c8f8]', COMPLETED: 'bg-[#e2e8f0]', CANCELLED: 'bg-white ring-1 ring-[#e2e8f0]',
}

const durationOf = (tour: TourSummary) => tour.reservation?.expectedDurationSeconds ?? tour.reservation?.measuredDurationSeconds ?? 3600
const endOf = (tour: TourSummary) => new Date(new Date(tour.scheduledStartAt).getTime() + durationOf(tour) * 1000).toISOString()
const span = (tour: TourSummary) => `${campusTime(tour.scheduledStartAt)} - ${campusTime(endOf(tour))}`

/**
 * Tour schedule from the live Tour list and its robot reservations: the week
 * as a time grid (07:00-19:00), the chosen day by robot, or a list. The chosen
 * Tour (`?tour=`) stays open on the right with its time and robot hold.
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
  const week = Array.from({ length: 7 }, (_, i) => shift(monday, i))
  const tours = useTourCalendar(week[0], week[6])

  const all = useMemo(() => tours.data?.data ?? [], [tours.data])
  const robots = useMemo(() => [...new Set(all.map(tour => tour.reservation?.robotCode).filter(Boolean) as string[])].sort(), [all])
  const filtered = all.filter(tour =>
    (!robotFilter || tour.reservation?.robotCode === robotFilter) &&
    (!stateFilter || tour.state === stateFilter) &&
    (!query.trim() || `${tour.name} ${tour.routeName}`.toLowerCase().includes(query.trim().toLowerCase())))
  const inDay = (key: string) => filtered.filter(tour => campusDay(tour.scheduledStartAt) === key)
  const shown = inDay(day)
  const selected = all.find(tour => tour.id === params.get('tour'))
    ?? filtered.find(tour => campusDay(tour.scheduledStartAt) >= today && tour.state !== 'CANCELLED') ?? filtered[0]

  const set = (changes: Record<string, string | null>, replace = true) => setParams(current => {
    const next = new URLSearchParams(current)
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key) }
    return next
  }, { replace })
  const setDay = (next: string) => set({ date: next === today ? null : next, tour: null }, false)

  const short = (key: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(`${key}T12:00:00`))
  const heading = view === 'week'
    ? `${short(week[0]).slice(0, 2)} - ${short(week[6])}/${week[6].slice(0, 4)}`
    : new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${day}T12:00:00`))
  const step = view === 'week' ? 7 : 1
  const robotCount = new Set(filtered.map(tour => tour.reservation?.robotCode).filter(Boolean)).size

  return (
    <StaffPage>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-bold text-[#2d3748] sm:text-2xl">Lịch tour</h1>
          <p className="mt-1 text-sm text-[#718096]">Tour đã lên lịch và thời gian giữ robot.</p>
        </div>
        <Link to="/staff/manage/tours/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo Tour</Link>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className={`${card} p-4 sm:p-5`} aria-label="Lịch">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDay(shift(day, -step))} className={`${buttonClass('secondary', 'sm')} size-10 px-0`} aria-label={view === 'week' ? 'Tuần trước' : 'Ngày trước'}><ChevronLeft size={16} /></button>
            <h2 className="min-w-36 px-1 text-center text-base font-bold text-[#2d3748] tabular-nums first-letter:uppercase">{heading}</h2>
            <button type="button" onClick={() => setDay(shift(day, step))} className={`${buttonClass('secondary', 'sm')} size-10 px-0`} aria-label={view === 'week' ? 'Tuần sau' : 'Ngày sau'}><ChevronRight size={16} /></button>
            <button type="button" onClick={() => setDay(today)} disabled={day === today} className={`${buttonClass('secondary', 'sm')} min-h-10`}>Hôm nay</button>
            <div role="group" aria-label="Chế độ xem lịch" className="ml-auto flex rounded-xl border border-[#e2e8f0] p-1">
              {([['week', 'Tuần'], ['day', 'Ngày'], ['list', 'Danh sách']] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={view === value} onClick={() => set({ view: value === 'week' ? null : value })}
                  className={`min-h-8 rounded-lg px-4 text-sm font-semibold transition-colors ${focus} ${view === value ? 'bg-[#edf3fb] text-[#4a6fa5]' : 'text-[#718096] hover:text-[#2d3748]'}`}>{label}</button>
              ))}
            </div>
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

          {tours.isError && <div className="mt-4"><ErrorPanel error={new Error(tourError(tours.error))} onRetry={() => void tours.refetch()} /></div>}

          {!tours.isError && <div className="mt-4">
            {tours.isPending ? <LoadingPanel /> : view === 'week'
              ? <WeekGrid week={week} today={today} inDay={inDay} selectedId={selected?.id} onSelect={id => set({ tour: id })} onDay={key => set({ date: key === today ? null : key, view: 'day', tour: null }, false)} />
              : <section aria-label={`Lịch tour ${heading}`} className="overflow-hidden rounded-xl border border-[#e2e8f0]">
                {shown.length === 0 ? <div className="p-4"><EmptyPanel>Không có tour nào trong ngày này.</EmptyPanel></div>
                  : view === 'day' ? <RobotDay tours={shown} onSelect={id => set({ tour: id })} /> : <SessionList tours={shown} onSelect={id => set({ tour: id })} selectedId={selected?.id} />}
              </section>}
          </div>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#718096]">
            <ul aria-label="Chú thích trạng thái" className="flex flex-wrap gap-x-5 gap-y-1.5">
              {STATES.map(state => <li key={state} className="flex items-center gap-2"><span aria-hidden="true" className={`h-3.5 w-6 rounded ${DOT[state]}`} />{TOUR_STATE_LABEL[state]}</li>)}
            </ul>
            <span>Giờ Việt Nam (UTC+7)</span>
          </div>
        </section>

        <TourPanel tour={selected} />
      </div>

      <footer className={`${card} mt-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm`}>
        <p className="font-bold text-[#2d3748]">{tours.isSuccess ? `${view === 'week' ? filtered.length : shown.length} Tour trong ${view === 'week' ? 'tuần' : 'ngày'} · ${robotCount} robot` : '-'}</p>
        <p className="flex items-center gap-2 text-[13px] text-[#718096]"><Info size={15} aria-hidden="true" />Chọn một Tour để xem thông tin và khung giữ robot.</p>
      </footer>
    </StaffPage>
  )
}

/** Side-by-side lanes for Tours that overlap on one day. */
function lanes(tours: TourSummary[]) {
  const ends: number[] = []
  return [...tours].sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt)).map(tour => {
    const start = campusMinutes(tour.scheduledStartAt)
    let lane = ends.findIndex(end => end <= start)
    if (lane === -1) { lane = ends.length; ends.push(0) }
    ends[lane] = start + durationOf(tour) / 60
    return { tour, lane }
  }).map((item, _, list) => ({ ...item, count: Math.max(...list.map(other => other.lane)) + 1 }))
}

function WeekGrid({ week, today, inDay, selectedId, onSelect, onDay }: { week: string[]; today: string; inDay: (key: string) => TourSummary[]; selectedId?: string; onSelect: (id: string) => void; onDay: (key: string) => void }) {
  const hours = Array.from({ length: 7 }, (_, i) => DAY_OPENS / 60 + i * 2)
  const height = (DAY_MINUTES / 60) * HOUR_PX
  return (
    <section aria-label="Lịch tuần" className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
      <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <div className="border-b border-[#e2e8f0] bg-[#f8fafc]" />
        {week.map(key => {
          const date = new Date(`${key}T12:00:00`)
          const isToday = key === today
          return <button key={key} type="button" onClick={() => onDay(key)} aria-label={`${WEEKDAY[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}: ${inDay(key).length} buổi. Xem theo robot`}
            className={`flex flex-col items-center gap-0.5 border-b border-l border-[#e2e8f0] px-1 py-2.5 transition-colors hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9] ${isToday ? 'bg-[#f2f7ff]' : 'bg-[#f8fafc]'}`}>
            <b className="text-sm text-[#2d3748]">{WEEKDAY[date.getDay()]}</b>
            <span className="text-xs text-[#718096] tabular-nums">{String(date.getDate()).padStart(2, '0')}/{String(date.getMonth() + 1).padStart(2, '0')}</span>
            {isToday && <span className="mt-0.5 rounded-full bg-[#edf3fb] px-2 text-[11px] font-semibold text-[#4a6fa5]">Hôm nay</span>}
          </button>
        })}

        <div className="relative" style={{ height }}>
          {hours.map(hour => <span key={hour} className="absolute right-2 -translate-y-1/2 text-[11px] text-[#718096] tabular-nums first:translate-y-0.5" style={{ top: (hour * 60 - DAY_OPENS) / 60 * HOUR_PX }}>{String(hour).padStart(2, '0')}:00</span>)}
        </div>
        {week.map(key => (
          <div key={key} className={`relative border-l border-[#e2e8f0] ${key === today ? 'bg-[#f7faff]' : ''}`} style={{ height, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, #eef2f6 ${HOUR_PX - 1}px, #eef2f6 ${HOUR_PX}px)` }}>
            {lanes(inDay(key)).map(({ tour, lane, count }) => {
              const top = Math.max(0, (campusMinutes(tour.scheduledStartAt) - DAY_OPENS) / 60 * HOUR_PX)
              const tall = Math.max(40, durationOf(tour) / 3600 * HOUR_PX)
              const selected = tour.id === selectedId
              return <button key={tour.id} type="button" onClick={() => onSelect(tour.id)} aria-pressed={selected} aria-label={`${span(tour)} ${tour.name}, ${TOUR_STATE_LABEL[tour.state]}`}
                className={`absolute overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-shadow hover:shadow-[0_6px_14px_-8px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] ${CHIP[tour.state]} ${selected ? 'ring-2 ring-[#93b8f5]' : ''}`}
                style={{ top: top + 2, height: Math.min(tall, height - top) - 4, left: `calc(${(lane / count) * 100}% + 3px)`, width: `calc(${100 / count}% - 6px)` }}>
                <span className="block truncate text-[11px] text-[#718096] tabular-nums">{span(tour)}</span>
                <span className="block truncate text-xs font-bold">{tour.name}</span>
                {tall >= 56 && <span className="mt-1 inline-block rounded bg-white/70 px-1.5 text-[10.5px] font-semibold text-[#475569] no-underline">{TOUR_STATE_LABEL[tour.state]}</span>}
              </button>
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

/** The chosen Tour: its time, robot hold and where to go next. */
function TourPanel({ tour }: { tour?: TourSummary }) {
  if (!tour) return (
    <aside aria-label="Buổi đang chọn" className={`${card} flex min-h-60 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[#718096]`}>
      <CalendarDays size={22} aria-hidden="true" className="text-[#a0aec0]" />Chọn một Tour trên lịch để xem thông tin.
    </aside>
  )
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
    <aside aria-label="Buổi đang chọn" className={`${card} sticky top-4 p-5`}>
      <h2 className="text-base font-bold text-[#2d3748]">Buổi đang chọn</h2>
      <p className="mt-3 text-lg leading-snug font-bold text-[#2d3748]">{tour.name}</p>
      <span className={`mt-2 inline-block rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${CHIP[tour.state]}`}>{TOUR_STATE_LABEL[tour.state]}</span>
      <dl className="mt-4 divide-y divide-[#eef2f6]">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="flex items-center gap-3 py-2.5 text-sm">
            <Icon size={16} aria-hidden="true" className="shrink-0 text-[#a0aec0]" />
            <dt className="w-32 shrink-0 text-[#718096]">{label}</dt>
            <dd className="min-w-0 font-semibold text-[#2d3748] first-letter:uppercase">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#f8fafc] px-3.5 py-3 text-[13px] text-[#718096]"><Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />Giữ chỗ robot gồm cả thời gian chuẩn bị và kết thúc.</p>
      <Link to={`/staff/manage/tours/${tour.id}`} className={`${buttonClass('primary')} mt-4 w-full`}>Xem chi tiết Tour</Link>
      <Link to="/staff/manage/registrations" className={`mt-3 block rounded-md text-center text-sm font-semibold text-[#2d3748] underline-offset-4 hover:underline ${focus}`}>Xem đăng ký</Link>
    </aside>
  )
}

/** Each robot's held windows across the working day. A Tour without a hold has no bar and stays in the list view. */
function RobotDay({ tours, onSelect }: { tours: TourSummary[]; onSelect: (id: string) => void }) {
  const held = tours.filter(tour => tour.reservation)
  const robots = [...new Set(held.map(tour => tour.reservation!.robotCode))].sort()
  if (robots.length === 0) return <div className="p-4"><EmptyPanel>Các buổi trong ngày này không giữ robot.</EmptyPanel></div>
  const marks = Array.from({ length: 7 }, (_, i) => DAY_OPENS / 60 + i * 2)
  return <div className="p-4">
    <div aria-hidden="true" className="relative mb-2 ml-28 h-4 text-[11px] text-[#718096]">{marks.map(hour => <span key={hour} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(hour * 60 - DAY_OPENS) / DAY_MINUTES * 100}%` }}>{String(hour).padStart(2, '0')}:00</span>)}</div>
    <ul aria-label="Robot trong ngày" className="space-y-2">{robots.map(robot => <li key={robot} className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate font-mono text-xs font-semibold text-[#2d3748]">{robot}</span>
      <div className="relative h-11 min-w-0 flex-1 rounded-lg bg-[#f8fafc]">
        {held.filter(tour => tour.reservation!.robotCode === robot).map(tour => {
          const left = Math.max(0, (campusMinutes(tour.reservation!.startsAt) - DAY_OPENS) / DAY_MINUTES * 100)
          const width = Math.min(100 - left, (new Date(tour.reservation!.endsAt).getTime() - new Date(tour.reservation!.startsAt).getTime()) / 60_000 / DAY_MINUTES * 100)
          return <Link key={tour.id} to={`/staff/manage/tours/${tour.id}`} onClick={event => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); onSelect(tour.id) } }}
            title={`${campusTime(tour.reservation!.startsAt)} - ${campusTime(tour.reservation!.endsAt)}`}
            className={`absolute inset-y-1 truncate rounded-md border px-2 text-xs leading-8 font-semibold ${CHIP[tour.state]} ${focus}`}
            style={{ left: `${left}%`, width: `${width}%` }}>{tour.name}</Link>
        })}
      </div>
    </li>)}</ul>
  </div>
}

function SessionList({ tours, onSelect, selectedId }: { tours: TourSummary[]; onSelect: (id: string) => void; selectedId?: string }) {
  return <ul aria-label="Lịch tour" className="divide-y divide-[#eef2f6]">{tours.map(tour => <li key={tour.id}>
    <button type="button" onClick={() => onSelect(tour.id)} aria-pressed={tour.id === selectedId} className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9] ${tour.id === selectedId ? 'bg-[#f5f9ff]' : ''}`}>
      <span className="w-24 shrink-0 font-bold text-[#2d3748] tabular-nums">{span(tour)}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold text-[#2d3748]">{tour.name}</span>
        <span className="block text-xs text-[#718096]">{tour.routeName}{tour.reservation && ` · robot ${tour.reservation.robotCode} · giữ ${campusTime(tour.reservation.startsAt)} - ${campusTime(tour.reservation.endsAt)}`}</span></span>
      <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${CHIP[tour.state]}`}>{TOUR_STATE_LABEL[tour.state]}</span>
    </button>
  </li>)}</ul>
}
