import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CalendarDays, CheckCircle2, ChevronRight, Plus } from 'lucide-react'
import type { AdminTour, TourState } from '../../api/contracts/admin'
import { Pagination, SearchField } from '../../components/ui/ConsolePrimitives'
import { usePagination } from '../../components/ui/use-pagination'
import { buttonClass, inputClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminRegistrations, useAdminTours } from '../../features/administration/admin-hooks'
import { rangeFor, type DateRangeKey } from '../../features/administration/admin-format'
import { TOUR_STATE, TOUR_STATES } from '../../features/administration/admin-status'
import { TOUR_COLOR, cardClass } from '../../features/administration/admin-visual'
import { TourRow } from '../../features/administration/components/TourCards'
import { dayHeading, shortName, tourDayKey } from '../../features/administration/tour-day'

const DATE_OPTIONS: Array<{ value: DateRangeKey; label: string }> = [
  { value: 'all', label: 'Mọi ngày' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'custom', label: 'Khoảng ngày…' },
]
const HINT: Record<TourState, string> = { Scheduled: 'Nhận & duyệt đăng ký', Ready: 'Đã khóa · chờ Staff', Running: 'Staff điều hành', Completed: 'Chỉ xem', Cancelled: 'Chỉ xem' }
const ALL = {}
const PAGE = 12

/**
 * "Quản lý Tour", laid out as: state tiles (which also filter), the chosen
 * state's Tours grouped by day, and beside them what needs Admin now.
 * Search, date and state live in the URL so other pages can link into a view.
 */
