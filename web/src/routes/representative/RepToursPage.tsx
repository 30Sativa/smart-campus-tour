import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { RepresentativeTour } from '../../api/contracts/representative'
import { FilterChips } from '../../features/staff/StaffUi'
import { buttonClass } from '../../features/staff/ui-classes'
import { EmptyState, ErrorState, RepPage, RepPageHeader, Skeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { useRepTours } from '../../features/representative/representative-hooks'
import { readRepError } from '../../features/representative/rep-format'

type Filter = 'tat-ca' | 'dang-nhan' | 'sap-dien-ra'

const FILTERS: Array<{ value: Filter; label: string; test: (t: RepresentativeTour) => boolean }> = [
  { value: 'tat-ca', label: 'Tất cả', test: () => true },
  // "Available": a Tour this account can register for right now.
  { value: 'dang-nhan', label: 'Còn nhận đăng ký', test: (t) => t.register.allowed },
  // "Upcoming": not finished yet, whatever its registration status.
  { value: 'sap-dien-ra', label: 'Sắp diễn ra', test: (t) => t.state === 'Scheduled' || t.state === 'Ready' || t.state === 'Running' },
]

/** Available Tours (flow review §4.1): Scheduled Tours take a registration; others open read-only. */
export default function RepToursPage() {
  const tours = useRepTours()
  const [params, setParams] = useSearchParams()
  const filter = (FILTERS.some((f) => f.value === params.get('loc')) ? params.get('loc') : 'tat-ca') as Filter
  const all = useMemo(() => tours.data ?? [], [tours.data])
  const rows = all.filter(FILTERS.find((f) => f.value === filter)!.test)

  return (
    <RepPage>
      <RepPageHeader
        title="Buổi tham quan"
        description="Chọn một buổi đang nhận đăng ký để gửi thông tin đoàn và danh sách học sinh. Buổi đã chốt hoặc đã diễn ra chỉ để xem."
      />

      <div className="mb-5">
        <FilterChips<Filter>
          label="Lọc buổi tham quan"
          value={filter}
          onChange={(value) => setParams(value === 'tat-ca' ? {} : { loc: value }, { replace: true })}
          options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: tours.data ? all.filter(f.test).length : undefined }))}
        />
      </div>

      {tours.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Đang tải buổi tham quan">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
        </div>
      ) : tours.isError ? (
        <ErrorState title="Không tải được danh sách buổi" message={readRepError(tours.error).message} onRetry={() => void tours.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={filter === 'dang-nhan' ? 'Chưa có buổi nào đang nhận đăng ký' : 'Không có buổi nào'}
          description="Admin mở buổi mới trên trang này. Bạn vẫn xem được các đăng ký đã gửi trong mục Đăng ký của tôi."
          action={filter !== 'tat-ca' ? <button type="button" onClick={() => setParams({}, { replace: true })} className={buttonClass('secondary')}>Xem tất cả buổi</button> : undefined}
        />
      ) : (
        <div className="space-y-3">{rows.map((t) => <TourCard key={t.id} tour={t} />)}</div>
      )}
    </RepPage>
  )
}
