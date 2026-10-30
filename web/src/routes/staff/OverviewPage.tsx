import { useCallback } from 'react'
import { BatteryMedium, Bot, CalendarDays, MonitorPlay } from 'lucide-react'
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

const panel = 'min-w-0 overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white'
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
  const figures = [
    { label: 'Buổi trong ngày', value: list.length, note: 'Trong lịch vận hành', filter: 'all' },
    { label: 'Đã hoàn thành', value: completed, note: `${completed} / ${list.length} buổi`, filter: 'Completed' },
    { label: 'Đang chạy', value: running.length, note: running[0]?.code ?? 'Không có buổi đang chạy', filter: 'Running' },
    { label: 'Cần hỗ trợ', value: assistance, note: assistance ? 'Cần nhân viên kiểm tra' : 'Không có cảnh báo', filter: 'assistance' },
  ] as const

  return <StaffPage>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium tracking-[0.07em] text-[#2d719e]">CAMPUSTOUR · VẬN HÀNH</p>
        <h1 className="text-2xl leading-tight font-bold tracking-[-0.025em] text-[#0f172a] sm:text-[28px]">Tổng quan vận hành</h1>
        <p className="mt-2 text-sm text-[#64748b]">{formatDate(`${day}T12:00:00`)}{day === today ? ', hôm nay' : ''}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Chọn ngày tổng quan" min={availableDays[0].date} max={today} value={day}
          onChange={event => { if (availableDays.some(item => item.date === event.target.value)) selectDay(event.target.value) }}
          className={`min-h-10 min-w-0 rounded-xl border border-[#d9e9f5] bg-white px-3 text-sm text-[#173b59] ${focus}`} />
        <Link to={`/staff/schedule${day === today ? '' : `?date=${day}`}`} className={buttonClass('secondary')}><CalendarDays size={15} aria-hidden="true" />Xem lịch</Link>
      </div>
    </header>

    {urgent.length > 0 && <section aria-label="Cảnh báo vận hành hiện tại">
      {day !== today && <p className="mb-2 text-xs font-semibold text-[#b23e31]">Cảnh báo vận hành hôm nay</p>}
      <AttentionList items={urgent} />
    </section>}

    <section aria-label="Tình hình trong ngày" className={`${panel} mb-5 grid grid-cols-2 gap-y-4 py-4 lg:grid-cols-4`}>
      {figures.map((item, index) => <button key={item.filter} type="button" onClick={() => selectFilter(item.filter)} aria-pressed={filter === item.filter}
        className={`flex min-w-0 flex-col gap-1.5 px-4 py-1 text-left transition-colors hover:bg-[#f1f8fe] sm:px-5 ${focus} ${index % 2 === 0 ? 'border-r border-[#e2e8f0]' : ''} ${index === 1 ? 'lg:border-r lg:border-[#e2e8f0]' : ''} ${filter === item.filter && filter !== 'all' ? 'bg-[#f1f8fe]' : ''}`}>
        <span className="text-xs text-[#64748b]">{item.label}</span>
        <strong className={`text-[30px] leading-tight font-semibold tracking-[-0.025em] tabular-nums ${item.filter === 'assistance' && assistance ? 'text-[#b23e31]' : 'text-[#173b59]'}`}>{known ? item.value : '-'}</strong>
        <span className="text-xs text-[#64748b]">{known ? item.note : tours.isError ? 'Không tải được dữ liệu' : 'Đang tải dữ liệu…'}</span>
      </button>)}
    </section>

    <div className="mb-5 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className={panel} aria-label="Buổi hoàn thành trong bảy ngày">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2 sm:px-5"><h2 className="text-[15px] font-semibold text-[#0f172a]">Buổi hoàn thành</h2><span className="text-xs text-[#64748b]">7 ngày gần nhất</span></div>
        {chartFailed ? <div className="p-4"><ErrorPanel error={chartFailed.error} onRetry={chartFailed.refetch} /></div> : !chartReady ? <div className="p-4"><LoadingPanel label="Đang tải biểu đồ hoàn thành…" /></div> :
          <OverviewCompletedChart days={chartDays} selectedDate={day} onDate={selectDay} />}
      </section>
      <section className={panel} aria-label="Trạng thái trong ngày">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 sm:px-5"><h2 className="text-[15px] font-semibold text-[#0f172a]">Trạng thái trong ngày</h2><span className="text-xs text-[#64748b]">{known ? `${list.length} buổi` : '-'}</span></div>
        {tours.isError ? <div className="p-4"><ErrorPanel error={tours.error} onRetry={tours.refetch} /></div> : tours.isPending ? <div className="p-4"><LoadingPanel label="Đang tải trạng thái…" /></div> :
          <OverviewStateRing tours={list} filter={filter} onFilter={selectFilter} />}
      </section>
    </div>

    <section className={panel} aria-label="Danh sách buổi tổng quan">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5"><h2 className="text-[15px] font-semibold text-[#0f172a]">Buổi trong ngày</h2><span className="text-xs text-[#64748b]">{known ? `${rows.length} / ${list.length} buổi` : 'Đang tải…'}</span></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f4] px-4 pb-3 sm:px-5">
        <div role="group" aria-label="Lọc buổi tổng quan" className="flex flex-wrap gap-1">
          {(['all', 'Running', 'Ready', 'Scheduled', 'Completed', 'Cancelled', ...(assistance || filter === 'assistance' ? ['assistance'] : [])] as OverviewFilter[]).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => selectFilter(value)}
            className={`min-h-8 rounded-lg border px-2.5 text-xs transition-colors ${focus} ${filter === value ? 'border-[#d9e9f5] bg-[#f1f8fe] font-semibold text-[#2d719e]' : 'border-transparent text-[#64748b] hover:bg-[#f8fafc]'}`}>
            {value === 'all' ? 'Tất cả' : value === 'assistance' ? 'Cần hỗ trợ' : statusLabel(value)}
          </button>)}
        </div>
        <SearchField value={search} onChange={value => update({ q: value || null })} placeholder="Tìm mã, tên, trường…" label="Tìm buổi tổng quan" className="w-full sm:w-64" />
      </div>
      {tours.isError ? <div className="p-4"><ErrorPanel error={tours.error} onRetry={tours.refetch} /></div> : tours.isPending ? <div className="p-4"><LoadingPanel /></div> : rows.length === 0 ?
        <div className="px-5 py-10 text-center"><p className="text-sm text-[#64748b]">{search || filter !== 'all' ? 'Không có buổi khớp bộ lọc.' : 'Không có buổi tham quan trong ngày đã chọn.'}</p>{(search || filter !== 'all') && <button type="button" onClick={() => update({ view: null, q: null })} className={`${buttonClass('secondary', 'sm')} mt-3`}>Xóa bộ lọc</button>}</div> :
        <ul className="divide-y divide-[#eef1f4]" aria-label="Buổi tổng quan">{rows.map(tour => {
          const action = tourAction(tour)
          return <li key={tour.id} className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4 sm:px-5 lg:grid-cols-[56px_minmax(0,1fr)_auto_auto]">
            <time className="self-start pt-0.5 text-sm font-semibold text-[#173b59] tabular-nums" dateTime={tour.scheduledAt}>{formatTime(tour.scheduledAt)}</time>
            <div className="min-w-0"><button type="button" onClick={() => update({ tour: tour.id })} className={`rounded-md text-left text-sm font-semibold text-[#0f172a] hover:text-[#2d719e] hover:underline ${focus}`}>{tour.name}<span className="sr-only">, {tour.code}</span></button>
              <p className="mt-1 text-xs text-[#64748b]"><span className="font-mono">{tour.code}</span> · {tour.registrations[0]?.schoolName || tour.routeName}</p>
            </div>
            <span className="col-start-2 lg:col-start-auto"><TourStateBadges tour={tour} showReason={false} /></span>
            <Link to={action.to} aria-label={`${action.label} ${tour.code}`} className={`${buttonClass(tour.state === 'Running' ? 'primary' : 'secondary', 'sm')} col-start-2 justify-self-start lg:col-start-auto`}>{tour.state === 'Running' && <MonitorPlay size={14} aria-hidden="true" />}{action.label}</Link>
          </li>
        })}</ul>}
      {known && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1f4] px-4 py-3 text-xs text-[#64748b] sm:px-5"><p>Hiển thị {rows.length} / {list.length} buổi{filter !== 'all' ? `, ${filter === 'assistance' ? 'cần hỗ trợ' : statusLabel(filter).toLowerCase()}` : ''}</p><Link to="/staff/tours" className="font-semibold text-[#2d719e] hover:underline">Mở buổi hôm nay</Link></div>}
    </section>

    {preparation.length > 0 && <details className="mt-5">
      <summary className={`w-fit cursor-pointer rounded-md text-sm font-semibold text-[#173b59] ${focus}`}>Việc cần chú ý ({preparation.length})</summary><div className="mt-3"><AttentionList items={preparation} /></div>
    </details>}

    <footer className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#e2e8f0] pt-4 text-xs text-[#64748b]" aria-label="Tình trạng robot">
      {robots.isError ? <><span>Không tải được dữ liệu robot.</span><button type="button" onClick={() => void robots.refetch()} className="text-[#2d719e] hover:underline">Thử lại dữ liệu robot</button></> : robots.isPending ? <span>Đang tải dữ liệu robot…</span> : robot ? <>
        <Link to="/staff/robot" className="inline-flex items-center gap-2 hover:text-[#173b59]"><Bot size={15} aria-hidden="true" /><b className="font-semibold text-[#173b59]">{robot.name}</b>{statusLabel(robot.connectionState)}</Link>
        <span className="inline-flex items-center gap-2"><BatteryMedium size={15} aria-hidden="true" />Pin: {formatBattery(robot.batteryPercent)}</span>
      </> : <span>Chưa có dữ liệu robot.</span>}
    </footer>

    <TourInspector tour={selected} now={now} open={Boolean(selected)} onClose={close} panelRef={panelRef} />
  </StaffPage>
}
