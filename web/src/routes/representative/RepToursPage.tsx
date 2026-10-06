import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useRepTours } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, EmptyState, ErrorState, PageSkeleton } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { readRepError } from '../../features/representative/rep-format'
import { Pagination } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../components/ui/ui-classes'

export default function RepToursPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const tours = useRepTours({ page, search: params.get('search') ?? '', sort: 'scheduledStartAt' })
  return <RepPage>
    <RepPageHeader title="Các buổi tham quan khả dụng" description="Các buổi còn nhận đăng ký. Bạn có thể đăng ký nhiều đoàn trong cùng một Tour." />
    <form className="mb-6 flex gap-3" onSubmit={e => { e.preventDefault(); setParams({ search: search.trim(), page: '1' }) }}>
      <input aria-label="Tìm buổi tham quan" className={inputClass} value={search} maxLength={200} onChange={e => setSearch(e.target.value)} placeholder="Tên buổi hoặc tuyến tham quan" />
      <button className={buttonClass('secondary')}>Tìm kiếm</button>
    </form>
    {tours.isPending ? <PageSkeleton /> : tours.error ? <ErrorState title="Không tải được Tour" message={readRepError(tours.error).message} onRetry={() => void tours.refetch()} /> :
      tours.data?.data.length ? <><p className="mb-4 text-sm text-slate-500">{tours.data.pagination.totalItems} buổi nhận đăng ký</p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{tours.data.data.map((tour, i) => <TourCard key={tour.id} tour={tour} visualIndex={i} />)}</div>
        <Pagination page={page} pageCount={tours.data.pagination.totalPages} total={tours.data.pagination.totalItems} pageSize={tours.data.pagination.pageSize}
          label="Trang buổi tham quan" onPage={p => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next) }} /></>
        : <EmptyState title="Không có buổi phù hợp" description="Thử từ khóa khác hoặc quay lại khi có lịch mới." />}
  </RepPage>
}
