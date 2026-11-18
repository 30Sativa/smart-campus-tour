import { PanelHead, panelClass } from '../../../components/ui/ConsolePrimitives'
import { campusDateKey, formatDate } from '../../../components/ui/date-time'
import type { TourSummary } from '../../administration/tours/types'
import { addCampusDays, type useDayTours, type useUpcomingTours } from './hooks'

const STATES = [
  { label: 'Đang diễn ra', matches: (tour: TourSummary) => tour.state === 'RUNNING', fill: 'bg-sky-800' },
  { label: 'Đã chốt', matches: (tour: TourSummary) => tour.state === 'READY', fill: 'bg-sky-300' },
  { label: 'Chưa chốt', matches: (tour: TourSummary) => tour.state === 'SCHEDULED', fill: 'bg-slate-500' },
  { label: 'Đã xong / hủy', matches: (tour: TourSummary) => tour.state === 'COMPLETED' || tour.state === 'CANCELLED', fill: 'bg-slate-300' },
]

function complete(query: ReturnType<typeof useDayTours>) {
  return query.isSuccess && query.data.pagination.totalItems <= query.data.data.length
}

type ChartsProps = {
  today: string
  day: ReturnType<typeof useDayTours>
  upcoming: ReturnType<typeof useUpcomingTours>
  keep: (tour: TourSummary) => boolean
}

/** Counts the same rows as the Staff lists, including all states scheduled in the date window. */
export function OverviewCharts({ today, day, upcoming, keep }: ChartsProps) {
  const dayRows = (day.data?.data ?? []).filter(keep)
  const showDay = complete(day)
  const showWeek = showDay && complete(upcoming)
  const rows = [...dayRows, ...(upcoming.data?.data ?? []).filter(keep)]
  const countsByDay = new Map<string, number>()
  for (const tour of rows) {
    const date = campusDateKey(tour.scheduledStartAt)
    countsByDay.set(date, (countsByDay.get(date) ?? 0) + 1)
  }
  const dates = Array.from({ length: 7 }, (_, offset) => addCampusDays(today, offset))
  const counts = dates.map(date => countsByDay.get(date) ?? 0)
  const total = counts.reduce((sum, count) => sum + count, 0)
  const axisStep = Math.max(1, Math.ceil(Math.max(...counts) / 3))
  const max = 3 * axisStep
  const states = STATES.map(state => ({ ...state, count: dayRows.filter(state.matches).length }))
  const unavailable = (pending: boolean, error: boolean) => pending ? 'Đang tải dữ liệu biểu đồ…'
    : error ? 'Không tải được dữ liệu biểu đồ.'
    : 'Dữ liệu trải trên nhiều trang. Mở Lịch Tour để xem đầy đủ.'

  return <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
    <section className={panelClass} aria-label="Lịch Tour 7 ngày">
      <PanelHead title="Lịch Tour 7 ngày" description={`${formatDate(`${today}T05:00:00Z`).slice(0, 5)} đến ${formatDate(`${dates[6]}T05:00:00Z`)}`} />
      {!showWeek ? <p className="px-4 pb-4 text-sm text-slate-600">{unavailable(day.isPending || upcoming.isPending, day.isError || upcoming.isError)}</p>
        : <figure className="px-4 pb-4 pt-1 sm:px-5">
          <figcaption className="mb-6 text-xs text-slate-600">{total} Tour theo ngày bắt đầu</figcaption>
          <div className="relative pl-8">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 grid h-28 grid-rows-3 border-b border-slate-200">
              {[3, 2, 1].map(tick => <div key={tick} className="relative ml-8 border-t border-slate-200">
                <span className="absolute right-full top-0 -translate-y-1/2 pr-2 text-[10px] tabular-nums text-slate-600">{tick * axisStep}</span>
              </div>)}
              <span className="absolute bottom-0 left-0 w-6 translate-y-1/2 text-right text-[10px] text-slate-600">0</span>
            </div>
            <ol className="relative grid grid-cols-7 gap-1" aria-label="Số Tour mỗi ngày">
              {dates.map((date, index) => {
                const count = counts[index]
                return <li className="min-w-0 text-center" key={date}>
                  <div className="flex h-28 items-end justify-center" aria-hidden="true">
                    {count > 0 && <span style={{ height: `${count / max * 100}%` }}
                      className={`relative block w-1/2 max-w-6 rounded-t-sm ${index === 0 ? 'bg-sky-800' : 'bg-sky-300'}`}>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-slate-900">{count}</span>
                    </span>}
                  </div>
                  <time dateTime={date} className="mt-2 block text-[10px] tabular-nums text-slate-700 sm:text-xs">{formatDate(`${date}T05:00:00Z`).slice(0, 5)}</time>
                  <span className="sr-only">, {count} Tour</span>
                  {index === 0 && <span className="block text-[10px] font-semibold text-sky-800">Hôm nay</span>}
                </li>
              })}
            </ol>
          </div>
        </figure>}
    </section>
    <section className={panelClass} aria-label="Trạng thái hôm nay">
      <PanelHead title="Trạng thái hôm nay" />
      {!showDay ? <p className="px-4 pb-4 text-sm text-slate-600">{unavailable(day.isPending, day.isError)}</p>
        : <div className="px-4 pb-4 pt-2 sm:px-5">
          <div aria-hidden="true" className="mb-4 flex h-3 gap-0.5 rounded-sm bg-slate-100">
            {states.filter(state => state.count > 0).map(state => <span key={state.label} style={{ flex: state.count }} className={`rounded-sm ${state.fill}`} />)}
          </div>
          <dl className="space-y-2 text-[13px] text-slate-700">
            {states.map(state => <div key={state.label} className="flex items-center justify-between gap-2">
              <dt className="flex items-center gap-2"><span aria-hidden="true" className={`size-2 rounded-xs ${state.fill}`} />{state.label}</dt>
              <dd className="shrink-0 tabular-nums"><strong className="text-slate-900">{state.count}</strong> Tour</dd>
            </div>)}
          </dl>
        </div>}
    </section>
  </div>
}

export function TodaySummary({ day, keep, pendingReviews }: Pick<ChartsProps, 'day' | 'keep'> & { pendingReviews: number | null }) {
  const rows = complete(day) ? day.data?.data.filter(keep) : undefined
  const figures = [
    { label: 'Tour hôm nay', amount: rows?.length, unit: 'Tour' },
    { label: 'Đang diễn ra hôm nay', amount: rows?.filter(STATES[0].matches).length, unit: 'Tour' },
    { label: 'Đã chốt hôm nay', amount: rows?.filter(STATES[1].matches).length, unit: 'Tour' },
    { label: 'Đăng ký chờ duyệt', amount: pendingReviews, unit: 'đoàn' },
  ]
  return <dl aria-label="Tóm tắt hôm nay" className={`${panelClass} grid grid-cols-2 divide-slate-200 sm:grid-cols-4 sm:divide-x`}>
    {figures.map(({ label, amount, unit }, index) => <div key={label}
      className={`min-w-0 px-3 py-4 sm:px-4 ${index >= 2 ? 'max-sm:border-t max-sm:border-slate-200' : ''} ${index % 2 === 1 ? 'max-sm:border-l max-sm:border-slate-200' : ''}`}>
      <dt className="text-xs font-medium text-slate-700">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5 text-xs text-slate-600">
        {amount == null ? <span>Chưa có số liệu</span>
          : <><strong className="text-2xl font-semibold tabular-nums text-slate-900">{amount}</strong>{unit}</>}
      </dd>
    </div>)}
  </dl>
}
