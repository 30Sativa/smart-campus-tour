import { useCallback, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, Clock, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { buttonClass } from '../../components/ui/ui-classes'
import type { TourOperation, TourState } from '../../api/contracts/staff'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, SearchField } from '../../components/ui/ConsolePrimitives'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { formatDate, formatTime } from '../../features/staff/formatters'
import { useMediaQuery } from '../../features/staff/use-media-query'
import { useNow } from '../../features/staff/use-now'
import { groupSummary } from '../../features/staff/attention'
import { TODAY_STAGES, byStart, clockLabel, defaultTour, matchesSearch, minuteOfDay, studentsToday, timeHint, tourNote, type TodayFilter } from '../../features/staff/today-board'
import { TourInspector } from '../../features/staff/components/TourInspector'
import { TodayDetailPanel } from '../../features/staff/components/TodayDetailPanel'
import { TourStateBadges } from '../../features/staff/components/TourParts'
import { StateFilter } from '../../features/staff/components/StateFilter'

const STATES = TODAY_STAGES.map((stage) => stage.key)
const ENDED: TourState[] = ['Completed', 'Cancelled']
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'
const card = 'ct-panel min-w-0 rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const column = 'text-xs font-semibold text-[#718096]'

/**
 * Today's sessions: the day in five figures, then the schedule beside the
 * chosen session. "Đang & sắp tới" keeps finished and cancelled sessions folded
 * at the bottom. `?view=` filters by state and `?tour=` keeps the chosen
 * session in the address. From 1280px the detail stays docked beside the list;
 * below that, choosing a session opens it as a dialog.
 */
export default function ToursTodayPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'active' | 'all'>('active')
  const tours = useTours()
  const now = useNow(30_000)

  const asked = params.get('view')
  const view: TodayFilter = asked === 'ended' ? 'Completed' : asked && STATES.includes(asked as TourState) ? (asked as TourState) : 'all'
  const all = useMemo(() => [...(tours.data ?? [])].sort(byStart), [tours.data])
  const rows = useMemo(() => all.filter((tour) => (view === 'all' || tour.state === view) && matchesSearch(tour, search)), [all, view, search])
  const split = view === 'all' && tab === 'active'
  const shown = split ? rows.filter((tour) => !ENDED.includes(tour.state)) : rows
  const ended = split ? rows.filter((tour) => ENDED.includes(tour.state)) : []
  const activeCount = all.filter((tour) => !ENDED.includes(tour.state)).length

  const chosen = all.find((tour) => tour.id === params.get('tour'))
  const docked = useMediaQuery('(min-width: 1280px)')
  const focusTour = chosen ?? defaultTour(all, now)
  const drawerOpen = Boolean(chosen) && !docked

  const update = useCallback(
    (change: (next: URLSearchParams) => void) =>
      setParams((current) => { const next = new URLSearchParams(current); change(next); return next }, { replace: true }),
    [setParams],
  )
  const select = (id: string) => update((next) => next.set('tour', id))
  const close = useCallback(() => update((next) => next.delete('tour')), [update])
  const setView = (value: TodayFilter) => update((next) => (value === 'all' ? next.delete('view') : next.set('view', value)))
  const panelRef = useMobileNav(drawerOpen, close)

  return (
    <StaffPage>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-bold text-[#2d3748] sm:text-2xl">Buổi hôm nay</h1>
          <p className="mt-1 text-sm text-[#a0aec0]">{formatDate(new Date(now).toISOString())}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-[#2d3748] tabular-nums shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]"><Clock size={15} aria-hidden="true" className="text-[#718096]" />{clockLabel(minuteOfDay(now))}</span>
          <Link to="/staff/schedule" className={buttonClass('secondary')}><CalendarDays size={15} aria-hidden="true" />Xem lịch</Link>
          <Link to="/staff/manage/tours/new" className={buttonClass('primary')}><Plus size={16} aria-hidden="true" />Tạo Tour</Link>
        </div>
      </header>

      {tours.data && <TodayFigures tours={all} />}

      {tours.isPending ? <LoadingPanel /> : tours.isError ? <ErrorPanel error={tours.error} onRetry={tours.refetch} /> : (
        <div className={docked ? 'grid items-start gap-5 grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]' : ''}>
          <section className={card} aria-label="Danh sách buổi hôm nay">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
              <h2 className="text-lg font-bold text-[#2d3748]">Lịch trong ngày</h2>
              <span className="text-xs text-[#a0aec0]">Hiện tại {clockLabel(minuteOfDay(now))}</span>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e8f0] px-5 pt-3">
              <div role="tablist" aria-label="Phạm vi danh sách" className="flex gap-4">
                {([['active', `Đang & sắp tới (${activeCount})`], ['all', `Tất cả (${all.length})`]] as const).map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} disabled={view !== 'all'} onClick={() => setTab(key)}
                    className={`relative pb-3 text-sm font-semibold transition-colors disabled:opacity-50 ${focus} ${tab === key && view === 'all' ? 'text-[#2d3748]' : 'text-[#718096] hover:text-[#2d3748]'}`}>
                    {label}
                    <span aria-hidden="true" className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#60a5fa] transition-transform duration-200 motion-reduce:transition-none ${tab === key && view === 'all' ? 'scale-x-100' : 'scale-x-0'}`} />
                  </button>
                ))}
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 pb-3 sm:w-auto">
                <SearchField value={search} onChange={setSearch} placeholder="Tìm mã, tên trường…" label="Tìm buổi hôm nay" className="w-full sm:w-56" />
                <StateFilter<TodayFilter>
                  label="Lọc buổi theo trạng thái"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'all', label: 'Tất cả trạng thái', count: all.length },
                    ...TODAY_STAGES.map((stage) => ({ value: stage.key, label: stage.label, color: stage.color, count: all.filter((tour) => tour.state === stage.key).length })),
                  ]}
                />
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="p-4"><EmptyPanel>
                {search.trim() ? 'Không tìm thấy buổi nào phù hợp từ khóa.' : view === 'all' ? 'Hôm nay chưa có buổi tham quan nào.' : `Không có buổi nào ở trạng thái “${TODAY_STAGES.find((stage) => stage.key === view)?.label}”.`}
              </EmptyPanel></div>
            ) : (
              <div className="px-3 pt-3 sm:px-4">
                <div aria-hidden="true" className="hidden grid-cols-[96px_minmax(0,1fr)_190px_20px] gap-x-4 rounded-xl bg-[#f8fafc] px-4 py-2.5 md:grid">
                  <span className={column}>Giờ</span><span className={column}>Buổi / Đoàn</span><span className={column}>Trạng thái</span><span />
                </div>
                {shown.length > 0
                  ? <TodayRows tours={shown} now={now} selectedId={docked ? focusTour?.id : chosen?.id} onSelect={select} label="Buổi hôm nay" />
                  : <p className="px-4 py-8 text-center text-sm text-[#718096]">Không còn buổi nào đang chạy hay sắp tới.</p>}
                {ended.length > 0 && (
                  <details className="group mt-2 rounded-xl border border-[#e2e8f0]">
                    <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 [&::-webkit-details-marker]:hidden ${focus}`}>
                      <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-[#718096] transition-transform group-open:rotate-180" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-[#2d3748]">Đã kết thúc / Đã hủy ({ended.length})</span>
                        <span className="block truncate text-xs text-[#a0aec0]">{ended.map((tour) => `${formatTime(tour.scheduledAt)} ${tour.code} ${tour.state === 'Completed' ? 'đã hoàn thành' : 'đã hủy'}`).join(' · ')}</span>
                      </span>
                    </summary>
                    <div className="border-t border-[#e2e8f0] px-1 pb-1">
                      <TodayRows tours={ended} now={now} selectedId={docked ? focusTour?.id : chosen?.id} onSelect={select} label="Buổi đã kết thúc" />
                    </div>
                  </details>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-[#a0aec0]">
              <p>Đang hiển thị {shown.length} / {all.length} buổi</p>
              <Link to="/staff/schedule" className={`inline-flex items-center gap-1 rounded-md text-sm font-bold text-[#2d3748] hover:text-[#4a6fa5] ${focus}`}>Xem lịch đầy đủ<ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </section>

          {docked
            ? focusTour ? <TodayDetailPanel key={focusTour.id} tour={focusTour} /> : null
            : <TourInspector tour={chosen} now={now} open={drawerOpen} onClose={close} panelRef={panelRef} />}
        </div>
      )}
    </StaffPage>
  )
}

