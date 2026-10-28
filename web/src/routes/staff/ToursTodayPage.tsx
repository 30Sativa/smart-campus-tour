import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { TourOperation, TourState } from '../../api/contracts/staff'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { routeProgress } from '../../features/staff/attention'
import { formatCountdown, formatTime } from '../../features/staff/formatters'
import { useNow } from '../../features/staff/use-now'
import { TODAY_STAGES, byStart, matchesSearch, studentsToday, type TodayFilter } from '../../features/staff/today-board'
import { TodayLanes } from '../../features/staff/components/TodayLanes'
import { TourAgenda } from '../../features/staff/components/TourAgenda'
import { TourInspector } from '../../features/staff/components/TourInspector'
import { KpiRow, KpiTile } from '../../components/ui/Charts'
import { StateFilter } from '../../features/staff/components/StateFilter'

const STATES = TODAY_STAGES.map((stage) => stage.key)

/**
 * Today's sessions as a day board: three lanes on one time axis, the sessions
 * in time order with a "now" line, and the chosen session open beside them
 * with its next step, groups, route and log. `?view=` filters by state and
 * `?tour=` keeps the open session in the address, so a link reopens it.
 */
export default function ToursTodayPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const tours = useTours()
  const now = useNow(30_000)

  const asked = params.get('view')
  const view: TodayFilter = asked === 'ended' ? 'Completed' : asked && STATES.includes(asked as TourState) ? (asked as TourState) : 'all'
  const all = useMemo(() => [...(tours.data ?? [])].sort(byStart), [tours.data])
  const rows = useMemo(() => all.filter((tour) => (view === 'all' || tour.state === view) && matchesSearch(tour, search)), [all, view, search])

  const askedTour = params.get('tour')
  const chosen = all.find((tour) => tour.id === askedTour)
  const selected = chosen
  const drawerOpen = Boolean(chosen)

  const update = useCallback(
    (change: (next: URLSearchParams) => void) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          change(next)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const select = (id: string) => update((next) => next.set('tour', id))
  const close = useCallback(() => update((next) => next.delete('tour')), [update])
  const setView = (value: TodayFilter) => update((next) => (value === 'all' ? next.delete('view') : next.set('view', value)))
  const panelRef = useMobileNav(drawerOpen, close)

  return (
    <StaffPage>
      <PageHeader
        eyebrow="Trong ngày"
        title="Buổi hôm nay"
        description="Bấm một buổi để mở chi tiết ngay giữa màn hình: đoàn, lộ trình, nhật ký và bước tiếp theo."
        action={tours.data ? <Glance tours={all} now={now} onSelect={select} /> : undefined}
      />

      {tours.data && <TodayFigures tours={all} now={now} />}

      {tours.isPending ? (
        <LoadingPanel />
      ) : tours.isError ? (
        <ErrorPanel error={tours.error} onRetry={tours.refetch} />
      ) : (
        <div>
          <section className={panelClass} aria-label="Danh sách buổi hôm nay">
            {all.length > 0 && <TodayLanes tours={all} now={now} selectedId={selected?.id} onSelect={select} />}
            <div className="flex flex-col gap-2.5 border-b border-[#f1f4f8] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <StateFilter<TodayFilter>
                label="Lọc buổi theo trạng thái"
                value={view}
                onChange={setView}
                options={[
                  { value: 'all', label: 'Tất cả trạng thái', count: all.length },
                  ...TODAY_STAGES.map((stage) => ({ value: stage.key, label: stage.label, color: stage.color, count: all.filter((tour) => tour.state === stage.key).length })),
                ]}
              />
              <SearchField value={search} onChange={setSearch} placeholder="Tìm theo mã, tên, trường…" label="Tìm buổi hôm nay" className="w-full sm:w-64" />
            </div>
            {rows.length === 0 ? (
              <div className="p-4">
                <EmptyPanel>
                  {search.trim()
                    ? 'Không tìm thấy buổi nào phù hợp từ khóa.'
                    : view === 'all'
                    ? 'Hôm nay chưa có buổi tham quan nào.'
                    : `Không có buổi nào ở trạng thái “${TODAY_STAGES.find((stage) => stage.key === view)?.label}”.`}
                </EmptyPanel>
              </div>
            ) : (
              <TourAgenda tours={rows} now={now} selectedId={selected?.id} onSelect={select} showNow={view === 'all' && !search.trim()} label="Buổi hôm nay" />
            )}
          </section>

          <TourInspector tour={selected} now={now} open={drawerOpen} onClose={close} panelRef={panelRef} />
        </div>
      )}
    </StaffPage>
  )
}

