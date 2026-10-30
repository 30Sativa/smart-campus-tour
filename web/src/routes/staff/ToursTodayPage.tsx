import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { buttonClass } from '../../components/ui/ui-classes'
import type { TourOperation, TourState } from '../../api/contracts/staff'
import { useTours } from '../../features/staff/staff-hooks'
import { EmptyPanel, ErrorPanel, StaffPage } from '../../features/staff/StaffUi'
import { LoadingPanel, PageHeader, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { useMobileNav } from '../../components/ui/use-mobile-nav'
import { formatCountdown, formatTime } from '../../features/staff/formatters'
import { useMediaQuery } from '../../features/staff/use-media-query'
import { useNow } from '../../features/staff/use-now'
import { TODAY_STAGES, byStart, matchesSearch, studentsToday, type TodayFilter } from '../../features/staff/today-board'
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
  const docked = useMediaQuery('(min-width: 1536px)')

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
        description="Chọn một buổi để xem đoàn, lộ trình và thao tác tiếp theo."
        action={<Link to="/staff/manage/tours/new" className={buttonClass('primary')}>Tạo Tour</Link>}
      />

      {tours.data && <TodayFigures tours={all} now={now} />}

      {tours.isPending ? (
        <LoadingPanel />
      ) : tours.isError ? (
        <ErrorPanel error={tours.error} onRetry={tours.refetch} />
      ) : (
        <div className={docked && drawerOpen ? 'grid items-start gap-5 grid-cols-[minmax(0,1fr)_420px]' : ''}>
          <section className={panelClass} aria-label="Danh sách buổi hôm nay">
            <div className="flex flex-col gap-2 border-b border-[#eef1f4] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

          <TourInspector tour={selected} now={now} open={drawerOpen} onClose={close} panelRef={panelRef} docked={docked} />
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