/** One session per row: time, who and which route, the state, and a way in. */
function TodayRows({ tours, now, selectedId, onSelect, label }: { tours: TourOperation[]; now: number; selectedId?: string; onSelect: (id: string) => void; label: string }) {
  return (
    <ul aria-label={label} className="space-y-2 py-2">
      {tours.map((tour) => {
        const groups = groupSummary(tour)
        const note = tourNote(tour)
        const selected = tour.id === selectedId
        const running = tour.state === 'Running'
        const assist = running && tour.operationalStatus === 'NeedsAssistance'
        const hint = running ? 'Đang diễn ra' : timeHint(tour, now)
        const schools = tour.registrations.filter((reg) => reg.state === 'Approved').map((reg) => reg.schoolName).filter(Boolean)
        return (
          <li key={tour.id} className={`relative overflow-hidden rounded-xl border transition-[border-color,background-color,box-shadow] duration-200 ${selected ? 'border-[#d6e4f8] bg-[#f5f9ff]' : 'border-[#edf2f7] bg-white hover:border-[#dbe7f7]'}`}>
            <button type="button" onClick={() => onSelect(tour.id)} aria-pressed={selected}
              className="grid w-full grid-cols-[88px_minmax(0,1fr)_20px] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b9dc9] md:grid-cols-[96px_minmax(0,1fr)_190px_20px]">
              <span className="self-start md:self-center">
                <span className="block text-lg leading-tight font-bold text-[#2d3748] tabular-nums">{formatTime(tour.scheduledAt)}</span>
                {hint && <span className="block text-xs whitespace-nowrap text-[#718096]">{hint}</span>}
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md bg-[#f1f5f9] px-1.5 py-px font-mono text-[11px] font-bold text-[#475569]">{tour.code}</span>
                  <b className="truncate text-sm font-bold text-[#2d3748]">{schools[0] || tour.name}</b>
                </span>
                <span className="mt-1 block truncate text-[13px] text-[#718096]">
                  {groups.groups > 1 ? `+${groups.groups - 1} đoàn · ` : ''}{groups.students} HS đã duyệt{groups.pending ? ` · ${groups.pending} chờ duyệt` : ''}
                </span>
                <span className="block truncate text-[13px] text-[#718096]">{tour.routeName}</span>
              </span>
              <span className="col-start-2 min-w-0 md:col-start-auto">
                {assist
                  ? <span className="inline-flex rounded-lg bg-[#fdecea] px-2.5 py-1 text-xs font-bold text-[#b23e31]">Cần hỗ trợ</span>
                  : <TourStateBadges tour={tour} showReason={false} />}
                {note.tone === 'warn' && <span className="mt-1 block truncate text-xs text-[#718096]">{note.text.replace(/^Chưa bắt đầu được: /, '')}</span>}
              </span>
              <ChevronRight size={18} aria-hidden="true" className="col-start-3 row-start-1 self-center text-[#a0aec0] md:col-start-auto md:row-start-auto" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** The day in five figures, on one strip. Colour only when a figure asks for work. */
function TodayFigures({ tours }: { tours: TourOperation[] }) {
  const running = tours.filter((tour) => tour.state === 'Running').length
  const assist = tours.filter((tour) => tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance').length
  const unready = tours.filter((tour) => tour.state === 'Scheduled').length
  const figures = [
    { value: tours.length, label: 'buổi trong ngày', tone: 'text-[#2d3748]' },
    { value: running, label: 'đang chạy', tone: 'text-[#2d3748]' },
    { value: assist, label: 'cần hỗ trợ', tone: 'text-[#2d3748]' },
    { value: unready, label: 'chưa chốt', tone: 'text-[#2d3748]' },
    { value: studentsToday(tours), label: 'HS đã duyệt', tone: 'text-[#2d3748]' },
  ]
  return (
    <section aria-label="Trong ngày" className={`${card} mb-5 grid grid-cols-2 gap-y-3 py-4 sm:grid-cols-3 lg:grid-cols-5`}>
      {figures.map((item, index) => (
        <p key={item.label} className={`flex items-baseline gap-2.5 px-5 ${index > 0 ? 'lg:border-l lg:border-[#e2e8f0]' : ''}`}>
          <strong className={`text-[28px] leading-none font-bold tabular-nums ${item.tone}`}>{item.value}</strong>
          <span className="text-sm text-[#718096]">{item.label}</span>
        </p>
      ))}
    </section>
  )
}