export default function AdminTourListPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const stateParam = params.get('state') as TourState | null
  const state: TourState = stateParam && TOUR_STATES.includes(stateParam) ? stateParam : 'Scheduled'
  const date = (params.get('date') as DateRangeKey | null) ?? 'all'
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' }
  const range = rangeFor(date, new Date(), custom)
  const filters = useMemo(() => ({ q: q.trim() || undefined, from: range.from, to: range.to }), [q, range.from, range.to])
  const tours = useAdminTours(filters)
  const regs = useAdminRegistrations(ALL)

  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    }, { replace: true })

  const students = useMemo(() => {
    const map = new Map<string, number>()
    for (const reg of regs.data ?? []) if (reg.state === 'Approved') map.set(reg.tourId, (map.get(reg.tourId) ?? 0) + reg.studentCount)
    return map
  }, [regs.data])
  const ended = state === 'Completed' || state === 'Cancelled'
  const rows = (tours.data ?? []).filter((tour) => tour.state === state).sort((a, b) => (ended ? b.scheduledAt.localeCompare(a.scheduledAt) : a.scheduledAt.localeCompare(b.scheduledAt)))
  const count = (value: TourState) => (tours.data ?? []).filter((tour) => tour.state === value).length
  const filtered = Boolean(q || date !== 'all')
  const paged = usePagination(rows, PAGE, `${q}|${state}|${date}|${custom.from}|${custom.to}`)
  const days = groupByDay(paged.rows)

  return (
    <AdminPage>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-[#123a59]">Quản lý Tour</h1>
          <p className="mt-1 text-sm text-[#64748b]">Tạo Tour, duyệt đăng ký và chốt Tour khi đủ điều kiện. Tour đang diễn ra và đã kết thúc chỉ xem.</p>
        </div>
        <Link to="/admin/tours/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo Tour mới</Link>
      </header>

      <div role="group" aria-label="Lọc Tour theo trạng thái" className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {TOUR_STATES.map((value) => {
          const selected = value === state
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ state: value === 'Scheduled' ? null : value })}
              style={{ ['--c' as string]: TOUR_COLOR[value] }}
              className={`flex flex-col items-start gap-1 rounded-xl bg-white px-4 py-3 text-left transition-[box-shadow,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9] motion-reduce:transition-none ${selected ? 'bg-[color-mix(in_srgb,var(--c)_6%,#fff)] shadow-[inset_0_0_0_2px_var(--c)]' : 'shadow-[0_1px_2px_rgba(16,24,40,0.05),0_0_0_1px_rgba(16,24,40,0.06)] hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_0_0_1px_#a8cde6]'}`}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#334155]"><span aria-hidden="true" className="size-2 rounded-full bg-[var(--c)]" />{TOUR_STATE[value].label}</span>
              <span className="text-[26px] leading-none font-bold text-[#0f172a] tabular-nums">{tours.data ? count(value) : '–'}</span>
              <span className="text-[11.5px] text-[#94a3b8]">{HINT[value]}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section className={`${cardClass} flex-[999_1_560px]`} aria-label="Danh sách Tour">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f2f4] px-5 py-3">
            <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-[#0f172a]">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: TOUR_COLOR[state] }} />
              {TOUR_STATE[state].label}
              <span className="text-[13px] font-normal text-[#94a3b8] tabular-nums">{rows.length} Tour · {ended ? 'mới nhất trước' : 'sắp diễn ra trước'}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <SearchField value={q} onChange={(value) => update({ q: value || null })} label="Tìm theo tên Tour" placeholder="Tìm theo tên Tour..." className="w-full sm:w-60" />
              <DateSelect value={date} from={custom.from} to={custom.to} onChange={(next) => update({ date: next.date === 'all' ? null : next.date, from: next.from || null, to: next.to || null })} />
            </div>
          </div>

          {tours.isError ? (
            <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách Tour." onRetry={() => void tours.refetch()} /></div>
          ) : tours.isLoading ? (
            <SkeletonRows rows={6} label="Đang tải danh sách Tour" />
          ) : rows.length === 0 ? (
            filtered ? (
              <EmptyState title="Không có Tour nào khớp bộ lọc" action={<button type="button" onClick={() => setParams(state === 'Scheduled' ? {} : { state }, { replace: true })} className={buttonClass('secondary', 'sm')}>Xóa bộ lọc</button>} />
            ) : (tours.data ?? []).length === 0 ? (
              <EmptyState title="Chưa có Tour nào" description="Tạo Tour, chọn tuyến đã chuẩn bị, rồi đại diện trường có thể đăng ký." action={<Link to="/admin/tours/new" className={buttonClass('primary', 'sm')}>Tạo Tour đầu tiên</Link>} />
            ) : (
              <EmptyState title={`Không có Tour nào ${TOUR_STATE[state].label.toLowerCase()}.`} />
            )
          ) : (
            <>
              {days.map((day) => {
                const heading = dayHeading(day.tours[0].scheduledAt)
                return (
                  <div key={day.key}>
                    <h3 className={`border-b border-[#f1f2f4] bg-[#f8fafc] px-5 py-2 text-[11.5px] font-bold tracking-[0.06em] uppercase ${heading.today ? 'text-[#b45309]' : 'text-[#64748b]'}`}>{heading.text}</h3>
                    <ul aria-label={`Tour ${heading.text}`}>
                      {day.tours.map((tour) => <TourRow key={tour.id} tour={tour} students={students.get(tour.id) ?? 0} />)}
                    </ul>
                  </div>
                )
              })}
              {paged.pageCount > 1 && <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang danh sách Tour" />}
            </>
          )}
        </section>

        {tours.data && <AttentionPanel tours={tours.data} />}
      </div>
    </AdminPage>
  )
}

function groupByDay(tours: AdminTour[]) {
  const days: Array<{ key: string; tours: AdminTour[] }> = []
  for (const tour of tours) {
    const key = tourDayKey(tour.scheduledAt)
    const last = days[days.length - 1]
    if (last?.key === key) last.tours.push(tour)
    else days.push({ key, tours: [tour] })
  }
  return days
}

/** The date filter as one compact select; "Khoảng ngày…" opens two date inputs under it. */
function DateSelect({ value, from, to, onChange }: { value: DateRangeKey; from: string; to: string; onChange: (next: { date: DateRangeKey; from?: string; to?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-[#d9e1ea] bg-white pl-3 pr-1 text-[#64748b] focus-within:ring-2 focus-within:ring-[#5b9dc9]">
        <CalendarDays size={16} aria-hidden="true" />
        <span className="sr-only">Lọc theo ngày</span>
        <select value={value} onChange={(event) => onChange({ date: event.target.value as DateRangeKey })} className="h-full cursor-pointer bg-transparent pr-1 text-[13.5px] font-medium text-[#0f172a] outline-none">
          {DATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {value === 'custom' && (
        <>
          <label className="sr-only" htmlFor="tour-from">Từ ngày</label>
          <input id="tour-from" type="date" value={from} max={to || undefined} onChange={(event) => onChange({ date: 'custom', from: event.target.value, to })} className={`${inputClass} w-40`} />
          <span aria-hidden="true" className="text-[#94a3b8]">–</span>
          <label className="sr-only" htmlFor="tour-to">Đến ngày</label>
          <input id="tour-to" type="date" value={to} min={from || undefined} onChange={(event) => onChange({ date: 'custom', from, to: event.target.value })} className={`${inputClass} w-40`} />
        </>
      )}
    </div>
  )
}

type Task = { id: string; title: string; count: number; tone: string; bg: string; tours: Array<{ tour: AdminTour; note?: string; tab?: string }>; action?: { to: string; label: string } }

/**
 * "Cần xử lý": everything Admin can act on across the loaded Tours, so the
 * list itself stays quiet. Built from the server's own answers (counts,
 * readyBlockers, allowedActions); nothing is re-derived.
 */
function AttentionPanel({ tours }: { tours: AdminTour[] }) {
  const open = tours.filter((tour) => tour.state === 'Scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const finalizable = open.filter((tour) => tour.allowedActions.finalize.allowed)
  const reviewing = open.filter((tour) => tour.counts.submitted > 0)
  const mailing = tours.filter((tour) => (tour.state === 'Scheduled' || tour.state === 'Ready') && tour.invitationsPending > 0).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const blocked = open.map((tour) => ({ tour, others: tour.readyBlockers.filter((line) => !/chờ duyệt/i.test(line)) })).filter((item) => item.others.length > 0 && !item.tour.allowedActions.finalize.allowed)

  const tasks: Task[] = [
    { id: 'review', title: 'Đăng ký chờ duyệt', count: reviewing.reduce((sum, tour) => sum + tour.counts.submitted, 0), tone: '#b45309', bg: '#fffbeb', tours: reviewing.map((tour) => ({ tour, note: `${tour.counts.submitted} đoàn`, tab: 'registrations' })), action: { to: '/admin/registrations/pending', label: 'Duyệt' } },
    { id: 'mail', title: 'Đoàn chưa gửi thông tin', count: mailing.reduce((sum, tour) => sum + tour.invitationsPending, 0), tone: '#2563eb', bg: '#eff6ff', tours: mailing.map((tour) => ({ tour, note: `${tour.invitationsPending} đoàn`, tab: 'registrations' })) },
    { id: 'blocked', title: 'Chưa đủ điều kiện chốt', count: blocked.length, tone: '#dc2626', bg: '#fef2f2', tours: blocked.map((item) => ({ tour: item.tour, note: item.others.join(' · ') })) },
  ].filter((task) => task.count > 0)
  const total = finalizable.length + tasks.length

  return (
    <aside aria-label="Cần xử lý" className={`${cardClass} flex flex-[1_1_300px] flex-col gap-3 p-4 lg:sticky lg:top-4`}>
      <h2 className="text-[14.5px] font-semibold text-[#123a59]">Cần xử lý <span className="font-normal text-[#94a3b8]">· {total} việc</span></h2>

      {total === 0 && <p className="flex items-center gap-2 py-2 text-[13px] text-[#64748b]"><CheckCircle2 size={16} className="text-[#16a34a]" aria-hidden="true" />Không có việc nào đang chờ.</p>}

      {finalizable.length > 0 && (
        <div className="rounded-xl bg-[#ecfdf3] p-3">
          <p className="text-[12.5px] font-bold text-[#15803d]">Sẵn sàng chốt</p>
          <ul className="mt-1.5 space-y-1.5">
            {finalizable.map((tour) => (
              <li key={tour.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[13.5px] text-[#0f172a]" title={tour.name}>{shortName(tour.name)} <span className="text-[#64748b]">· {dayHeading(tour.scheduledAt).text.split(' · ').pop()}</span></span>
                <Link to={`/admin/tours/${tour.id}`} className="inline-flex min-h-8 shrink-0 items-center rounded-lg bg-[#15803d] px-3 text-[12.5px] font-semibold text-white hover:bg-[#166534] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5b9dc9]">Chốt Tour</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tasks.map((task) => <TaskBlock key={task.id} task={task} />)}
    </aside>
  )
}

function TaskBlock({ task }: { task: Task }) {
  const head: ReactNode = (
    <span className="flex items-center justify-between gap-2">
      <span className="text-[13.5px] font-semibold text-[#0f172a]">{task.title}</span>
      <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full px-1.5 text-[12px] font-bold tabular-nums" style={{ background: task.bg, color: task.tone }}>{task.count}</span>
    </span>
  )
  return (
    <div className="border-t border-[#f1f2f4] pt-3">
      {head}
      <ul className="mt-1.5 space-y-1">
        {task.tours.map(({ tour, note, tab }) => (
          <li key={tour.id} className="text-[12.5px] leading-5 text-[#64748b]">
            <Link to={`/admin/tours/${tour.id}${tab ? `?tab=${tab}` : ''}`} title={tour.name} className="font-medium text-[#2d719e] hover:underline">{shortName(tour.name)}</Link>
            {note && <span> · {note}</span>}
          </li>
        ))}
      </ul>
      {task.action && <Link to={task.action.to} className="mt-1.5 inline-flex min-h-8 items-center gap-0.5 text-[12.5px] font-semibold text-[#2d719e] hover:underline">{task.action.label}<ChevronRight size={14} aria-hidden="true" /></Link>}
    </div>
  )
}
