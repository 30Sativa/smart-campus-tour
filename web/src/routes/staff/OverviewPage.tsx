import { useCallback } from 'react'
import { ArrowRight, BatteryMedium, Bot, CalendarDays, CircleCheck, LifeBuoy, ListChecks, MonitorPlay } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useStaffAmrs, useTours } from '../../features/staff/staff-hooks'
import { ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, SearchField } from '../../components/ui/ConsolePrimitives'
import { buttonClass } from '../../components/ui/ui-classes'
import { buildAttentionQueue, tourAction } from '../../features/staff/attention'
import { formatBattery, formatDate, formatTime } from '../../features/staff/formatters'
import { useNow } from '../../features/staff/use-now'
import { byStart, matchesSearch } from '../../features/staff/today-board'
import { TourStateBadges } from '../../features/staff/components/TourParts'
import { TourInspector } from '../../features/staff/components/TourInspector'
import { AttentionList } from '../../features/staff/components/AttentionList'
import { OverviewCompletedChart, OverviewStateRing } from '../../features/staff/components/OverviewDashboardCharts'
import { isOverviewFilter, matchesOverviewFilter, overviewDate, overviewDays, type OverviewFilter } from '../../features/staff/overview-dashboard'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { statusLabel } from '../../features/staff/status'

const panel = 'ct-panel min-w-0 overflow-hidden rounded-[15px] bg-white shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)]'
const cardTitle = 'text-lg leading-tight font-bold text-[#2d3748]'
const cardNote = 'text-sm text-[#a0aec0]'
const column = 'text-[10px] font-bold tracking-[0.06em] text-[#a0aec0] uppercase'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] focus-visible:ring-offset-2'
const PRIORITY = { Running: 0, Ready: 1, Scheduled: 2, Completed: 3, Cancelled: 4 }