/** The day in four figures: how many, how many need help, what is next, what cannot run yet. */
function TodayFigures({ tours, now }: { tours: TourOperation[]; now: number }) {
  const assist = tours.filter((tour) => tour.state === 'Running' && tour.operationalStatus === 'NeedsAssistance')
  const next = tours.find((tour) => (tour.state === 'Ready' || tour.state === 'Scheduled') && new Date(tour.scheduledAt).getTime() >= now)
  const unready = tours.filter((tour) => tour.state === 'Scheduled')
  return (
    <KpiRow label="Trong ngày">
      <KpiTile label="Tổng buổi" value={tours.length} note={`${studentsToday(tours)} học sinh đã duyệt`} />
      <KpiTile label="Cần hỗ trợ" value={assist.length} note={assist.map((tour) => tour.code).join(', ') || 'không có'} tone={assist.length ? 'danger' : 'plain'} />
      <KpiTile label="Sắp tới" value={next ? formatTime(next.scheduledAt) : '—'} note={next ? `${next.code} · ${formatCountdown(next.scheduledAt, now)}` : 'hết buổi hôm nay'} />
      <KpiTile label="Chưa chốt" value={unready.length} note={unready.map((tour) => tour.code).join(', ') || 'tất cả đã chốt'} tone={unready.length ? 'warn' : 'plain'} />
    </KpiRow>
  )
}

/** Running now, next up, and the day in numbers; each opens its session. */
function Glance({ tours, now, onSelect }: { tours: TourOperation[]; now: number; onSelect: (id: string) => void }) {
  const running = tours.find((tour) => tour.state === 'Running')
  const next = tours.find((tour) => (tour.state === 'Ready' || tour.state === 'Scheduled') && new Date(tour.scheduledAt).getTime() >= now)
  const card = 'min-w-[132px] rounded-xl bg-white px-3.5 py-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05),0_0_0_1px_rgba(16,24,40,0.05)]'
  const caption = 'block text-[11.5px] font-medium text-[#94a3b8]'
  const progress = running ? routeProgress(running) : null
  return (
    <div className="flex flex-wrap gap-2.5" aria-label="Tóm tắt trong ngày">
      {running && (
        <button type="button" onClick={() => onSelect(running.id)} className={`${card} transition-shadow hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_0_0_1px_#cbd5e1]`}>
          <span className={caption}>Đang chạy</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[15px] font-bold text-[#0f172a]">
            <span aria-hidden="true" className="size-2 rounded-full bg-[#2563eb]" />
            {running.code}
            {progress && <span className="text-xs font-medium text-[#64748b]">· POI {Math.min(progress.done + 1, progress.total)}/{progress.total}</span>}
          </span>
        </button>
      )}
      {next && (
        <button type="button" onClick={() => onSelect(next.id)} className={`${card} transition-shadow hover:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_0_0_1px_#cbd5e1]`}>
          <span className={caption}>Kế tiếp</span>
          <span className="mt-0.5 flex items-baseline gap-1.5 text-[15px] font-bold text-[#0f172a]">
            {next.code} · {formatTime(next.scheduledAt)}
            <span className="text-xs font-medium text-[#64748b]">{formatCountdown(next.scheduledAt, now)}</span>
          </span>
        </button>
      )}
      <div className={card}>
        <span className={caption}>Trong ngày</span>
        <span className="mt-0.5 flex items-baseline gap-1.5 text-[15px] font-bold text-[#0f172a]">
          {tours.length} buổi
          <span className="text-xs font-medium text-[#64748b]">· {studentsToday(tours)} học sinh đã duyệt</span>
        </span>
      </div>
    </div>
  )
}
