import { useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { PageHeader, Pagination, SearchField, panelClass } from '../../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows } from '../../../features/administration/AdminUi'
import { formatSlot } from '../../../features/administration/admin-format'
import { useDebouncedValue } from '../../../features/administration/use-debounced-value'
import { useTours } from '../../../features/administration/tours/hooks'
import { TOUR_STATE_LABEL, tourError } from '../../../features/administration/tours/tour-messages'
import type { TourState } from '../../../features/administration/tours/types'

const PAGE_SIZE = 20

export default function StaffManageTourListPage() {
  const [search, setSearch] = useState('')
  const [state, setState] = useState<TourState | ''>('SCHEDULED')
  const [page, setPage] = useState(1)
  const term = useDebouncedValue(search, 300)
  const tours = useTours({ search: term, state: state || undefined, page, size: PAGE_SIZE })
  return <AdminPage>
    <PageHeader eyebrow="Chuẩn bị Tour" title="Quản lý Tour" description="Tạo Tour từ tuyến khả dụng để đại diện trường đăng ký đoàn. Tour đang diễn ra và đã kết thúc chỉ xem."
      action={<Link to="/staff/manage/tours/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo Tour mới</Link>} />
    <section className={panelClass} aria-label="Danh sách Tour">
      <div className="flex flex-wrap gap-3 border-b border-[#e2e8f0] p-4">
        <SearchField value={search} onChange={v => { setSearch(v); setPage(1) }} label="Tìm Tour" placeholder="Tên Tour" />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">Trạng thái<select aria-label="Trạng thái Tour" className={inputClass} value={state} onChange={e => { setState(e.target.value as TourState | ''); setPage(1) }}>
          <option value="">Tất cả</option>
          {(Object.keys(TOUR_STATE_LABEL) as TourState[]).map(s => <option key={s} value={s}>{TOUR_STATE_LABEL[s]}</option>)}
        </select></label>
      </div>
      {tours.isError ? <AdminErrorPanel title={tourError(tours.error)} onRetry={() => void tours.refetch()} /> : tours.isPending ? <SkeletonRows rows={4} label="Đang tải danh sách Tour" /> : tours.data.data.length === 0 ?
        <EmptyState title="Chưa có Tour phù hợp" description="Tạo Tour mới từ một tuyến khả dụng hoặc đổi bộ lọc." /> :
        <ul className="divide-y divide-[#e2e8f0]">{tours.data.data.map(tour => <li key={tour.id}>
          <Link to={`/staff/manage/tours/${tour.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-[#2d719e]">
            <div><p className="text-[15px] font-semibold text-[#173b59]">{tour.name}</p><p className="mt-1 text-sm text-[#64748b]">{formatSlot(tour.scheduledStartAt)} · {tour.routeName} · {tour.registrationCount} đoàn đăng ký</p></div>
            <span className="rounded-full border border-[#d9e9f5] px-3 py-1 text-xs">{TOUR_STATE_LABEL[tour.state]}</span>
          </Link>
        </li>)}</ul>}
      {tours.data && <Pagination page={page} pageCount={Math.max(1, tours.data.pagination.totalPages)} total={tours.data.pagination.totalItems} pageSize={PAGE_SIZE} onPage={setPage} label="Tour" />}
    </section>
  </AdminPage>
}
