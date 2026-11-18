import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { LayoutGrid, List, Search } from 'lucide-react'
import { useRepTours } from '../../features/representative/representative-hooks'
import { RepPage, RepPageHeader, ErrorState, PageSkeleton, EmptyState } from '../../features/representative/components/RepUi'
import { TourTile } from '../../features/representative/components/TourTile'
import { tourImages } from '../../features/representative/tour-image'
import { readRepError } from '../../features/representative/rep-format'
import { repButton } from '../../features/representative/rep-classes'
import { Pagination } from '../../components/ui/ConsolePrimitives'
import type { RepresentativeTour } from '../../features/representative/api/types'

export default function RepToursPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const page = Math.max(1, Number(params.get('page')) || 1)
  const list = params.get('view') === 'list'
  const tours = useRepTours({ page, search: params.get('search') ?? '', sort: 'scheduledStartAt' })
  return <RepPage>
    <RepPageHeader title="Buổi tham quan"
      description="Xem lịch, hạn đăng ký và tuyến tham quan. Mỗi buổi có một đăng ký của bạn." />
    <div className="rep-catalog-toolbar"><form className="rep-toolbar" role="search" onSubmit={e => { e.preventDefault(); const next = new URLSearchParams(params); next.set('search', search.trim()); next.set('page', '1'); setParams(next) }}>
      <label className="rep-search">
        <Search size={17} aria-hidden="true" className="rep-muted" />
        <input aria-label="Tìm buổi tham quan" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} placeholder="Tên buổi hoặc tuyến tham quan" />
        <button className={repButton('dark', 'sm')}>Tìm kiếm</button>
      </label>
    </form><div className="rep-view-switch" role="group" aria-label="Cách hiển thị buổi tham quan">{[{ value: 'grid', label: 'Thẻ', Icon: LayoutGrid }, { value: 'list', label: 'Danh sách', Icon: List }].map(({ value, label, Icon }) => <button type="button" key={value} aria-pressed={list === (value === 'list')} onClick={() => { const next = new URLSearchParams(params); next.set('view', value); setParams(next) }}><Icon size={16} aria-hidden="true" />{label}</button>)}</div></div>
    {tours.isPending ? <PageSkeleton /> : tours.error ? <ErrorState title="Không tải được Tour" message={readRepError(tours.error).message} onRetry={() => void tours.refetch()} /> :
      tours.data?.data.length ? <><p className="rep-count"><span className="num">{tours.data.pagination.totalItems}</span> buổi nhận đăng ký</p>
        <TourGrid tours={tours.data.data} list={list} />
        <Pagination page={page} pageCount={tours.data.pagination.totalPages} total={tours.data.pagination.totalItems} pageSize={tours.data.pagination.pageSize}
          label="Trang buổi tham quan" onPage={p => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next) }} /></>
        : params.get('search') ? <EmptyState variant="noMatch" onClear={() => { setSearch(''); setParams({}) }} />
          : <EmptyState variant="empty" title="Hiện chưa có buổi nhận đăng ký." />}
  </RepPage>
}

function TourGrid({ tours, list }: { tours: RepresentativeTour[]; list: boolean }) {
  const images = tourImages(tours)
  return <div className={`rep-tile-grid${list ? ' rep-tile-grid--list' : ''}`}>{tours.map(tour => <TourTile key={tour.id} tour={tour} image={images.get(tour.id)} />)}</div>
}
