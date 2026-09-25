import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { RegistrationState } from '../../api/contracts/admin'
import { FilterChips, PageHeader, Pagination, SearchField, panelClass } from '../../features/staff/StaffUi'
import { usePagination } from '../../features/staff/use-pagination'
import { AdminErrorPanel, AdminPage, DateRangeFilter, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { useAdminRegistrations } from '../../features/administration/admin-hooks'
import { rangeFor, type DateRangeKey } from '../../features/administration/admin-format'
import { REGISTRATION_STATE, REGISTRATION_STATES } from '../../features/administration/admin-status'
import { AdminRegistrationTable } from '../../features/administration/components/RegistrationParts'
import { RegistrationReviewDrawer } from '../../features/administration/components/RegistrationReviewDrawer'
import { useReviewParam } from '../../features/administration/use-review-param'

const DATE_OPTIONS: Array<{ value: DateRangeKey; label: string }> = [
  { value: 'all', label: 'Mọi ngày' },
  { value: 'today', label: 'Tour hôm nay' },
  { value: 'week', label: 'Tour tuần này' },
  { value: 'custom', label: 'Khoảng ngày' },
]

/**
 * Group registrations across Tours. `pending` is the review queue ("Chờ
 * duyệt"), which is the default view of registrations; the other mode starts
 * on every state. Oldest submission first.
 */
export default function AdminRegistrationsPage({ mode }: { mode: 'pending' | 'all' }) {
  const [params, setParams] = useSearchParams()
  const { reviewId, open, close } = useReviewParam()
  const q = params.get('q') ?? ''
  const stateParam = params.get('state') as RegistrationState | 'all' | null
  const state: RegistrationState | 'all' = mode === 'pending' ? 'Submitted' : stateParam ?? 'all'
  const date = (params.get('date') as DateRangeKey | null) ?? 'all'
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' }
  const range = rangeFor(date, new Date(), custom)
  const base = useMemo(() => ({ q: q.trim() || undefined, from: range.from, to: range.to }), [q, range.from, range.to])
  const query = useAdminRegistrations(base)

  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    }, { replace: true })

  const all = query.data ?? []
  const rows = state === 'all' ? all : all.filter((reg) => reg.state === state)
  const filtered = Boolean(q || date !== 'all')
  const paged = usePagination(rows, 10, `${mode}|${q}|${state}|${date}|${custom.from}|${custom.to}`)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Đăng ký đoàn"
        title={mode === 'pending' ? 'Đăng ký chờ duyệt' : 'Tất cả đăng ký'}
        description={mode === 'pending' ? 'Đoàn đã gửi danh sách và đang chờ quyết định. Duyệt hoặc từ chối (kèm lý do) khi Tour còn đang chuẩn bị.' : 'Mọi đăng ký của các Tour. Trạng thái đăng ký và thông tin tham gia là hai cột riêng.'}
      />

      <section className={panelClass} aria-label="Danh sách đăng ký">
        <div className="space-y-3 border-b border-[#efefe9] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <SearchField value={q} onChange={(value) => update({ q: value || null })} label="Tìm theo trường, đại diện hoặc Tour" placeholder="Tìm theo trường, đại diện, Tour..." className="w-full lg:max-w-sm" />
            <DateRangeFilter label="Lọc theo ngày Tour" value={date} from={custom.from} to={custom.to} options={DATE_OPTIONS} onChange={(next) => update({ date: next.date === 'all' ? null : next.date, from: next.from || null, to: next.to || null })} />
          </div>
          {mode === 'all' && (
            <FilterChips<RegistrationState | 'all'>
              label="Lọc theo trạng thái đăng ký"
              value={state}
              onChange={(value) => update({ state: value === 'all' ? null : value })}
              options={[{ value: 'all', label: 'Tất cả', count: query.data?.length }, ...REGISTRATION_STATES.map((value) => ({ value, label: REGISTRATION_STATE[value].label, count: query.data ? all.filter((reg) => reg.state === value).length : undefined }))]}
            />
          )}
        </div>

        {query.isError ? (
          <div className="p-5"><AdminErrorPanel title="Không thể tải danh sách đăng ký." onRetry={() => void query.refetch()} /></div>
        ) : query.isLoading ? (
          <SkeletonRows rows={5} label="Đang tải đăng ký" />
        ) : rows.length === 0 ? (
          mode === 'pending' && !filtered ? (
            <EmptyState title="Tất cả đăng ký đã được xử lý." description="Không còn đoàn nào chờ duyệt." />
          ) : (
            <EmptyState title="Không có đăng ký nào khớp bộ lọc." />
          )
        ) : (
          <>
            <AdminRegistrationTable registrations={paged.rows} onReview={open} showTour label={mode === 'pending' ? 'Đăng ký chờ duyệt' : 'Tất cả đăng ký'} />
            <Pagination page={paged.page} pageCount={paged.pageCount} total={paged.total} pageSize={paged.pageSize} onPage={paged.setPage} label="Phân trang đăng ký" />
          </>
        )}
      </section>

      <RegistrationReviewDrawer registrationId={reviewId} onClose={close} />
    </AdminPage>
  )
}