/** Analytical overview using the existing operations queries and preflight flow. */
export default function OverviewPage() {
  const [params, setParams] = useSearchParams()
  const now = useNow(30_000)
  const today = overviewDate(now)
  const availableDays = overviewDays([], [], now)
  const requestedDate = params.get('date')
  const day = requestedDate && availableDays.some(item => item.date === requestedDate) ? requestedDate : today
  const requestedFilter = params.get('view')
  const filter: OverviewFilter = isOverviewFilter(requestedFilter) ? requestedFilter : 'all'
  const search = params.get('q') ?? ''
  const todayTours = useTours()
  const tours = useTours(day === today ? {} : { date: day })
  const history = useTours({ history: true })
  const robots = useStaffAmrs()
  const list = tours.data ?? []
  const selected = list.find(tour => tour.id === params.get('tour'))

  const update = useCallback((changes: Record<string, string | null>) => setParams(current => {
    const next = new URLSearchParams(current)
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key) }
    return next
  }, { replace: true }), [setParams])
  const close = useCallback(() => update({ tour: null }), [update])
  const panelRef = useMobileNav(Boolean(selected), close)
  const selectDay = (value: string) => update({ date: value === today ? null : value, view: null, tour: null, q: null })
  const selectFilter = (value: OverviewFilter) => update({ view: value === 'all' || value === filter ? null : value })
  const rows = list.filter(tour => matchesOverviewFilter(tour, filter) && matchesSearch(tour, search))
    .sort((a, b) => PRIORITY[a.state] - PRIORITY[b.state] || byStart(a, b))
  const completed = list.filter(tour => tour.state === 'Completed').length
  const running = list.filter(tour => tour.state === 'Running')
  const assistance = list.filter(tour => matchesOverviewFilter(tour, 'assistance')).length
  const known = tours.isSuccess
  const chartFailed = history.isError ? history : todayTours.isError ? todayTours : null
  const chartReady = history.isSuccess && todayTours.isSuccess
  const chartDays = overviewDays([...(todayTours.data ?? []), ...list], history.data ?? [], now)
  const attention = buildAttentionQueue({ tours: todayTours.data ?? [], robots: robots.data ?? [] }, now)
  const urgent = attention.filter(item => item.tone === 'danger')
  const preparation = attention.filter(item => item.tone !== 'danger')
  const robot = robots.data?.find(item => item.id === running[0]?.robotId) ?? robots.data?.find(item => item.assignable !== false)
  const figures: ReadonlyArray<{ label: string; value: number; note: string; filter: OverviewFilter; icon: LucideIcon }> = [
    { label: 'Buổi trong ngày', value: list.length, note: 'Trong lịch vận hành', filter: 'all', icon: ListChecks },
    { label: 'Đã hoàn thành', value: completed, note: `${completed} / ${list.length} buổi`, filter: 'Completed', icon: CircleCheck },
    { label: 'Đang chạy', value: running.length, note: running[0]?.code ?? 'Không có buổi đang chạy', filter: 'Running', icon: MonitorPlay },
    { label: 'Cần hỗ trợ', value: assistance, note: assistance ? 'Cần nhân viên kiểm tra' : 'Không có cảnh báo', filter: 'assistance', icon: LifeBuoy },
  ]
  // The hero card follows the session that matters now: the running one, else the next to start.
  const focusTour = running[0] ?? [...list].filter(tour => tour.state === 'Ready' || tour.state === 'Scheduled').sort(byStart)[0]
  const focusAction = focusTour ? tourAction(focusTour) : null

  return <StaffPage>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl leading-tight font-bold text-[#2d3748] sm:text-2xl">Tổng quan vận hành</h1>
        <p className="mt-1 text-sm text-[#a0aec0]">{formatDate(`${day}T12:00:00`)}{day === today ? ', hôm nay' : ''}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Chọn ngày tổng quan" min={availableDays[0].date} max={today} value={day}
          onChange={event => { if (availableDays.some(item => item.date === event.target.value)) selectDay(event.target.value) }}
          className={`min-h-10 min-w-0 rounded-[15px] border border-[#e2e8f0] bg-white px-3 text-sm text-[#2d3748] ${focus}`} />
        <Link to={`/staff/schedule${day === today ? '' : `?date=${day}`}`} className={buttonClass('secondary')}><CalendarDays size={15} aria-hidden="true" />Xem lịch</Link>
      </div>
    </header>

    {urgent.length > 0 && <section aria-label="Cảnh báo vận hành hiện tại">
      {day !== today && <p className="mb-2 text-xs font-semibold text-[#b23e31]">Cảnh báo vận hành hôm nay</p>}
      <AttentionList items={urgent} />
    </section>}

    <section aria-label="Tình hình trong ngày" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
      {figures.map(item => {
        const alarm = item.filter === 'assistance' && assistance > 0
        const pressed = filter === item.filter
        return <button key={item.filter} type="button" onClick={() => selectFilter(item.filter)} aria-pressed={pressed}
          className={`${panel} flex items-center justify-between gap-3 p-[18px] text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(37,99,235,0.35)] motion-reduce:transition-none ${focus} ${pressed && filter !== 'all' ? 'ring-2 ring-[#2563eb]' : ''}`}>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-[#a0aec0]">{item.label}</span>
            <strong className={`mt-0.5 block text-lg leading-tight font-bold tabular-nums ${alarm ? 'text-[#b23e31]' : 'text-[#2d3748]'}`}>{known ? item.value : '-'}</strong>
            <span className={`mt-0.5 block truncate text-xs font-bold ${alarm ? 'text-[#b23e31]' : item.filter === 'Completed' && known ? 'text-[#2f8f6b]' : 'text-[#a0aec0]'}`}>{known ? item.note : tours.isError ? 'Không tải được dữ liệu' : 'Đang tải dữ liệu…'}</span>
          </span>
          <span aria-hidden="true" className={`grid size-[45px] shrink-0 place-items-center rounded-xl ${alarm ? 'bg-[#fdecea] text-[#c9534a]' : 'bg-[#e6efff] text-[#2563eb]'}`}><item.icon size={20} strokeWidth={2.1} /></span>
        </button>
      })}
    </section>

    <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className={`${panel} flex flex-col p-5 sm:p-6`} aria-label="Buổi cần theo dõi">
        <p className="text-sm font-bold text-[#a0aec0]">{running[0] ? 'Đang chạy' : focusTour ? 'Buổi tiếp theo' : 'Trong ngày đã chọn'}</p>
        {known && focusTour && focusAction ? <>
          <h2 className="mt-1 text-lg leading-snug font-bold text-[#2d3748]">{focusTour.name}</h2>
          <p className="mt-1 text-sm text-[#718096]"><span className="font-mono">{focusTour.code}</span> · {formatTime(focusTour.scheduledAt)} · {focusTour.registrations[0]?.schoolName || focusTour.routeName}</p>
          <div className="mt-3"><TourStateBadges tour={focusTour} showReason={false} /></div>
          <Link to={focusAction.to} className={`group mt-auto inline-flex items-center gap-1.5 self-start rounded-md pt-5 text-sm font-bold text-[#2d3748] hover:text-[#2563eb] ${focus}`}>{focusAction.label} {focusTour.code}<ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></Link>
        </> : <>
          <h2 className="mt-1 text-lg font-bold text-[#2d3748]">{known ? 'Không có buổi đang chạy hay sắp bắt đầu' : '-'}</h2>
          <p className="mt-1 text-sm text-[#718096]">{known ? 'Xem lịch để chuẩn bị các buổi tiếp theo.' : tours.isError ? 'Không tải được dữ liệu.' : 'Đang tải dữ liệu…'}</p>
        </>}
      </section>

      <section aria-label="Tình trạng robot" className="relative flex min-h-[220px] flex-col overflow-hidden rounded-[15px] bg-[linear-gradient(135deg,#eef4ff_0%,#e3edff_55%,#d6e6ff_100%)] p-5 text-[#1e3a8a] shadow-[0_3.5px_5.5px_rgba(0,0,0,0.04)] sm:p-6">
        <span aria-hidden="true" className="pointer-events-none absolute -top-16 -right-14 size-56 rounded-full border-[28px] border-white/50" />
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -bottom-20 size-44 rounded-full bg-white/40" />
        <p className="relative text-sm font-bold text-[#64748b]">Robot dẫn tour</p>
        {robots.isError ? <div className="relative mt-2"><p className="text-sm">Không tải được dữ liệu robot.</p><button type="button" onClick={() => void robots.refetch()} className="mt-2 rounded-md text-sm font-bold underline-offset-2 hover:underline">Thử lại dữ liệu robot</button></div>
          : robots.isPending ? <p className="relative mt-2 text-sm text-[#475569]">Đang tải dữ liệu robot…</p>
          : robot ? <div className="relative mt-1 flex flex-1 flex-col">
            <h2 className="flex items-center gap-2 text-lg font-bold"><Bot size={18} aria-hidden="true" />{robot.name}</h2>
            <p className="mt-1 text-sm text-[#475569]">{statusLabel(robot.connectionState)}</p>
            <div className="mt-4 max-w-72">
              <p className="flex items-center justify-between text-xs font-bold text-[#64748b]"><span className="inline-flex items-center gap-1.5"><BatteryMedium size={14} aria-hidden="true" />Pin</span><span className="text-[#1e3a8a] tabular-nums">{formatBattery(robot.batteryPercent)}</span></p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-[#60a5fa]" style={{ width: `${Math.max(0, Math.min(100, robot.batteryPercent ?? 0))}%` }} /></div>
            </div>
            <Link to="/staff/robot" className="group mt-auto inline-flex items-center gap-1.5 self-start rounded-md pt-5 text-sm font-bold text-[#1d4ed8] hover:text-[#1e40af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">Robot & thiết bị<ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></Link>
          </div>
          : <p className="relative mt-2 text-sm text-[#475569]">Chưa có dữ liệu robot.</p>}
      </section>
    </div>

    <div className="mb-6 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className={panel} aria-label="Buổi hoàn thành trong bảy ngày">
        <div className="px-4 pt-5 pb-2 sm:px-6"><h2 className={cardTitle}>Buổi hoàn thành</h2><p className={cardNote}>7 ngày gần nhất</p></div>
        {chartFailed ? <div className="p-4"><ErrorPanel error={chartFailed.error} onRetry={chartFailed.refetch} /></div> : !chartReady ? <div className="p-4"><LoadingPanel label="Đang tải biểu đồ hoàn thành…" /></div> :
          <OverviewCompletedChart days={chartDays} selectedDate={day} onDate={selectDay} />}
      </section>
      <section className={panel} aria-label="Trạng thái trong ngày">
        <div className="px-4 pt-5 pb-2 sm:px-6"><h2 className={cardTitle}>Trạng thái trong ngày</h2><p className={cardNote}>{known ? `${list.length} buổi` : '-'}</p></div>
        {tours.isError ? <div className="p-4"><ErrorPanel error={tours.error} onRetry={tours.refetch} /></div> : tours.isPending ? <div className="p-4"><LoadingPanel label="Đang tải trạng thái…" /></div> :
          <OverviewStateRing tours={list} filter={filter} onFilter={selectFilter} />}
      </section>
    </div>

    <section className={panel} aria-label="Danh sách buổi tổng quan">
      <div className="px-4 pt-5 pb-3 sm:px-6"><h2 className={cardTitle}>Buổi trong ngày</h2><p className={cardNote}>{known ? `${rows.length} / ${list.length} buổi` : 'Đang tải…'}</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4 sm:px-6">
        <div role="group" aria-label="Lọc buổi tổng quan" className="flex flex-wrap gap-1">
          {(['all', 'Running', 'Ready', 'Scheduled', 'Completed', 'Cancelled', ...(assistance || filter === 'assistance' ? ['assistance'] : [])] as OverviewFilter[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => selectFilter(value)}
            className={`min-h-8 rounded-xl px-3 text-xs font-bold transition-colors ${focus} ${filter === value ? 'bg-[#e6efff] text-[#1d4ed8]' : 'text-[#a0aec0] hover:bg-[#f8f9fa] hover:text-[#2d3748]'}`}>
            {value === 'all' ? 'Tất cả' : value === 'assistance' ? 'Cần hỗ trợ' : statusLabel(value)}
          </button>)}
        </div>
        <SearchField value={search} onChange={value => update({ q: value || null })} placeholder="Tìm mã, tên, trường…" label="Tìm buổi tổng quan" className="w-full sm:w-64" />
      </div>
      {tours.isError ? <div className="p-4"><ErrorPanel error={tours.error} onRetry={tours.refetch} /></div> : tours.isPending ? <div className="p-4"><LoadingPanel /></div> : rows.length === 0 ?
        <div className="px-5 py-10 text-center"><p className="text-sm text-[#64748b]">{search || filter !== 'all' ? 'Không có buổi khớp bộ lọc.' : 'Không có buổi tham quan trong ngày đã chọn.'}</p>{(search || filter !== 'all') && <button type="button" onClick={() => update({ view: null, q: null })} className={`${buttonClass('secondary', 'sm')} mt-3`}>Xóa bộ lọc</button>}</div> :
        <>
          <div aria-hidden="true" className="hidden grid-cols-[64px_minmax(0,1fr)_200px_190px] gap-x-4 border-b border-[#e2e8f0] px-6 pb-2 lg:grid">
            <span className={column}>Giờ</span><span className={column}>Buổi tham quan</span><span className={column}>Trạng thái</span><span className={`${column} text-right`}>Thao tác</span>
          </div>
          <ul className="divide-y divide-[#e2e8f0]" aria-label="Buổi tổng quan">{rows.map(tour => {
            const action = tourAction(tour)
            return <li key={tour.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-[#f8f9fa] sm:px-6 lg:grid-cols-[64px_minmax(0,1fr)_200px_190px]">
              <time className="self-start pt-2.5 text-sm font-bold text-[#2d3748] tabular-nums lg:self-center lg:pt-0" dateTime={tour.scheduledAt}>{formatTime(tour.scheduledAt)}</time>
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eff6ff] text-[11px] font-extrabold text-[#2563eb]">{tour.code.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)}</span>
                <div className="min-w-0">
                  <button type="button" onClick={() => update({ tour: tour.id })} className={`max-w-full truncate rounded-md text-left text-sm font-bold text-[#2d3748] hover:text-[#2563eb] ${focus}`}>{tour.name}<span className="sr-only">, {tour.code}</span></button>
                  <p className="truncate text-sm text-[#718096]"><span className="font-mono text-xs">{tour.code}</span> · {tour.registrations[0]?.schoolName || tour.routeName}</p>
                </div>
              </div>
              <span className="col-start-2 lg:col-start-auto"><TourStateBadges tour={tour} showReason={false} /></span>
              <Link to={action.to} aria-label={`${action.label} ${tour.code}`} className={`${buttonClass(tour.state === 'Running' ? 'primary' : 'secondary', 'sm')} col-start-2 justify-self-start lg:col-start-auto lg:justify-self-end`}>{tour.state === 'Running' && <MonitorPlay size={14} aria-hidden="true" />}{action.label}</Link>
            </li>
          })}</ul>
        </>}
      {known && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f0] px-4 py-3.5 text-xs text-[#a0aec0] sm:px-6"><p>Hiển thị {rows.length} / {list.length} buổi{filter !== 'all' ? `, ${filter === 'assistance' ? 'cần hỗ trợ' : statusLabel(filter).toLowerCase()}` : ''}</p><Link to="/staff/tours" className="font-bold text-[#2563eb] hover:underline">Mở buổi hôm nay</Link></div>}
    </section>

    {preparation.length > 0 && <details className="mt-6">
      <summary className={`w-fit cursor-pointer rounded-md text-sm font-bold text-[#2d3748] ${focus}`}>Việc cần chú ý ({preparation.length})</summary><div className="mt-3"><AttentionList items={preparation} /></div>
    </details>}


    <TourInspector tour={selected} now={now} open={Boolean(selected)} onClose={close} panelRef={panelRef} />
  </StaffPage>
}
