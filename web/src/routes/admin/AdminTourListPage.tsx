import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import type { TourState } from '../../api/contracts/admin'
import { PageHeader, Pagination, SearchField } from '../../components/ui/ConsolePrimitives'
import { usePagination } from '../../components/ui/use-pagination'
import { buttonClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, DateRangeFilter, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminRegistrations, useAdminTours } from '../../features/administration/admin-hooks'
import { rangeFor, type DateRangeKey } from '../../features/administration/admin-format'
import { TOUR_STATE, TOUR_STATES } from '../../features/administration/admin-status'
import { TOUR_COLOR, cardClass } from '../../features/administration/admin-visual'
import { StageHint, StageTabs } from '../../components/ui/StageTabs'
import { TourCard } from '../../features/administration/components/TourCards'

const DATE_OPTIONS: Array<{ value: DateRangeKey; label: string }> = [
  { value: 'all', label: 'Mọi ngày' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'custom', label: 'Khoảng ngày' },
]
const HINT: Record<TourState, string> = { Scheduled: 'Nhận & duyệt đăng ký', Ready: 'Đã khóa · chờ Staff', Running: 'Staff điều hành', Completed: 'Chỉ xem', Cancelled: 'Chỉ xem' }
const ALL = {}
const PAGE = 12

/**
 * "Quản lý Tour": one state at a time. The tabs read as the Tour's life
 * (Đang chuẩn bị › Sẵn sàng › Đang diễn ra › Hoàn thành, then Đã hủy) and
 * the list below shows only the chosen one, paged, so it never runs long.
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

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Quản lý Tour"
        title="Quản lý Tour"
        description="Tạo Tour, theo dõi đăng ký của từng Tour và chốt Tour khi đủ điều kiện. Tour đang diễn ra và đã kết thúc chỉ xem."
        action={<Link to="/admin/tours/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo Tour mới</Link>}
      />

      <section className={cardClass} aria-label="Danh sách Tour">
        <div className="flex flex-col gap-3 border-b border-[#f1f2f4] px-3.5 py-2.5 xl:flex-row xl:items-center xl:justify-between">
          <StageTabs<TourState>
            label="Lọc Tour theo trạng thái"
            value={state}
            onChange={(value) => update({ state: value })}
            stages={TOUR_STATES.map((value) => ({ key: value, label: TOUR_STATE[value].label, color: TOUR_COLOR[value], count: tours.data ? count(value) : undefined, separated: value === 'Cancelled' }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <SearchField value={q} onChange={(value) => update({ q: value || null })} label="Tìm theo tên Tour" placeholder="Tìm theo tên Tour..." className="w-full sm:w-64" />
            <DateRangeFilter label="Lọc theo ngày" value={date} from={custom.from} to={custom.to} options={DATE_OPTIONS} onChange={(next) => update({ date: next.date === 'all' ? null : next.date, from: next.from || null, to: next.to || null })} />
          </div>
        </div>

        {tours.isError ? (
          <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách Tour." onRetry={() => void tours.refetch()} /></div>
        ) : tours.isLoading ? (
          <SkeletonRows rows={6} label="Đang tải danh sách Tour" />
        ) : (
          <>
            <StageHint color={TOUR_COLOR[state]} title={TOUR_STATE[state].label} count={`${rows.length} Tour`} note={`${HINT[state]} · ${ended ? 'mới nhất trước' : 'sắp diễn ra trước'}`} />
            {rows.length === 0 ? (
              filtered ? (
                <EmptyState title="Không có Tour nào khớp bộ lọc" action={<button type="button" onClick={() => setParams(state === 'Scheduled' ? {} : { state }, { replace: true })} className={buttonClass('secondary', 'sm')}>Xóa bộ lọc</button>} />
              ) : (tours.data ?? []).length === 0 ? (
                <EmptyState title="Chưa có Tour nào" description="Tạo Tour, chọn tuyến đã chuẩn bị, rồi đại diện trường có thể đăng ký." action={<Link to="/admin/tours/new" className={buttonClass('primary', 'sm')}>Tạo Tour đầu tiên</Link>} />
              ) : (
                <EmptyState title={`Không có Tour nào ${TOUR_STATE[state].label.toLowerCase()}.`} />
              )
            ) : (
              <>
                <ul className="grid gap-2 px-5 pt-2 pb-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))]" aria-label={`Tour ${TOUR_STATE[state].label.toLowerCase()}`}>
                  {paged.rows.map((tour) => <TourCard key={tour.id} tour={tour} students={students.get(tour.id) ?? 0} />)}
                </ul>
                {paged.pageCount > 1 && <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang danh sách Tour" />}
              </>
            )}
          </>
        )}
      </section>
    </AdminPage>
  )
}
