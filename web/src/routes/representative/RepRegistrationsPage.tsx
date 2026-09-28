import { useMemo } from 'react'
import { ClipboardList } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { FilterChips } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { EmptyState, ErrorState, RepPage, RepPageHeader, Skeleton } from '../../features/representative/components/RepUi'
import { RegistrationCard } from '../../features/representative/components/RegistrationCard'
import { useRepRegistrations } from '../../features/representative/representative-hooks'
import { REGISTRATION_FILTERS, readRepError } from '../../features/representative/rep-format'

/** My Registrations (flow review §4.1): one card per Tour, filtered by state. */
export default function RepRegistrationsPage() {
  const list = useRepRegistrations()
  const [params, setParams] = useSearchParams()
  const filter = REGISTRATION_FILTERS.find((f) => f.slug === params.get('trang-thai')) ?? REGISTRATION_FILTERS[0]
  const all = useMemo(() => list.data ?? [], [list.data])
  const rows = filter.state ? all.filter((r) => r.state === filter.state) : all

  return (
    <RepPage>
      <RepPageHeader
        title="Đăng ký của tôi"
        description="Mỗi buổi tham quan có một đăng ký của bạn. Mở đăng ký để xem trạng thái duyệt, danh sách học sinh và thông tin tham gia."
        action={<Link to="/dai-dien/buoi" className={buttonClass('secondary', 'lg')}>Xem buổi tham quan</Link>}
      />

      <div className="mb-5">
        <FilterChips<string>
          label="Lọc theo trạng thái đăng ký"
          value={filter.slug}
          onChange={(slug) => setParams(slug === 'tat-ca' ? {} : { 'trang-thai': slug }, { replace: true })}
          options={REGISTRATION_FILTERS.map((f) => ({ value: f.slug, label: f.label, count: list.data ? (f.state ? all.filter((r) => r.state === f.state).length : all.length) : undefined }))}
        />
      </div>

      {list.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tải đăng ký">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : list.isError ? (
        <ErrorState title="Không tải được đăng ký" message={readRepError(list.error).message} onRetry={() => void list.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Bạn chưa có đăng ký nào"
          description="Chọn một buổi đang nhận đăng ký, điền thông tin đoàn và tải danh sách học sinh."
          action={<Link to="/dai-dien/buoi?loc=dang-nhan" className={buttonClass('primary')}>Xem buổi đang nhận đăng ký</Link>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={`Không có đăng ký nào ở trạng thái "${filter.label}"`}
          action={<button type="button" onClick={() => setParams({}, { replace: true })} className={buttonClass('secondary')}>Xem tất cả đăng ký</button>}
        />
      ) : (
        <div className="space-y-3">{rows.map((r) => <RegistrationCard key={r.id} registration={r} />)}</div>
      )}
    </RepPage>
  )
}
