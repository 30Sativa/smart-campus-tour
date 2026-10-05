import { useState } from 'react'
import { ArrowDownUp, MapPin, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { AdminErrorPanel, AdminPage, AdminStatusBadge, EmptyState, Notice, TableFrame } from '../../features/administration/AdminUi'
import { useDebouncedValue } from '../../features/administration/accounts/use-debounced-value'
import { poiRequestError } from '../../features/administration/pois/errors'
import { usePois } from '../../features/administration/pois/hooks'
import type { PoiSort, PoiSortField } from '../../features/administration/pois/types'
import { PageHeader, Pagination, PanelHead, SearchField, panelClass } from '../../components/ui/ConsolePrimitives'
import { buttonClass, rowClass, tdClass, thClass } from '../../components/ui/ui-classes'

const PAGE_SIZE = 20
type ActiveFilter = 'all' | 'active' | 'inactive'

export default function AdminPoisPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<PoiSort | ''>('name')
  const [page, setPage] = useState(1)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const pois = usePois({
    search: debouncedSearch || undefined,
    sort: sort || undefined,
    page,
    size: PAGE_SIZE,
    isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
  })
  const pageData = pois.data
  const totalPages = Math.max(pageData?.pagination.totalPages ?? 1, 1)

  const changeSort = (field: PoiSortField) => {
    setPage(1)
    setSort((current) => current === field ? `-${field}` : field)
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Danh mục POI"
        title="Quản lý POI"
        description="Tạo và cập nhật điểm tham quan. POI giữ nguyên mã định danh khi đổi nội dung hoặc pose."
        action={<Link to="/admin/pois/new" className={buttonClass('primary')}><Plus size={17} aria-hidden="true" />Tạo POI</Link>}
      />

      <div className="mb-4">
        <Notice tone="warn">Map và tọa độ hiển thị là dữ liệu cấu hình, chưa có trạng thái xác minh bằng robot thật. IsActive chỉ cho phép chọn POI khi chuẩn bị Route; không có nghĩa POI đã sẵn sàng điều hướng.</Notice>
      </div>

      {pois.isError ? (
        <AdminErrorPanel title={poiRequestError(pois.error, 'Không thể tải danh sách POI.')} onRetry={() => void pois.refetch()} />
      ) : (
        <section className={panelClass} aria-label="Danh sách POI">
          <PanelHead title="POI" description="Tìm theo tên/mô tả; sắp xếp và lọc theo trạng thái." />
          <div className="flex flex-col gap-3 border-b border-[#f1f5f9] p-4 lg:flex-row lg:items-center lg:justify-between">
            <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1) }} label="Tìm POI" placeholder="Tên hoặc mô tả…" className="w-full lg:max-w-md" />
            <div role="group" aria-label="Lọc trạng thái POI" className="flex gap-1.5">
              {([
                ['all', 'Tất cả'], ['active', 'Đang hoạt động'], ['inactive', 'Không khả dụng'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={activeFilter === value} onClick={() => { setActiveFilter(value); setPage(1) }} className={`min-h-9 rounded-lg px-3 text-[13px] font-semibold ${activeFilter === value ? 'bg-[#174b70] text-white' : 'border border-[#d9e9f5] bg-white text-[#54738a] hover:bg-[#f1f8fe]'}`}>{label}</button>
              ))}
            </div>
          </div>

          {pois.isPending ? (
            <div className="space-y-2 p-5" aria-busy="true" aria-label="Đang tải danh sách POI">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-[#f1f5f9] motion-reduce:animate-none" />)}</div>
          ) : pageData?.data.length === 0 ? (
            <EmptyState
              title={debouncedSearch || activeFilter !== 'all' ? 'Không tìm thấy POI phù hợp' : 'Chưa có POI nào'}
              description={debouncedSearch || activeFilter !== 'all' ? 'Thử điều chỉnh từ khóa hoặc bộ lọc.' : 'Tạo POI đầu tiên; POI mới mặc định không khả dụng cho đến khi Admin kích hoạt.'}
              action={!debouncedSearch && activeFilter === 'all' ? <Link to="/admin/pois/new" className={buttonClass('primary', 'sm')}><Plus size={15} aria-hidden="true" />Tạo POI</Link> : undefined}
            />
          ) : pageData ? (
            <>
              <TableFrame label="Danh sách POI" wide>
                <thead className="border-b border-[#f1f5f9] bg-[#f8fafc]"><tr>
                  <th scope="col" aria-sort={sort === 'name' ? 'ascending' : sort === '-name' ? 'descending' : 'none'} className={thClass}>
                    <button type="button" onClick={() => changeSort('name')} className="inline-flex items-center gap-1.5 hover:text-[#0f172a]">Tên <ArrowDownUp size={13} aria-hidden="true" /></button>
                  </th>
                  <th scope="col" className={thClass}>Map / frame</th>
                  <th scope="col" className={thClass}>Pose x · y · yaw</th>
                  <th scope="col" aria-sort={sort === 'isActive' ? 'ascending' : sort === '-isActive' ? 'descending' : 'none'} className={thClass}>
                    <button type="button" onClick={() => changeSort('isActive')} className="inline-flex items-center gap-1.5 hover:text-[#0f172a]">Trạng thái <ArrowDownUp size={13} aria-hidden="true" /></button>
                  </th>
                  <th scope="col" className={thClass}>Thao tác</th>
                </tr></thead>
                <tbody className="divide-y divide-[#f1f5f9]">{pageData.data.map((poi) => (
                  <tr key={poi.id} data-poi-id={poi.id} className={rowClass}>
                    <td className={`${tdClass} min-w-52`}><Link to={`/admin/pois/${poi.id}`} className="font-semibold text-[#1e293b] hover:text-[#2d719e] focus-visible:outline-2 focus-visible:outline-[#2563eb]">{poi.name}</Link><p className="mt-1 text-[11px] text-[#94a3b8]">ID giữ ổn định · pose chưa xác minh</p></td>
                    <td className={`${tdClass} text-xs text-[#475569]`}><p className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{poi.mapKey}</p><p className="mt-1 text-[#94a3b8]">{poi.mapFrame}</p></td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-xs tabular-nums text-[#475569]`}>{poi.x}, {poi.y}, {poi.yaw}</td>
                    <td className={tdClass}><AdminStatusBadge status={poi.isActive ? 'poi-active' : 'poi-inactive'} /></td>
                    <td className={tdClass}><Link to={`/admin/pois/${poi.id}`} className={buttonClass('secondary', 'sm')}>Mở</Link></td>
                  </tr>
                ))}</tbody>
              </TableFrame>
              <div className="px-4 py-2 text-xs text-[#64748b]" aria-live="polite">Trang {pageData.pagination.page} / {totalPages} · {pageData.pagination.totalItems} POI</div>
              <Pagination page={pageData.pagination.page} pageCount={totalPages} total={pageData.pagination.totalItems} pageSize={pageData.pagination.pageSize} onPage={setPage} label="Phân trang danh sách POI" />
            </>
          ) : null}
        </section>
      )}
    </AdminPage>
  )
}
