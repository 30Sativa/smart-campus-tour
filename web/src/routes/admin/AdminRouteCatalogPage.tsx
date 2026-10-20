import { useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { PageHeader, Pagination, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, inputClass } from '../../components/ui/ui-classes'
import { AdminErrorPanel, AdminPage, EmptyState, SkeletonRows } from '../../features/administration/AdminUi'
import { useDebouncedValue } from '../../features/administration/use-debounced-value'
import { useRoutes } from '../../features/administration/routes/hooks'
import { routeError } from '../../features/administration/routes/route-messages'

export default function AdminRouteCatalogPage() {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState('all')
  const [page, setPage] = useState(1)
  const term = useDebouncedValue(search, 300)
  const routes = useRoutes({ search: term, page, size: 20, isActive: active === 'all' ? undefined : active === 'active' })
  return <AdminPage>
    <PageHeader eyebrow="Tuyến" title="Danh mục tuyến" description="Sắp xếp hành trình từ các POI đã có. Khả dụng không đồng nghĩa đã kiểm chứng robot thực tế."
      action={<Link to="/admin/routes/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo tuyến</Link>} />
    <section className={panelClass} aria-label="Danh sách tuyến">
      <div className="flex flex-wrap gap-3 border-b border-[#e2e8f0] p-4">
        <SearchField value={search} onChange={v => { setSearch(v); setPage(1) }} label="Tìm tuyến" placeholder="Tên hoặc mô tả" />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">Trạng thái<select aria-label="Trạng thái tuyến" className={inputClass} value={active} onChange={e => { setActive(e.target.value); setPage(1) }}>
          <option value="all">Tất cả</option><option value="active">Khả dụng</option><option value="inactive">Không khả dụng</option>
        </select></label>
      </div>
      {routes.isError ? <AdminErrorPanel title={routeError(routes.error)} onRetry={() => void routes.refetch()} /> : routes.isPending ? <SkeletonRows rows={4} /> : routes.data?.data.length === 0 ?
        <EmptyState title="Chưa có tuyến phù hợp" description="Tạo tuyến từ POI hiện có hoặc điều chỉnh bộ lọc." /> :
        <ul className="divide-y divide-[#e2e8f0]">{routes.data?.data.map(route => <li key={route.id}>
          <Link to={`/admin/routes/${route.id}`} className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-[#2d719e]">
            <div><p className="text-[15px] font-semibold text-[#173b59]">{route.name}</p><p className="mt-1 text-sm text-[#64748b]">{route.mapKey} / {route.mapFrame} · {route.stopCount} điểm dừng</p></div>
            <span className="rounded-full border border-[#d9e9f5] px-3 py-1 text-xs">{route.isActive ? 'Khả dụng' : 'Không khả dụng'}</span>
          </Link>
        </li>)}</ul>}
      {routes.data && <Pagination page={page} pageCount={Math.max(1, routes.data.pagination.totalPages)} total={routes.data.pagination.totalItems} pageSize={20} onPage={setPage} label="tuyến" />}
    </section>
  </AdminPage>
}
