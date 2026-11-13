import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
import { useRepTours } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, ErrorState, PageSkeleton, EmptyState } from '../../features/representative/components/RepUi'
import { TourCard } from '../../features/representative/components/TourCard'
import { readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'
import { Pagination } from '../../components/ui/ConsolePrimitives'

export default function RepToursPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const tours = useRepTours({ page, search: params.get('search') ?? '', sort: 'scheduledStartAt' })
  return <RepPage>
    <RepPageHeader title="Buổi tham quan"
      description="Xem lịch, hạn đăng ký và tuyến tham quan. Mỗi buổi có một đăng ký của bạn." />
    <form className="rep-toolbar" role="search" onSubmit={e => { e.preventDefault(); setParams({ search: search.trim(), page: '1' }) }}>
      <label className="rep-search">
        <Search size={17} aria-hidden="true" className="rep-muted" />
        <input aria-label="Tìm buổi tham quan" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} placeholder="Tên buổi hoặc tuyến tham quan" />
        <button className={repButton('dark', 'sm')}>Tìm kiếm</button>
      </label>
    </form>
    {tours.isPending ? <PageSkeleton /> : tours.error ? <ErrorState title="Không tải được Tour" message={readRepError(tours.error).message} onRetry={() => void tours.refetch()} /> :
      tours.data?.data.length ? <><p className="rep-count"><span className="num">{tours.data.pagination.totalItems}</span> buổi nhận đăng ký</p>
        <div className="rep-card rep-card--flush"><div className="rep-tour-list">{tours.data.data.map(tour => <TourCard key={tour.id} tour={tour} />)}</div></div>
        <Pagination page={page} pageCount={tours.data.pagination.totalPages} total={tours.data.pagination.totalItems} pageSize={tours.data.pagination.pageSize}
          label="Trang buổi tham quan" onPage={p => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next) }} /></>
        : params.get('search') ? <EmptyState variant="noMatch" onClear={() => { setSearch(''); setParams({}) }} />
          : <EmptyState variant="empty" title="Hiện chưa có buổi nhận đăng ký." />}
  </RepPage>
}
