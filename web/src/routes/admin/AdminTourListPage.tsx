import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import type { TourState } from '../../api/contracts/admin'
import { FilterChips, PageHeader, Pagination, SearchField, panelClass } from '../../features/staff/StaffUi'
import { usePagination } from '../../features/staff/use-pagination'
import { buttonClass } from '../../features/staff/ui-classes'
import { AdminErrorPanel, AdminPage, DateRangeFilter, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminTours } from '../../features/administration/admin-hooks'
import { rangeFor, type DateRangeKey } from '../../features/administration/admin-format'
import { TOUR_STATE, TOUR_STATES } from '../../features/administration/admin-status'
import { AdminTourTable } from '../../features/administration/components/TourParts'

const DATE_OPTIONS: Array<{ value: DateRangeKey; label: string }> = [
  { value: 'all', label: 'Mọi ngày' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'week', label: 'Tuần này' },
  { value: 'custom', label: 'Khoảng ngày' },
]

/**
 * "Quản lý Tour": every Tour, any state, filterable by name, state and date.
 * Filters live in the URL so the dashboard can link straight into a view.
 */
export default function AdminTourListPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const state = (params.get('state') as TourState | null) ?? null
  const date = (params.get('date') as DateRangeKey | null) ?? 'all'
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' }
  const range = rangeFor(date, new Date(), custom)
  const filters = useMemo(() => ({ q: q.trim() || undefined, from: range.from, to: range.to }), [q, range.from, range.to])
  const tours = useAdminTours(filters)

  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    }, { replace: true })

  const rows = (tours.data ?? []).filter((tour) => !state || tour.state === state)
  const count = (value: TourState) => (tours.data ?? []).filter((tour) => tour.state === value).length
  const filtered = Boolean(q || state || date !== 'all')
  const paged = usePagination(rows, 10, `${q}|${state}|${date}|${custom.from}|${custom.to}`)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Quản lý Tour"
        title="Quản lý Tour"
        description="Tạo Tour, theo dõi đăng ký của từng Tour và chốt Tour khi đủ điều kiện. Tour đang diễn ra và đã kết thúc chỉ xem."
        action={<Link to="/admin/tours/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo Tour mới</Link>}
      />

      <section className={panelClass} aria-label="Danh sách Tour">
        <div className="space-y-3 border-b border-[#f1f5f9] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <SearchField value={q} onChange={(value) => update({ q: value || null })} label="Tìm theo tên Tour" placeholder="Tìm theo tên Tour..." className="w-full lg:max-w-sm" />
            <DateRangeFilter label="Lọc theo ngày" value={date} from={custom.from} to={custom.to} options={DATE_OPTIONS} onChange={(next) => update({ date: next.date === 'all' ? null : next.date, from: next.from || null, to: next.to || null })} />
          </div>
          <FilterChips<TourState | 'all'>
            label="Lọc theo trạng thái"
            value={state ?? 'all'}
            onChange={(value) => update({ state: value === 'all' ? null : value })}
            options={[{ value: 'all', label: 'Tất cả', count: tours.data?.length }, ...TOUR_STATES.map((value) => ({ value, label: TOUR_STATE[value].label, count: tours.data ? count(value) : undefined }))]}
          />
        </div>

        {tours.isError ? (
          <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách Tour." onRetry={() => void tours.refetch()} /></div>
        ) : tours.isLoading ? (
          <SkeletonRows rows={6} label="Đang tải danh sách Tour" />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState title="Không có Tour nào khớp bộ lọc" action={<button type="button" onClick={() => setParams({}, { replace: true })} className={buttonClass('secondary', 'sm')}>Xóa bộ lọc</button>} />
          ) : (
            <EmptyState title="Chưa có Tour nào" description="Tạo Tour, chọn tuyến đã chuẩn bị, rồi đại diện trường có thể đăng ký." action={<Link to="/admin/tours/new" className={buttonClass('primary', 'sm')}>Tạo Tour đầu tiên</Link>} />
          )
        ) : (
          <>
            <AdminTourTable tours={paged.rows} label="Danh sách Tour" />
            <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang danh sách Tour" />
          </>
        )}
      </section>
    </AdminPage>
  )
}
